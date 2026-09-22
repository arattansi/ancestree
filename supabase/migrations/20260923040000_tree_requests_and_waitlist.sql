-- Step 28 — The homepage's calls to action.
--
-- Signed in, a member can ask to start a tree of their own; signed out,
-- anyone can join a waitlist to start one, or look for their family's tree
-- before asking to join it. During the beta a new tree is by request, and
-- one reviewer answers every request.
--
-- 1. `private.beta_reviewers` — who answers requests to start a tree. Keyed
--    by sign-in address, like `private.admin_allowlist`; seeded with the
--    build owner. Add a row to share the queue.
-- 2. `public.tree_requests` — one row per ask: a member's (`user_id` set) or
--    a waitlist sign-up's (`user_id` null: a name and an address). Pending,
--    then approved or declined by a reviewer. A member's approval is their
--    permission to found a tree; a sign-up's approval sends them a founder
--    invite, which is theirs.
-- 3. `public.found_tree` needs that permission now. A Root's founder invite
--    is unchanged: the invite is the permission.
-- 4. `request_tree` / `my_tree_request` — a member asks, and reads where
--    their ask stands, without seeing anyone else's.
-- 5. `trees_matching_name` — the public "request access" search: the trees
--    that show a living, unclaimed entry strongly matching a typed name.
--    Service role only, and it returns trees, never people.
-- 6. `tree_request_approved` — the member's notification, raised by a
--    trigger when their request is approved.

-- ---------------------------------------------------------------------------
-- 1. Beta reviewers
-- ---------------------------------------------------------------------------
create table private.beta_reviewers (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

revoke all on table private.beta_reviewers from anon, authenticated, public;

insert into private.beta_reviewers (email, note) values
  ('rattansi.aalim@gmail.com', 'Ancestree build owner')
on conflict (email) do nothing;

-- The signed-in caller answers requests to start a tree.
create or replace function private.is_beta_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.beta_reviewers r
    where lower(r.email) = lower(private.current_email())
  );
$$;

revoke all on function private.is_beta_reviewer() from anon, public;
grant execute on function private.is_beta_reviewer() to authenticated, service_role;

create or replace function public.is_beta_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_beta_reviewer();
$$;

revoke all on function public.is_beta_reviewer() from anon, public;
grant execute on function public.is_beta_reviewer() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Requests to start a tree
-- ---------------------------------------------------------------------------
create table public.tree_requests (
  id uuid primary key default gen_random_uuid(),
  -- The member asking; null for a waitlist sign-up, who has no account yet.
  user_id uuid references public.profiles (auth_user_id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles (auth_user_id) on delete set null,
  reviewed_at timestamptz,
  -- A sign-up's founder invite, once they're approved.
  invite_id uuid references public.invites (id) on delete set null,
  -- Whether the approval email left the building.
  email_sent boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open ask each: per member, and per address on the waitlist.
create unique index tree_requests_one_pending_member
  on public.tree_requests (user_id)
  where status = 'pending' and user_id is not null;
create unique index tree_requests_one_pending_email
  on public.tree_requests (lower(email))
  where status = 'pending' and user_id is null;

create index tree_requests_user_idx on public.tree_requests (user_id);
create index tree_requests_reviewed_by_idx on public.tree_requests (reviewed_by);
create index tree_requests_invite_idx on public.tree_requests (invite_id);

create trigger tree_requests_set_updated_at
  before update on public.tree_requests
  for each row execute function private.set_updated_at();

alter table public.tree_requests enable row level security;

-- A reviewer sees every ask; a member sees their own.
create policy tree_requests_select on public.tree_requests for select to authenticated
  using ((select private.is_beta_reviewer()) or user_id = (select auth.uid()));
-- Only a reviewer answers one, or clears it away.
create policy tree_requests_update on public.tree_requests for update to authenticated
  using ((select private.is_beta_reviewer()))
  with check ((select private.is_beta_reviewer()));
create policy tree_requests_delete on public.tree_requests for delete to authenticated
  using ((select private.is_beta_reviewer()));
-- No insert policy: a member asks through `request_tree`, and the waitlist
-- is written by the server with the service role.

revoke all on table public.tree_requests from anon, public;
grant select, update, delete on table public.tree_requests to authenticated;
grant all on table public.tree_requests to service_role;

-- ---------------------------------------------------------------------------
-- 3. Founding a tree needs the permission
-- ---------------------------------------------------------------------------
-- A reviewer may always; anyone else once a reviewer has approved them.
create or replace function private.may_found_tree()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_beta_reviewer()
    or exists (
      select 1 from public.tree_requests r
      where r.user_id = (select auth.uid()) and r.status = 'approved'
    );
$$;

revoke all on function private.may_found_tree() from anon, public;
grant execute on function private.may_found_tree() to authenticated, service_role;

-- As in 20260922090000, plus the Step 28 permission.
create or replace function public.found_tree(p_name text)
returns public.trees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where auth_user_id = v_uid) then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if not private.may_found_tree() then
    raise exception 'TREE_REQUEST_NEEDED: ask to start a tree first' using errcode = '42501';
  end if;
  return private.found_tree_for(v_uid, p_name);
end;
$$;

revoke all on function public.found_tree(text) from anon, public;
grant execute on function public.found_tree(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. A member asks, and sees where their ask stands
-- ---------------------------------------------------------------------------
-- 'founded' (they started one already, and it's one each), 'approved' (they
-- may start one), 'pending' (asked, waiting), or 'none'.
create or replace function public.my_tree_request()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return 'none';
  end if;
  if exists (select 1 from public.trees t where t.created_by = v_uid) then
    return 'founded';
  end if;
  if private.may_found_tree() then
    return 'approved';
  end if;
  if exists (
    select 1 from public.tree_requests r
    where r.user_id = v_uid and r.status = 'pending'
  ) then
    return 'pending';
  end if;
  return 'none';
end;
$$;

revoke all on function public.my_tree_request() from anon, public;
grant execute on function public.my_tree_request() to authenticated, service_role;

-- Ask to start a tree. Asking again changes nothing; the answer is where the
-- ask stands afterwards, as `my_tree_request` puts it.
create or replace function public.request_tree()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles;
  v_status text;
  v_first text;
  v_last text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if not found then
    raise exception 'No member profile' using errcode = '42501';
  end if;

  v_status := public.my_tree_request();
  if v_status <> 'none' then
    return v_status;
  end if;

  -- The name on their own entry reads best in the reviewer's queue.
  select
    coalesce(nullif(btrim(pe.preferred_name), ''), nullif(btrim(pe.first_name), '')),
    nullif(btrim(pe.last_name), '')
  into v_first, v_last
  from public.people pe
  where pe.id = v_profile.self_person_id;

  insert into public.tree_requests (user_id, first_name, last_name, email)
  values (
    v_uid,
    left(coalesce(v_first, nullif(btrim(v_profile.display_name), ''), 'A member'), 80),
    left(coalesce(v_last, ''), 80),
    coalesce(private.current_email(), '')
  )
  -- A second press racing the first: the pending index already holds one.
  on conflict do nothing;

  return 'pending';
end;
$$;

revoke all on function public.request_tree() from anon, public;
grant execute on function public.request_tree() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Request access: which trees show someone by this name
-- ---------------------------------------------------------------------------
-- For the public "request access" form. Strong matches only (onboarding's
-- "strong", 0.85), on living entries that nobody has claimed and nobody has
-- hidden from visitors, and only the trees come back, never the person. The
-- server calls it with the service role; anon and members can't.
create or replace function public.trees_matching_name(p_first text, p_last text)
returns table (tree_id uuid, tree_name text, tree_slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct t.id, t.name, t.slug
  from public.people pe
  join public.tree_placements tp
    on tp.person_id = pe.id and tp.status = 'active'
  join public.trees t on t.id = tp.tree_id
  where private.fold_name(p_first) is not null
    and private.fold_name(p_last) is not null
    and pe.is_deceased is not true
    and pe.date_of_death is null
    and pe.hidden_from_visitors is not true
    and private.person_is_claimable(pe.id)
    and coalesce(private.self_candidate_score(pe.id, p_first, p_last), 0) >= 0.85
  order by t.name;
$$;

revoke all on function public.trees_matching_name(text, text) from anon, authenticated, public;
grant execute on function public.trees_matching_name(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Tell a member when they may start their tree
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_verified',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placement_accepted', 'placement_declined',
    'tree_request_approved'
  )
);

create or replace function private.tree_request_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tree uuid;
begin
  if new.user_id is null
     or new.status <> 'approved'
     or old.status is not distinct from new.status then
    return new;
  end if;

  -- The inbox it lands in: their own entry's home tree, else the first tree
  -- they joined.
  select coalesce(
    private.home_tree(p.self_person_id),
    (
      select m.tree_id from public.tree_members m
      where m.user_id = new.user_id
      order by m.created_at
      limit 1
    )
  )
  into v_tree
  from public.profiles p
  where p.auth_user_id = new.user_id;

  perform private.notify(
    new.user_id, new.reviewed_by, 'tree_request_approved', null, null,
    'You can start a tree of your own now. Name it, and you''re its first Root.',
    v_tree
  );
  return new;
end;
$$;

create trigger tree_requests_notify
  after update of status on public.tree_requests
  for each row execute function private.tree_request_notify();
