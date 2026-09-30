-- Step 88.5, after the deploy: documents go, all of them (Aalim,
-- 2026-09-29: no PDFs; the album replaces them, 20260930010000_album).
-- Applied once the new app is live, since the old one reads what this
-- drops.

-- 1. Each document becomes a photo in its person's album, waiting for
-- approval. Its file was copied into the `album` bucket first, re-encoded
-- (storage files can't be written from SQL), at `<tree>/<document id>.jpg`;
-- nothing here runs until every one was. The `documents` bucket is emptied
-- and removed through the Storage API afterwards, for the same reason.
do $$
begin
  if exists (
    select 1 from public.documents d
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'album'
        and o.name = d.tree_id::text || '/' || d.id::text || '.jpg'
    )
  ) then
    raise exception 'A document has not been copied into the album yet';
  end if;
end;
$$;

insert into public.album_photos (id, tree_id, created_by, file_path, created_at)
select d.id, d.tree_id, d.uploaded_by, d.tree_id::text || '/' || d.id::text || '.jpg', d.created_at
from public.documents d
on conflict (id) do nothing;

insert into public.album_tags (photo_id, person_id, created_at)
select d.id, d.person_id, d.created_at
from public.documents d
on conflict (photo_id, person_id) do nothing;

-- 2. The functions that looked at documents lose their lines: each keeps
-- the album's line 20260930010000 gave it. `claim_person` needed the
-- privileged flag only to move documents.
CREATE OR REPLACE FUNCTION private.can_delete_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.stories s
        where s.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.album_tags t
        join public.album_photos p on p.id = t.photo_id
        where t.person_id = p_person_id and p.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$function$;

CREATE OR REPLACE FUNCTION private.is_own_placeholder(p_person uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user is not null
    and exists (
      select 1 from public.people pe
      where pe.id = p_person and pe.created_by = p_user and pe.owner_user_id = p_user
    )
    and not exists (
      select 1 from public.relationships r
      where (r.from_person = p_person or r.to_person = p_person)
        and r.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.stories s
      where s.person_id = p_person and s.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.album_tags t
      join public.album_photos p on p.id = t.photo_id
      where t.person_id = p_person and p.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.pet_companions pc
      join public.pets pt on pt.id = pc.pet_id
      where pc.person_id = p_person
        and (pc.created_by is distinct from p_user or pt.created_by is distinct from p_user)
    )
    and not exists (
      select 1 from public.bloodline_anchors a
      where a.person_id = p_person and a.created_by is distinct from p_user
    )
    -- Placed on a tree by someone else, e.g. a Root bringing it over.
    and not exists (
      select 1 from public.tree_placements pl
      where pl.person_id = p_person and pl.placed_by is distinct from p_user
    )
    and not exists (
      select 1 from public.entry_revisions v
      where v.person_id = p_person and v.editor_user_id is distinct from p_user
    )
    and not exists (
      select 1 from public.claims c
      where c.person_id = p_person and c.claimant_user_id is distinct from p_user
    );
$function$;

CREATE OR REPLACE FUNCTION public.claim_person(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_creator uuid;
  v_died boolean;
  v_recent int;
  v_name_ok boolean;
  v_claim_id uuid;
  v_tree uuid;
  -- The placeholder's photo file and where it goes (Step 43).
  v_photo_from text;
  v_photo_to text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if v_self is null then
    raise exception 'Add your own entry before claiming another' using errcode = '42501';
  end if;
  if p_person_id = v_self then
    raise exception 'That is already your entry';
  end if;

  -- Claiming merges the member's own entry into this one and deletes it
  -- (below), which is only safe for a placeholder they made for themselves.
  -- An entry a relative made and they claimed, or one others have built on,
  -- is them on the tree: merging it would move their family onto whoever
  -- this is and delete them (Step 36).
  if not private.is_own_placeholder(v_self, v_uid) then
    raise exception 'Only a placeholder you added for yourself can be merged into another entry'
      using errcode = '42501';
  end if;

  select created_by, is_deceased or date_of_death is not null
    into v_creator, v_died
  from public.people where id = p_person_id;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;

  -- Both entries must sit on one tree the claimant belongs to.
  select pl.tree_id into v_tree
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
  where pl.person_id = p_person_id and pl.status = 'active'
    and private.is_placed(pl.tree_id, v_self)
  -- One that shows the whole entry first, if any does.
  order by pl.detail desc
  limit 1;
  if v_tree is null then
    raise exception 'That entry is on a different tree';
  end if;

  -- Someone who has died is nobody's own entry (Step 36).
  if v_died then
    raise exception 'That entry is marked as having died' using errcode = '42501';
  end if;

  if private.person_is_claimed(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles where self_person_id = p_person_id) then
    raise exception 'That entry already belongs to a member' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  select
    lower(btrim(pe.last_name)) = lower(btrim(s.last_name))
    and (
      (nullif(btrim(s.first_name), '') is not null
       and lower(btrim(s.first_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
      or
      (nullif(btrim(s.preferred_name), '') is not null
       and lower(btrim(s.preferred_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false) and not private.person_invited_to_claim(p_person_id) then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  -- Move the placeholder's lines onto the claimed entry, dropping any that
  -- would double up or point at itself.
  delete from public.relationships r
  where (r.from_person = v_self or r.to_person = v_self)
    and (
      (case when r.from_person = v_self then p_person_id else r.from_person end)
        = (case when r.to_person = v_self then p_person_id else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = v_self then p_person_id else from_person end,
      to_person = case when to_person = v_self then p_person_id else to_person end
  where from_person = v_self or to_person = v_self;

  update public.stories set person_id = p_person_id where person_id = v_self;
  -- The photos it's in (Step 88.5), but for those the claimed entry is in
  -- already.
  delete from public.album_tags t
  where t.person_id = v_self
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_person_id
    );
  update public.album_tags set person_id = p_person_id where person_id = v_self;
  update public.entry_reports set person_id = p_person_id where person_id = v_self;
  -- The placeholder's placements come along where the claimed entry has none.
  insert into public.tree_placements (tree_id, person_id, status, placed_by, responded_at)
  select pl.tree_id, p_person_id, pl.status, pl.placed_by, pl.responded_at
  from public.tree_placements pl
  where pl.person_id = v_self
  on conflict (tree_id, person_id) do nothing;
  -- A basic card of the claimed entry, on a tree their placeholder was on,
  -- shows in full from here: claiming it there is their yes (Step 83).
  perform private.claimed_shows_in_full(
    p_person_id,
    array(
      select pl.tree_id from public.tree_placements pl
      where pl.person_id = v_self and pl.status = 'active'
    ),
    v_uid
  );
  -- So do its companions, on every tree the claimed entry is on (a pet's
  -- people must be on its tree), staying their pet's first person where the
  -- placeholder was; deleting it would otherwise unlink them, and delete a
  -- pet it was the only person of.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_person_id, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = v_self and private.is_placed(pt.tree_id, p_person_id)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_person_id
  where pt.primary_person_id = v_self
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_person_id
    );
  -- And a bloodline it anchors: a founder's own entry anchors their tree's.
  update public.bloodline_anchors a
  set person_id = p_person_id
  where a.person_id = v_self
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_person_id
    );
  -- Its photo, where the claimed entry has none, framed as it was. Storage
  -- lets someone read a photo only if they can see the entry its path names
  -- (`<tree>/<entry>/<file>`), and the placeholder is about to go, so the
  -- claimed entry names the same file under its own id, and `claimPerson`
  -- moves the file there (Step 43). A photo kept anywhere but the
  -- placeholder's own folder stays behind.
  select stub.photo_path,
         split_part(stub.photo_path, '/', 1) || '/' || p_person_id::text || '/'
           || split_part(stub.photo_path, '/', 3)
    into v_photo_from, v_photo_to
  from public.people stub, public.people tgt
  where stub.id = v_self and tgt.id = p_person_id
    and tgt.photo_path is null
    and stub.photo_path ~ ('^[^/]+/' || v_self::text || '/[^/]+$');
  if v_photo_to is not null then
    update public.people tgt
    set photo_path = v_photo_to, photo_crop = stub.photo_crop
    from public.people stub
    where tgt.id = p_person_id and stub.id = v_self;
  end if;

  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;
  update public.people set owner_user_id = v_uid where id = p_person_id;

  delete from public.people where id = v_self;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person_id, v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative. If this looks wrong, you can dispute it.',
    -- In an inbox whoever added the entry has (Step 83).
    case
      when exists (
        select 1 from public.tree_members m
        where m.tree_id = v_tree and m.user_id = v_creator
      ) then v_tree
      else private.home_tree(p_person_id)
    end
  );

  -- `photo_from` and `photo_to` are the move `claimPerson` makes, or null.
  return jsonb_build_object(
    'claim_id', v_claim_id,
    'person_id', p_person_id,
    'photo_from', v_photo_from,
    'photo_to', v_photo_to
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.merge_invited_entry(p_invited uuid, p_own uuid, p_tree uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_invited public.people;
  v_own public.people;
begin
  select * into v_invited from public.people where id = p_invited;
  select * into v_own from public.people where id = p_own;
  if v_invited.id is null or v_own.id is null or p_invited = p_own
     or not exists (
       select 1 from public.profiles pr
       where pr.auth_user_id = v_uid and pr.self_person_id = p_own
     ) then
    return false;
  end if;

  -- Someone who has died is nobody's own entry (Steps 36 and 37).
  if v_invited.is_deceased or v_invited.date_of_death is not null
     or v_own.is_deceased or v_own.date_of_death is not null then
    return false;
  end if;

  -- A stand-in its maker added and nobody else has built on, spoken for by
  -- nobody, shown on this tree alone: folding it in loses nobody's work and
  -- moves nothing onto a tree they didn't agree to.
  if not private.person_is_claimable(p_invited)
     or not private.is_own_placeholder(p_invited, v_invited.created_by)
     or not private.is_placed(p_tree, p_invited)
     or exists (
       select 1 from public.tree_placements pl
       where pl.person_id = p_invited and pl.tree_id <> p_tree
     ) then
    return false;
  end if;

  -- Plainly someone else: a relative of theirs (a parent with the same name),
  -- or born more than a year apart.
  if exists (
       select 1 from public.relationships r
       where (r.from_person = p_invited and r.to_person = p_own)
          or (r.from_person = p_own and r.to_person = p_invited)
     )
     or abs(extract(year from v_invited.date_of_birth) - extract(year from v_own.date_of_birth)) > 1 then
    return false;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  -- Theirs sits where the invited entry sat on this canvas, unless it's
  -- there already. A placement a Root asked for and they hadn't answered
  -- becomes active, keeping that Root as `placed_by` (as Step 30.9 does).
  if not private.is_placed_in_full(p_tree, p_own) then
    insert into public.tree_placements as tp
      (tree_id, person_id, status, placed_by, responded_at, pos_x, pos_y, pos_dx, pos_dy)
    select p_tree, p_own, 'active', v_uid, now(), pl.pos_x, pl.pos_y, pl.pos_dx, pl.pos_dy
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_invited
    on conflict (tree_id, person_id) do update
      set status = 'active', responded_at = now(),
          approval = case when tp.approval = 'none' then 'none' else 'approved' end,
          answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end,
          pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          pos_dx = excluded.pos_dx, pos_dy = excluded.pos_dy;
  end if;

  -- Its lines move onto theirs, dropping any that would double up or point
  -- at itself (as `claim_person` does).
  delete from public.relationships r
  where (r.from_person = p_invited or r.to_person = p_invited)
    and (
      (case when r.from_person = p_invited then p_own else r.from_person end)
        = (case when r.to_person = p_invited then p_own else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = p_invited then p_own else from_person end,
      to_person = case when to_person = p_invited then p_own else to_person end
  where from_person = p_invited or to_person = p_invited;

  update public.stories set person_id = p_own where person_id = p_invited;
  -- The photos it's in (Step 88.5), but for those theirs is in already.
  delete from public.album_tags t
  where t.person_id = p_invited
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_own
    );
  update public.album_tags set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;

  -- Its companions, staying their pet's first person where it was.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_own, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = p_invited and private.is_placed(pt.tree_id, p_own)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_own
  where pt.primary_person_id = p_invited
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_own
    );

  -- And a bloodline it anchors.
  update public.bloodline_anchors a
  set person_id = p_own
  where a.person_id = p_invited
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_own
    );

  delete from public.people where id = p_invited;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := private.utc_day(now());
  -- The last seven days, today included; the seven before them; the last 30.
  v_week_start date := v_today - 6;
  v_prev_start date := v_today - 13;
  v_month_start date := v_today - 29;
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'members', (select count(*) from public.profiles),
    'members_new', (
      select count(*) from public.profiles p
      where private.utc_day(p.created_at) >= v_week_start),
    'active_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_week_start),
    'active_prev_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_prev_start and a.day < v_week_start),
    'active_30', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_month_start),
    'entries', (select count(*) from public.people),
    'entries_new', (
      select count(*) from public.people p
      where private.utc_day(p.created_at) >= v_week_start),

    -- Twelve weeks, oldest first.
    'weeks', (
      select jsonb_agg(jsonb_build_object(
          'end', w.last_day,
          'active', (
            select count(distinct a.user_id) from private.active_days a
            where a.day between w.last_day - 6 and w.last_day),
          'joined', (
            select count(*) from public.profiles p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day),
          'entries', (
            select count(*) from public.people p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day))
        order by w.last_day)
      from (select v_today - 7 * g as last_day from generate_series(0, 11) g) w),

    -- How many members have done each thing at least once.
    'progress', jsonb_build_object(
      'own_entry', (
        select count(*) from public.profiles p where p.self_person_id is not null),
      'added_relative', (
        select count(distinct e.created_by)
        from public.people e
        join public.profiles p on p.auth_user_id = e.created_by
        where e.id is distinct from p.self_person_id),
      'invited', (
        select count(distinct s.user_id)
        from (
          -- An invite sent by email, or a request for access let in.
          select q.reviewed_by as user_id from public.invite_requests q
          where q.status = 'approved'
          union all
          -- Any link still out: family, founder, or an older bare one.
          select i.created_by from public.invites i
        ) s
        join public.profiles p on p.auth_user_id = s.user_id),
      'came_back', (
        select count(*) from (
          select a.user_id from private.active_days a
          group by a.user_id
          having count(*) >= 2) s)),

    -- What was done, by kind: in the last seven days, the seven before,
    -- and ever. A kind nothing has happened to is left out.
    'activity', (
      select coalesce(jsonb_object_agg(k.kind, k.counts), '{}'::jsonb)
      from (
        select e.kind, jsonb_build_object(
            'last_7', count(*) filter (where e.day >= v_week_start),
            'prev_7', count(*) filter (
              where e.day >= v_prev_start and e.day < v_week_start),
            'total', count(*)) as counts
        from (
          select 'entries' as kind, private.utc_day(p.created_at) as day
          from public.people p
          union all select 'connections', private.utc_day(r.created_at)
          from public.relationships r
          union all select 'photos', private.utc_day(o.created_at)
          from storage.objects o where o.bucket_id = 'photos'
          union all select 'album', private.utc_day(a.created_at)
          from public.album_photos a
          union all select 'stories', private.utc_day(s.created_at)
          from public.stories s
          union all select 'story_comments', private.utc_day(c.created_at)
          from public.story_comments c
          union all select 'comments', private.utc_day(c.created_at)
          from public.pet_comments c
          union all select 'companions', private.utc_day(p.created_at)
          from public.pets p
          union all select 'claims', private.utc_day(c.created_at)
          from public.claims c
          union all select 'invites', private.utc_day(coalesce(q.reviewed_at, q.created_at))
          from public.invite_requests q where q.status = 'approved'
          union all select 'joins', private.utc_day(m.created_at)
          from public.tree_members m
          union all select 'access_requests', private.utc_day(q.created_at)
          from public.invite_requests q where q.source is distinct from 'direct'
          union all select 'tree_requests', private.utc_day(q.created_at)
          from public.tree_requests q
          union all select 'relayed_asks', private.utc_day(r.created_at)
          from public.invite_relays r
        ) e
        group by e.kind
      ) k),

    -- Each tree, oldest first. Its members' days count wherever they
    -- spent them; its entries are what it shows, from other trees too.
    'trees', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'founded', private.utc_day(t.created_at),
          'members', (
            select count(*) from public.tree_members m where m.tree_id = t.id),
          'active_7', (
            select count(distinct m.user_id)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id and a.day >= v_week_start),
          'entries', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'),
          'added_7', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'
              and private.utc_day(pl.created_at) >= v_week_start),
          'last_active', (
            select max(a.day)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id))
        order by t.created_at), '[]'::jsonb)
      from public.trees t)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.remove_tree_member(p_tree uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_root uuid := (select auth.uid());
  v_role text;
  v_last boolean;
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
begin
  if v_root is null or not private.is_root_of(p_tree) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = v_root then
    raise exception 'cannot remove yourself' using errcode = '22023';
  end if;
  select role into v_role from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  if v_role is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if v_role = 'admin' then
    raise exception 'ROOT_IS_PERMANENT: cannot remove a Root' using errcode = '22023';
  end if;

  update public.people set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.people set owner_user_id = v_root where owner_user_id = p_user_id and tree_id = p_tree;
  update public.relationships set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.invites set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.share_links set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pets set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pet_companions pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;
  update public.pet_comments pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;

  -- Who placed a card, and the membership itself, change only as a
  -- privileged write (tree_placements_guard, tree_members_guard).
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.tree_placements set placed_by = v_root where placed_by = p_user_id and tree_id = p_tree;
  delete from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

  select not exists (select 1 from public.tree_members where user_id = p_user_id) into v_last;
  if v_last then
    -- Anything left elsewhere (nothing, if every home was this tree) is
    -- reassigned by the caller before the auth user goes.
    update public.people set created_by = v_root where created_by = p_user_id;
    update public.people set owner_user_id = v_root where owner_user_id = p_user_id;
    update public.relationships set created_by = v_root where created_by = p_user_id;
    update public.invites set created_by = v_root where created_by = p_user_id;
    update public.share_links set created_by = v_root where created_by = p_user_id;
    update public.pets set created_by = v_root where created_by = p_user_id;
    update public.pet_companions set created_by = v_root where created_by = p_user_id;
    update public.pet_comments set created_by = v_root where created_by = p_user_id;
    update public.trees set created_by = null where created_by = p_user_id;
    -- A card they placed on a tree they had already left keeps its place,
    -- with nobody recorded as placing it (on delete set null).
    delete from public.profiles where auth_user_id = p_user_id;
  end if;
  return v_last;
end;
$function$;

-- 3. The documents themselves, their storage rules and the rules they read.
drop policy storage_documents_select on storage.objects;
drop policy storage_documents_insert on storage.objects;
drop policy storage_documents_update on storage.objects;
drop policy storage_documents_delete on storage.objects;
drop table public.documents;
drop function private.can_see_document(uuid);
drop function private.can_see_documents(uuid);
drop function private.can_write_document(uuid, uuid);
drop function private.document_rule_in(uuid, uuid);
drop function private.documents_guard();
