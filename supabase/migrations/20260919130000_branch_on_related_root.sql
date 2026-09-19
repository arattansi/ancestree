-- Step 18.1 — A Branch tends their Root's side
--
-- Step 17 measured a Branch's reach from their own entry: their ancestors,
-- everyone descended from them, and who those people married. That is the side
-- of the family *they* belong to, which is not quite the side of the tree they
-- look after. A Branch looks after a Root's side: the tree is two founders'
-- families joined, and a Branch is the relative who keeps one of them in order.
--
-- So the branch is now anchored on the Root they are related to — every Root
-- whose own branch (`private.branch_ids`, unchanged) has the Branch's entry on
-- it, by blood or by marriage — and the Branch reaches that Root's branch. On
-- the tree as it stands that grows Arzu's reach from 14 entries to 17 (Raiya's
-- mother's family joins it) and takes none away.
--
-- Two cases the old anchor never had:
--   * related to more than one Root (a child of both founders): they tend
--     every side they are related to;
--   * related to no Root (someone whose only tie is through an in-law): they
--     have no branch, and edit like Canopy until they are related to one.
--
-- Everything built on `is_on_own_branch` — `can_edit_person`,
-- `can_edit_relationship` and through them `can_edit_pet` — follows with no
-- change of its own. The two limits stay: another member's own entry is never
-- a Branch's to edit, and a line needs both ends on the branch.

-- The Roots' own entries: where every side of the tree is measured from.
create or replace function private.root_person_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select self_person_id
  from public.profiles
  where role = 'admin'
    and self_person_id is not null;
$$;

grant execute on function private.root_person_ids() to authenticated, service_role;

-- The acting Branch's reach: the branch of every Root whose branch they are
-- on. Each Root's branch is walked once, then kept or dropped whole.
create or replace function private.own_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with reach as (
    select r.root, b.id
    from private.root_person_ids() as r(root)
    cross join lateral private.branch_ids(r.root) as b(id)
  )
  select distinct id
  from reach
  where root in (
    select root from reach where id = private.self_person_id()
  );
$$;

grant execute on function private.own_branch_ids() to authenticated, service_role;

-- True when the acting user is a Branch and `p_person_id` is on the side of
-- the tree they tend. A Branch still in onboarding (no own entry yet) is
-- related to no Root, so tends nothing.
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
      from private.own_branch_ids() b
      where b = p_person_id
    );
$$;
