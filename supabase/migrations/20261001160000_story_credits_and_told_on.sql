-- Step 99: stories carry credit and a date.
--
-- Aalim asked (2026-10-01): a story can be written in Markdown or uploaded as
-- a Markdown file (the app's work; the text column holds it as it is), and
-- people on the tree can be tagged in it as its **storyteller** or its
-- **interviewer**, with an optional **date the story was told**.
--
--   * `stories.told_on` / `told_on_precision`: when it was told, kept as much
--     as is known, as a person's dates are ("1985" is 1985-01-01 at 'year').
--   * `story_credits`: who the story is credited to and as what. Several
--     people each; one person may hold both. Told once, with the story; they
--     need no yes of their own (the story's approver sees them with it).
--   * `add_story` takes them; the sheet's list and the public page read them
--     back; a claim or a merge carries a placeholder's credits across.
--
-- Additive: the four-argument tail of `add_story` is dropped so a call
-- naming only the old arguments finds the new one, and the list functions
-- only gain columns. The code before this keeps working.

-- 1. When it was told.
alter table public.stories
  add column told_on date,
  add column told_on_precision text;

alter table public.stories
  add constraint stories_told_on_check check (
    (told_on is null and told_on_precision is null)
    or (
      told_on is not null
      and told_on_precision is not null
      and told_on_precision in ('day', 'month', 'year')
      and told_on >= date '1000-01-01'
      and (told_on_precision = 'day' or extract(day from told_on) = 1)
      and (told_on_precision <> 'year' or extract(month from told_on) = 1)
    )
  );

-- 2. The credits.
create table public.story_credits (
  story_id uuid not null references public.stories (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (story_id, person_id, role),
  constraint story_credits_role_check check (role in ('storyteller', 'interviewer'))
);

create index story_credits_person_idx on public.story_credits (person_id);

alter table public.story_credits enable row level security;

-- Written only through `add_story`; read by whoever reads the story.
revoke all on table public.story_credits from anon, authenticated, public;
grant select on table public.story_credits to authenticated;
grant all on table public.story_credits to service_role;

create policy story_credits_select on public.story_credits
  for select to authenticated
  using (
    exists (select 1 from public.stories s where s.id = story_credits.story_id)
  );

-- 3. Telling one takes its date and its credits. The six-argument version
-- goes, so a call naming only those finds this one.
drop function public.add_story(uuid, uuid, text, text, text, integer);

create function public.add_story(
  p_person uuid,
  p_tree uuid,
  p_title text,
  p_body text,
  p_audio_path text default null,
  p_audio_seconds integer default null,
  p_told_on date default null,
  p_told_precision text default null,
  p_storytellers uuid[] default '{}',
  p_interviewers uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_path text := nullif(btrim(coalesce(p_audio_path, '')), '');
  v_tellers uuid[] := array(
    select distinct x from unnest(coalesce(p_storytellers, '{}'::uuid[])) as x where x is not null
  );
  v_askers uuid[] := array(
    select distinct x from unnest(coalesce(p_interviewers, '{}'::uuid[])) as x where x is not null
  );
  v_told date := p_told_on;
  v_precision text := case when p_told_on is null then null else coalesce(p_told_precision, 'day') end;
  v_approved boolean;
  v_home uuid;
  v_owner uuid;
  v_self uuid;
  v_tree uuid;
  v_name text;
  v_label text;
  v_id uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_body is null and v_path is null then
    raise exception 'STORY: nothing to tell' using errcode = '22023';
  end if;
  if length(v_title) > 120 or length(v_body) > 20000 then
    raise exception 'STORY: longer than a story may be' using errcode = '22001';
  end if;
  if cardinality(v_tellers) > 10 or cardinality(v_askers) > 10 then
    raise exception 'STORY: too many people' using errcode = '22023';
  end if;
  if v_told is not null then
    if v_precision not in ('day', 'month', 'year') then
      raise exception 'STORY: not a date told' using errcode = '22023';
    end if;
    -- Kept on the first day of as much of it as is known.
    v_told := case v_precision
      when 'year' then date_trunc('year', v_told)::date
      when 'month' then date_trunc('month', v_told)::date
      else v_told
    end;
    -- A day ahead: somewhere, it's already tomorrow.
    if v_told > current_date + 1 then
      raise exception 'STORY: told after today' using errcode = '22023';
    end if;
  end if;
  if not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, p_person)) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(v_tellers || v_askers) as x
    where not private.is_placed_in_full(p_tree, x)
  ) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;
  if v_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'stories'
      and o.name = v_path
      and o.owner_id = v_uid::text
      and (storage.foldername(o.name))[1] = p_person::text
  ) then
    raise exception 'STORY: that recording didn''t arrive' using errcode = '22023';
  end if;

  v_approved := private.can_approve_story(p_person);
  insert into public.stories
    (person_id, tree_id, created_by, title, body, audio_path, audio_seconds,
     told_on, told_on_precision, status, decided_at, decided_by)
  values (
    p_person, p_tree, v_uid, v_title, v_body, v_path,
    case when p_audio_seconds >= 0 then p_audio_seconds end,
    v_told, v_precision,
    case when v_approved then 'approved' else 'pending' end,
    case when v_approved then now() end,
    case when v_approved then v_uid end
  )
  returning id into v_id;

  insert into public.story_credits (story_id, person_id, role)
  select v_id, x, 'storyteller' from unnest(v_tellers) as x
  union all
  select v_id, x, 'interviewer' from unnest(v_askers) as x;

  if not v_approved then
    v_name := coalesce(private.member_label(v_uid), 'A relative');
    v_self := private.story_owner(p_person);
    select tree_id, owner_user_id into v_home, v_owner
    from public.people where id = p_person;

    if v_self is not null then
      -- Asked of the person themself, on a tree of theirs that shows them:
      -- this one if they're on it.
      select pl.tree_id into v_tree
      from public.tree_placements pl
      join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_self
      where pl.person_id = p_person and pl.status = 'active' and pl.detail = 'full'
      order by (pl.tree_id = p_tree) desc, (pl.tree_id = v_home) desc
      limit 1;
      perform private.notify(
        v_self, v_uid, 'story_to_approve', p_person, null,
        v_name || ' added a story about you, waiting for your approval.',
        coalesce(v_tree, v_home)
      );
    else
      -- Asked of whoever can edit it: its owner, the Roots of its home tree
      -- and the Branches there who tend it, as a suggested change is (Step 68).
      v_label := private.person_label(p_person);
      for v_recipient in
        select v_owner
        union
        select m.user_id from public.tree_members m
        where m.tree_id = v_home and m.role = 'admin'
        union
        select b.user_id from private.tending_branches(p_person) as b(user_id)
      loop
        perform private.notify(
          v_recipient, v_uid, 'story_to_approve', p_person, null,
          v_name || ' added a story about ' || v_label || ', waiting for your approval.',
          v_home
        );
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_approved then 'approved' else 'pending' end
  );
end;
$$;

revoke all on function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[]) from public, anon;
grant execute on function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[]) to authenticated;

-- 4. The sheet's list gains when each story was told and who it's credited
-- to. New columns, so the function is made again.
drop function public.entry_stories(uuid);

create function public.entry_stories(p_person uuid)
returns table (
  id uuid,
  title text,
  body text,
  audio_path text,
  audio_seconds integer,
  status text,
  created_at timestamptz,
  created_by uuid,
  told_by text,
  can_decide boolean,
  comment_count integer,
  shared boolean,
  can_share boolean,
  can_stop_sharing boolean,
  my_link text,
  told_on date,
  told_on_precision text,
  credits jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.title, s.body, s.audio_path, s.audio_seconds, s.status,
    s.created_at, s.created_by, private.member_label(s.created_by),
    s.status = 'pending' and private.can_approve_story(s.person_id),
    (select count(*)::integer from public.story_comments c where c.story_id = s.id),
    s.status = 'approved' and private.story_shared(s.id),
    x.can_share,
    s.status = 'approved' and private.can_stop_story_links(s.id),
    case when x.can_share then (
      select l.token from public.story_links l
      where l.story_id = s.id
        and l.created_by = (select auth.uid())
        and l.revoked_at is null
    ) end,
    s.told_on, s.told_on_precision,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', c.person_id, 'name', private.person_label(c.person_id), 'role', c.role)
          order by c.role desc, private.person_label(c.person_id)
        )
        from public.story_credits c
        where c.story_id = s.id
      ),
      '[]'::jsonb
    )
  from public.stories s
  cross join lateral (select private.can_share_story(s.id) as can_share) x
  where s.person_id = p_person
  order by s.created_at desc;
$$;

revoke all on function public.entry_stories(uuid) from public, anon;
grant execute on function public.entry_stories(uuid) to authenticated;

-- 5. The public page reads them too (service role alone, as before).
drop function public.shared_story(text);

create function public.shared_story(p_token text)
returns table (
  story_id uuid,
  person_name text,
  shared_by text,
  title text,
  body text,
  audio_path text,
  audio_seconds integer,
  told_on date,
  told_on_precision text,
  credits jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, private.person_label(s.person_id),
    coalesce(private.member_label(l.created_by), 'A relative'),
    s.title, s.body, s.audio_path, s.audio_seconds,
    s.told_on, s.told_on_precision,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', c.person_id, 'name', private.person_label(c.person_id), 'role', c.role)
          order by c.role desc, private.person_label(c.person_id)
        )
        from public.story_credits c
        where c.story_id = s.id
      ),
      '[]'::jsonb
    )
  from public.story_links l
  join public.stories s on s.id = l.story_id
  where l.token = p_token
    and l.revoked_at is null
    and private.story_link_live(l.story_id, l.created_by);
$$;

revoke all on function public.shared_story(text) from public, anon, authenticated;
grant execute on function public.shared_story(text) to service_role;

-- 6. A claim, or a merge of an invited entry, carries credits across with
-- the stories (the two functions are made again from 20260930020000, with
-- one more step each).
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
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = v_self
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_person_id
    );
  update public.story_credits set person_id = p_person_id where person_id = v_self;
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
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = p_invited
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_own
    );
  update public.story_credits set person_id = p_own where person_id = p_invited;
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
