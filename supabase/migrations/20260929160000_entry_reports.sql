-- Step 88.2: report a problem with an entry.
--
-- A flag used to be a comment on the entry's board with a tick-box, and every
-- member of the tree read it. A report now has a table of its own, and Aalim's
-- rule (2026-09-29): it is seen only by whoever can fix it, and by whoever
-- raised it.
--   * A problem with the details: the entry's editors (`can_edit_person`,
--     which takes in the Roots of its home tree).
--   * A dispute of who claimed the entry, which used to be a claim status of
--     its own: the Roots of its home tree, who decide it.
-- The claim stays `approved` while its dispute is open, so nobody else learns
-- of it from the claim either.
--
-- Additive: the deployed app still uses the board's flags, `dispute_claim` and
-- `resolve_claim` until the new one is live; 20260929170000 retires them.

-- 1. The reports.
create table public.entry_reports (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- The tree it was raised on, whose inbox its reporter hears back in.
  tree_id uuid references public.trees (id) on delete set null,
  -- Set when it disputes this claim rather than the entry's details.
  claim_id uuid references public.claims (id) on delete cascade,
  -- Kept for whoever fixes it when its reporter's account goes.
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (auth_user_id) on delete set null,
  constraint entry_reports_body_check
    check (length(btrim(body)) between 1 and 1000),
  constraint entry_reports_status_check
    check (status in ('open', 'resolved')),
  constraint entry_reports_resolved
    check ((status = 'open') = (resolved_at is null))
);

-- One open dispute of a claim at a time.
create unique index entry_reports_one_open_dispute
  on public.entry_reports (claim_id)
  where status = 'open' and claim_id is not null;
create index entry_reports_person_idx on public.entry_reports (person_id);
create index entry_reports_tree_idx on public.entry_reports (tree_id);
create index entry_reports_created_by_idx on public.entry_reports (created_by);
create index entry_reports_resolved_by_idx on public.entry_reports (resolved_by);

create trigger entry_reports_set_updated_at
  before update on public.entry_reports
  for each row execute function private.set_updated_at();

alter table public.entry_reports enable row level security;

-- Written only through the functions below; its reporter may withdraw one.
revoke all on table public.entry_reports from anon, authenticated, public;
grant select, delete on table public.entry_reports to authenticated;
grant all on table public.entry_reports to service_role;

create policy entry_reports_select on public.entry_reports
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or case
      when claim_id is null
        then (select private.can_edit_person(entry_reports.person_id))
      else (select private.is_root_of(private.home_tree(entry_reports.person_id)))
    end
  );

-- Withdrawing: the reporter, while it's still open.
create policy entry_reports_delete on public.entry_reports
  for delete to authenticated
  using (created_by = (select auth.uid()) and status = 'open');

-- 2. Raising one. A member of a tree the entry is shown on in full; a
-- dispute only by whoever added the entry, of its approved claim, as
-- `dispute_claim` allowed.
create or replace function public.report_entry(
  p_person uuid,
  p_tree uuid,
  p_body text,
  p_dispute boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_home uuid;
  v_owner uuid;
  v_creator uuid;
  v_claim uuid;
  v_claimant uuid;
  v_label text;
  v_name text;
  v_id uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if length(v_body) = 0 then
    raise exception 'REPORT: say what''s wrong' using errcode = '22023';
  end if;
  if length(v_body) > 1000 then
    raise exception 'REPORT: longer than a report may be' using errcode = '22001';
  end if;
  if not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, p_person)) then
    raise exception 'REPORT: not on your tree' using errcode = '42501';
  end if;

  select tree_id, owner_user_id, created_by into v_home, v_owner, v_creator
  from public.people where id = p_person;
  if v_home is null then
    raise exception 'REPORT: that entry no longer exists' using errcode = '42501';
  end if;
  v_label := private.person_label(p_person);

  if p_dispute then
    if v_creator is distinct from v_uid then
      raise exception 'REPORT: only whoever added it disputes the claim'
        using errcode = '42501';
    end if;
    select c.id, c.claimant_user_id into v_claim, v_claimant
    from public.claims c
    where c.person_id = p_person and c.status = 'approved'
    order by c.created_at desc
    limit 1;
    if v_claim is null then
      raise exception 'REPORT: no claim to dispute' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.entry_reports r
      where r.claim_id = v_claim and r.status = 'open'
    ) then
      raise exception 'REPORT: already disputed' using errcode = '23505';
    end if;

    insert into public.entry_reports (person_id, tree_id, claim_id, created_by, body)
    values (p_person, p_tree, v_claim, v_uid, v_body)
    returning id into v_id;

    -- Said as `dispute_claim` said it.
    perform private.notify(
      v_claimant, v_uid, 'claim_disputed', p_person, v_claim,
      'Your claim on ' || v_label || ' was disputed and is now with a Root.',
      v_home
    );
    for v_recipient in
      select user_id from public.tree_members where tree_id = v_home and role = 'admin'
    loop
      perform private.notify(
        v_recipient, v_uid, 'claim_disputed', p_person, v_claim,
        'A claim on ' || v_label || ' is disputed and needs a Root''s decision.',
        v_home
      );
    end loop;
    return v_id;
  end if;

  insert into public.entry_reports (person_id, tree_id, created_by, body)
  values (p_person, p_tree, v_uid, v_body)
  returning id into v_id;

  -- Told: whoever owns the entry, the Roots of its home tree and the
  -- Branches there who tend it, as a suggested change is asked (Step 68).
  v_name := coalesce(private.member_label(v_uid), 'A relative');
  for v_recipient in
    select v_owner
    union
    select m.user_id from public.tree_members m
    where m.tree_id = v_home and m.role = 'admin'
    union
    select b.user_id from private.tending_branches(p_person) as b(user_id)
  loop
    perform private.notify(
      v_recipient, v_uid, 'entry_flagged', p_person, null,
      v_name || ' reported a problem with ' || v_label || ': ' || left(v_body, 140),
      v_home
    );
  end loop;
  return v_id;
end;
$$;

revoke all on function public.report_entry(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.report_entry(uuid, uuid, text, boolean) to authenticated;

-- 3. Fixed: whoever may edit the entry marks a report on its details
-- resolved, and its reporter is told.
create or replace function public.resolve_entry_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_report public.entry_reports%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_report from public.entry_reports where id = p_report;
  if not found or v_report.status <> 'open' then
    raise exception 'REPORT: already resolved' using errcode = '22023';
  end if;
  if v_report.claim_id is not null then
    raise exception 'REPORT: a Root decides a dispute' using errcode = '42501';
  end if;
  if not private.can_edit_person(v_report.person_id) then
    raise exception 'REPORT: not yours to resolve' using errcode = '42501';
  end if;

  update public.entry_reports
  set status = 'resolved', resolved_at = now(), resolved_by = v_uid
  where id = p_report;

  perform private.notify(
    v_report.created_by, v_uid, 'flag_resolved', v_report.person_id, null,
    'Your report on ' || private.person_label(v_report.person_id) || ' was resolved.',
    v_report.tree_id
  );
end;
$$;

revoke all on function public.resolve_entry_report(uuid) from public, anon;
grant execute on function public.resolve_entry_report(uuid) to authenticated;

-- 4. A dispute decided by a Root of the entry's home tree: upheld, the
-- claim stands; reversed, the entry goes back to whoever added it, as
-- `resolve_claim` did.
create or replace function public.decide_claim_dispute(p_report uuid, p_uphold boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_report public.entry_reports%rowtype;
  v_person uuid;
  v_claimant uuid;
  v_claim_status text;
  v_creator uuid;
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_report from public.entry_reports where id = p_report;
  if not found or v_report.claim_id is null then
    raise exception 'REPORT: no such dispute' using errcode = '22023';
  end if;

  select c.person_id, c.claimant_user_id, c.status, pe.created_by, pe.tree_id
    into v_person, v_claimant, v_claim_status, v_creator, v_tree
  from public.claims c
  join public.people pe on pe.id = c.person_id
  where c.id = v_report.claim_id;

  if not private.is_root_of(v_tree) then
    raise exception 'Roots only' using errcode = '42501';
  end if;
  if v_report.status <> 'open' then
    raise exception 'REPORT: already decided' using errcode = '22023';
  end if;

  update public.entry_reports
  set status = 'resolved', resolved_at = now(), resolved_by = v_uid
  where id = p_report;

  -- A claim undone some other way meanwhile leaves nothing to decide.
  if v_claim_status <> 'approved' then
    return;
  end if;

  if p_uphold then
    perform private.notify(
      v_claimant, v_uid, 'claim_upheld', v_person, v_report.claim_id,
      'A Root upheld your claim on ' || private.person_label(v_person) || '.', v_tree
    );
    perform private.notify(
      v_creator, v_uid, 'claim_upheld', v_person, v_report.claim_id,
      'A Root upheld the claim on ' || private.person_label(v_person) || '.', v_tree
    );
  else
    update public.claims set status = 'rejected', resolved_at = now(), resolved_by = v_uid
    where id = v_report.claim_id;
    update public.people set owner_user_id = created_by where id = v_person;
    update public.profiles set self_person_id = null
    where auth_user_id = v_claimant and self_person_id = v_person;
    -- What the claim opened on other trees closes again (Step 83).
    perform private.claim_undone_shows_basic(v_person, v_claimant);

    perform private.notify(
      v_claimant, v_uid, 'claim_reversed', v_person, v_report.claim_id,
      'A Root reversed your claim on ' || private.person_label(v_person)
        || '. Re-add your own entry from onboarding if needed.', v_tree
    );
    perform private.notify(
      v_creator, v_uid, 'claim_reversed', v_person, v_report.claim_id,
      'A Root reversed the claim on ' || private.person_label(v_person)
        || '. You have edit rights again.', v_tree
    );
  end if;
end;
$$;

revoke all on function public.decide_claim_dispute(uuid, boolean) from public, anon;
grant execute on function public.decide_claim_dispute(uuid, boolean) to authenticated;

-- 5. A placeholder merged into the entry it stood for takes its reports
-- along, as it does its comments: `claim_person` (Step 83's body) and
-- `private.merge_invited_entry` (Step 80's), each one line longer.

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
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
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

  update public.entry_comments set person_id = p_person_id where person_id = v_self;
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

  -- Its documents, now that the claimed entry is theirs. A document changes
  -- entries only inside a merge, under the privileged flag (as
  -- `merge_invited_entry` does), and its tree never changes
  -- (`documents_guard`). It stops being shared across trees: the claimed
  -- entry may be shown on trees the placeholder never was. They can share it
  -- again, as its person (Step 43).
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.documents
  set person_id = p_person_id, shared_across_trees = false
  where person_id = v_self;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

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

  -- Its notes stay on this tree's board, and its documents in this tree's
  -- bank: not shared across trees, since theirs is shown on others.
  update public.entry_comments set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;
  update public.documents
  set person_id = p_own, shared_across_trees = false
  where person_id = p_invited;

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
