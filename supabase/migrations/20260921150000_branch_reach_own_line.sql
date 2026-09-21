-- Step 22.2 — A Branch tends only the part of the Root's side they're related through
--
-- 18.1 gave a Branch the whole branch of the Root they are related to. For
-- Arzu that meant all of Raiya's side: her father's family, which is Arzu's
-- own, and her mother's, which is nothing to Arzu. The decision of 2026-09-21
-- takes the second half back: a Branch looks after the part of the Root's side
-- they are related *through*.
--
-- So the reach is now the Branch's own branch (`private.branch_ids` from their
-- own entry, the Step 17 walk) kept to the sides of the Roots they are related
-- to (the 18.1 anchor). Both halves matter:
--   * measured from the Branch's own entry, Raiya's mother's family drops out
--     (on the live tree Arzu goes from 51 entries to 48 — Noorali, Kulsum and
--     Amyn — and gains none);
--   * kept to a Root's side, a Branch's own in-laws' families, or a cousin's
--     other parent's family, never come in. Related to no Root, a Branch still
--     tends nothing and edits like Canopy.
--
-- `is_on_own_branch`, and everything built on it (`can_edit_person`,
-- `can_edit_relationship`, `can_edit_pet`, `can_invite_to_claim`,
-- `can_see_documents`), follows with no change of its own.

create or replace function private.own_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with own as (
    select id
    from private.branch_ids(private.self_person_id()) as b(id)
  ),
  sides as (
    select r.root, b.id
    from private.root_person_ids() as r(root)
    cross join lateral private.branch_ids(r.root) as b(id)
  )
  select distinct s.id
  from sides s
  join own o on o.id = s.id
  where s.root in (
    select root from sides where id = private.self_person_id()
  );
$$;

grant execute on function private.own_branch_ids() to authenticated, service_role;
