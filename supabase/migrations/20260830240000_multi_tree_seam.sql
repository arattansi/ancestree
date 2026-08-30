-- Step 9 — Multi-tree seam: "start your own tree"
--
-- A member can spin up a NEW tree of their own and bridge it back to a tree
-- they already belong to through a spouse / partner link. v1 keeps this behind
-- a feature flag and never renders the second tree; this migration only lays
-- the data path: a `trees` row + the caller's `people` row in it + one
-- `tree_bridges` row tying the two together. v2 expands the UX from here.

create table public.tree_bridges (
  id uuid primary key default gen_random_uuid(),
  from_tree uuid not null references public.trees (id) on delete cascade,
  to_tree uuid not null references public.trees (id) on delete cascade,
  from_person uuid not null references public.people (id) on delete cascade,
  to_person uuid not null references public.people (id) on delete cascade,
  type text not null default 'spouse' check (type in ('spouse')),
  created_by uuid not null references public.profiles (auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint tree_bridges_distinct_trees check (from_tree <> to_tree),
  constraint tree_bridges_distinct_people check (from_person <> to_person)
);

create index tree_bridges_from_tree_idx on public.tree_bridges (from_tree);
create index tree_bridges_to_tree_idx on public.tree_bridges (to_tree);
create index tree_bridges_created_by_idx on public.tree_bridges (created_by);
create unique index tree_bridges_pair_uidx
  on public.tree_bridges (least(from_person, to_person), greatest(from_person, to_person));

alter table public.tree_bridges enable row level security;

-- Visible to members of either side of the bridge.
create policy tree_bridges_select on public.tree_bridges
  for select to authenticated
  using (
    (select private.is_tree_member(from_tree))
    or (select private.is_tree_member(to_tree))
  );

-- Rows are only ever written by the SECURITY DEFINER RPC below (no INSERT
-- policy on purpose). The bridge author or an admin can remove one.
create policy tree_bridges_delete on public.tree_bridges
  for delete to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
  );

revoke all on table public.tree_bridges from anon, public;
grant select, delete on table public.tree_bridges to authenticated;

-- ---------------------------------------------------------------------------
-- public.start_own_tree — create a member's own tree, their root person in it,
-- and the spouse bridge back to a tree they already belong to.
--   p_tree_name        display name for the new tree
--   p_bridge_person_id a person on a tree the caller can already see
--   p_person           jsonb person object (given/preferred/family/country/...)
-- Returns { "tree_id": uuid, "person_id": uuid }.
-- ---------------------------------------------------------------------------
create or replace function public.start_own_tree(
  p_tree_name text,
  p_bridge_person_id uuid,
  p_person jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_has_profile boolean;
  v_name text := nullif(btrim(p_tree_name), '');
  v_bridge_tree uuid;
  v_new_tree uuid;
  v_deceased boolean;
  v_person uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select true into v_has_profile
  from public.profiles where auth_user_id = v_uid;
  if v_has_profile is not true then
    raise exception 'No member profile' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Name your new tree';
  end if;

  select tree_id into v_bridge_tree
  from public.people where id = p_bridge_person_id;
  if v_bridge_tree is null then
    raise exception 'That person is no longer on the tree';
  end if;
  if not private.is_tree_member(v_bridge_tree) then
    raise exception 'You are not a member of that tree' using errcode = '42501';
  end if;

  -- One own-tree per member keeps the v1 seam simple.
  if exists (select 1 from public.tree_bridges b where b.created_by = v_uid) then
    raise exception 'You have already started your own tree'
      using errcode = 'unique_violation';
  end if;

  insert into public.trees (name, created_by)
  values (v_name, v_uid)
  returning id into v_new_tree;

  v_deceased := coalesce((p_person ->> 'is_deceased')::boolean, false);
  insert into public.people (
    tree_id, given_name, preferred_name, family_name,
    date_of_birth, city_of_birth, country_of_birth,
    is_deceased, date_of_death, place_of_death,
    created_by, owner_user_id
  ) values (
    v_new_tree,
    nullif(btrim(p_person ->> 'given_name'), ''),
    nullif(btrim(p_person ->> 'preferred_name'), ''),
    btrim(p_person ->> 'family_name'),
    nullif(p_person ->> 'date_of_birth', '')::date,
    nullif(btrim(p_person ->> 'city_of_birth'), ''),
    btrim(p_person ->> 'country_of_birth'),
    v_deceased,
    case when v_deceased then nullif(p_person ->> 'date_of_death', '')::date end,
    case when v_deceased then nullif(btrim(p_person ->> 'place_of_death'), '') end,
    v_uid, v_uid
  )
  returning id into v_person;

  insert into public.tree_bridges
    (from_tree, to_tree, from_person, to_person, type, created_by)
  values
    (v_new_tree, v_bridge_tree, v_person, p_bridge_person_id, 'spouse', v_uid);

  return jsonb_build_object('tree_id', v_new_tree, 'person_id', v_person);
end;
$$;

revoke all on function public.start_own_tree(text, uuid, jsonb) from anon, public;
grant execute on function public.start_own_tree(text, uuid, jsonb)
  to authenticated, service_role;
