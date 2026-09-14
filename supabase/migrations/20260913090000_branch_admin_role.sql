-- Step 15 — Branch admins
--
-- A third role between `member` and `admin`. A branch admin curates the part of
-- the tree they belong to: they can edit any entry on their own branch, and fix
-- or remove the connections between two people on it, without being handed the
-- whole tree the way an admin is.
--
-- A branch is derived, not configured. It is the same up-then-down walk the
-- bloodline gate uses (Step 14, `private.bloodline_ids`), anchored on the
-- branch admin's *own* entry rather than on the tree's anchors:
--
--     self -> climb every `parent` edge upward to all ancestors
--          -> then descend `parent` edges from that whole set
--          -> then add the partners those people married, one step
--
-- Direction is what draws the boundary. Walking parent edges undirected would
-- leak: from a niece up to her *other* parent, and that parent's whole birth
-- family lands on the branch. Up-then-down keeps ancestors, siblings, cousins,
-- nieces and grandchildren in, and keeps the families people married in from
-- coming with them. The partners themselves are added last and never walked
-- through, so a spouse is on the branch but a spouse's parents are not.
--
-- Two entries a branch admin still cannot touch, even on their own branch:
-- somebody else's own entry (a member's `self_person_id`, or an entry with an
-- approved claim). Those belong to the person they describe.

-- ---------------------------------------------------------------------------
-- The role itself
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (
    role in ('admin', 'branch_admin', 'member')
  );

-- `private.is_admin()` is deliberately untouched: a branch admin is not an
-- admin, and must not pick up admin-only rights (deleting people, minting
-- invites, setting lineage, the admin console) by being one.
create or replace function private.is_branch_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = (select auth.uid())
      and role = 'branch_admin'
  );
$$;

grant execute on function private.is_branch_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.branch_ids — everyone on one person's branch
-- ---------------------------------------------------------------------------

create or replace function private.branch_ids(p_person uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select p_person as id
    union
    select r.from_person as id
    from up
    join public.relationships r
      on r.to_person = up.id
     and r.type = 'parent'
  ),
  down as (
    select up.id from up
    union
    select r.to_person as id
    from down
    join public.relationships r
      on r.from_person = down.id
     and r.type = 'parent'
  )
  -- The blood line, then the partners married to it — collected from `down`
  -- only, so a partner never drags their own partners in behind them.
  select id from down
  union
  select case when r.from_person = d.id then r.to_person else r.from_person end
  from down d
  join public.relationships r
    on r.type = 'spouse'
   and (r.from_person = d.id or r.to_person = d.id);
$$;

grant execute on function private.branch_ids(uuid) to authenticated, service_role;

-- The acting user's own entry — the anchor their branch is measured from.
create or replace function private.self_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select self_person_id
  from public.profiles
  where auth_user_id = (select auth.uid());
$$;

grant execute on function private.self_person_id() to authenticated, service_role;

-- An entry that belongs to the person it describes: a member's own entry, or
-- one an approved claim has handed over. Off limits to a branch admin, whoever
-- else created it.
create or replace function private.person_is_someones_own(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.person_is_claimed(p_person_id)
    or exists (
      select 1
      from public.profiles p
      where p.self_person_id = p_person_id
        and p.auth_user_id is distinct from (select auth.uid())
    );
$$;

grant execute on function private.person_is_someones_own(uuid) to authenticated, service_role;

-- True when the acting user is a branch admin and `p_person_id` sits on their
-- branch. A branch admin still in onboarding (no own entry yet) has no branch.
create or replace function private.is_on_own_branch(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_branch_admin()
    and exists (
      select 1
      from private.branch_ids(private.self_person_id()) b
      where b = p_person_id
    );
$$;

grant execute on function private.is_on_own_branch(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Editing people
-- ---------------------------------------------------------------------------

-- Editable by: admin, current owner, the original creator while the entry is
-- still unclaimed (Step 12) — or a branch admin, anywhere on their own branch,
-- as long as the entry isn't somebody else's own.
create or replace function private.can_edit_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.people pe
      where pe.id = p_person_id
        and (
          pe.owner_user_id = (select auth.uid())
          or (
            pe.created_by = (select auth.uid())
            and pe.owner_user_id = pe.created_by
            and not private.person_is_claimed(pe.id)
          )
        )
    )
    or (
      private.is_on_own_branch(p_person_id)
      and not private.person_is_someones_own(p_person_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Editing connections
-- ---------------------------------------------------------------------------

-- A connection is a branch admin's to change only when *both* ends are on
-- their branch. One end alone would let them redraw the line into someone
-- else's family — the same leak the up-then-down walk exists to prevent.
create or replace function private.can_edit_relationship(p_rel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.relationships r
      where r.id = p_rel_id
        and (
          r.created_by = (select auth.uid())
          or (
            private.is_on_own_branch(r.from_person)
            and private.is_on_own_branch(r.to_person)
          )
        )
    );
$$;

grant execute on function private.can_edit_relationship(uuid) to authenticated, service_role;

drop policy relationships_update on public.relationships;
create policy relationships_update on public.relationships
  for update to authenticated
  using ((select private.can_edit_relationship(id)))
  with check ((select private.can_edit_relationship(id)));

drop policy relationships_delete on public.relationships;
create policy relationships_delete on public.relationships
  for delete to authenticated
  using ((select private.can_edit_relationship(id)));
