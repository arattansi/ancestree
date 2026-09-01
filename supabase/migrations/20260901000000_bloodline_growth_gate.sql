-- Step 14 — Bloodline growth gate
--
-- Until now the only rule on growth was "every new entry must reach *someone*
-- already in the tree" (step 5). Spouse edges count, so anyone who married into
-- the family could hang their entire birth family off themselves and pass. This
-- migration derives who is blood and stops that branch at the door.
--
-- The bloodline B of a tree is computed from an explicit anchor set:
--
--     anchors -> climb every `parent` edge upward to all ancestors
--             -> then descend `parent` edges from that whole set
--
-- Direction matters. Walking parent edges *undirected* leaks: from a blood
-- member down to their child, then back up to the child's other parent — and
-- every married-in partner lands inside B. Up-then-down keeps cousins,
-- great-aunts and half-siblings in while keeping every married-in partner out.
-- `people.lineage_type` is a property of the person, not the edge, so adoptive
-- children descend like anyone else.
--
-- The gate: an established member whose own entry is outside B may only create
-- people who land *inside* B — their children with a blood partner, their
-- partner's kin. A branch that hangs off them alone is refused with a
-- `BLOODLINE_GATE` error, which the UI turns into the "looks like you're
-- building a new family tree" prompt.
--
-- Never blocked: admins, members still in onboarding (no `self_person_id` yet),
-- and every tree with no anchors configured (the gate fails open).

-- ---------------------------------------------------------------------------
-- bloodline_anchors — the people a tree's bloodline is measured from
-- ---------------------------------------------------------------------------

create table public.bloodline_anchors (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index bloodline_anchors_person_uidx
  on public.bloodline_anchors (tree_id, person_id);
create index bloodline_anchors_tree_idx on public.bloodline_anchors (tree_id);

alter table public.bloodline_anchors enable row level security;

-- Members can see which entries anchor their tree; only admins can change them.
create policy bloodline_anchors_select on public.bloodline_anchors
  for select to authenticated
  using ((select private.is_tree_member(tree_id)));

create policy bloodline_anchors_insert on public.bloodline_anchors
  for insert to authenticated
  with check ((select private.is_admin()));

create policy bloodline_anchors_delete on public.bloodline_anchors
  for delete to authenticated
  using ((select private.is_admin()));

revoke all on table public.bloodline_anchors from anon, public;
grant select, insert, delete on table public.bloodline_anchors to authenticated;

-- Seed from the founding admins' own entries — the same anchors the canvas
-- layout already numbers generations from (`getTreeAnchors()` in lib/tree.ts).
insert into public.bloodline_anchors (tree_id, person_id, created_by)
select pe.tree_id, pe.id, p.auth_user_id
from public.profiles p
join public.people pe on pe.id = p.self_person_id
where p.role = 'admin'
order by p.created_at asc
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- private.bloodline_ids — every person in a tree's bloodline
-- ---------------------------------------------------------------------------

create or replace function private.bloodline_ids(p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select a.person_id as id
    from public.bloodline_anchors a
    where a.tree_id = p_tree
    union
    select r.from_person as id
    from up
    join public.relationships r
      on r.to_person = up.id
     and r.type = 'parent'
     and r.tree_id = p_tree
  ),
  down as (
    select up.id from up
    union
    select r.to_person as id
    from down
    join public.relationships r
      on r.from_person = down.id
     and r.type = 'parent'
     and r.tree_id = p_tree
  )
  select id from down;
$$;

-- A tree with no anchors has no gate.
create or replace function private.bloodline_gate_active(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bloodline_anchors a where a.tree_id = p_tree
  );
$$;

create or replace function private.is_bloodline(p_person_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tree uuid;
begin
  select tree_id into v_tree from public.people where id = p_person_id;
  if v_tree is null then
    return false;
  end if;
  if not private.bloodline_gate_active(v_tree) then
    return true;
  end if;
  return exists (
    select 1 from private.bloodline_ids(v_tree) as b(id) where b.id = p_person_id
  );
end;
$$;

grant execute on function private.bloodline_ids(uuid) to authenticated, service_role;
grant execute on function private.bloodline_gate_active(uuid) to authenticated, service_role;
grant execute on function private.is_bloodline(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.my_growth_rights — what the signed-in member may add, for the UI
-- ---------------------------------------------------------------------------
create or replace function public.my_growth_rights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_self uuid;
  v_tree uuid;
  v_gate boolean := false;
  v_blood boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object(
      'can_add', false, 'is_married_in', false, 'gate_active', false,
      'self_person_id', null, 'onboarding', false
    );
  end if;

  select (role = 'admin'), self_person_id
    into v_is_admin, v_self
  from public.profiles
  where auth_user_id = v_uid;

  if v_self is not null then
    select tree_id into v_tree from public.people where id = v_self;
    v_gate := private.bloodline_gate_active(v_tree);
    v_blood := private.is_bloodline(v_self);
  end if;

  return jsonb_build_object(
    -- Married-in members keep the "add" affordance: additions that land inside
    -- the bloodline (their own children) are still allowed. `is_married_in` is
    -- what tells the UI to explain the refusal when one doesn't.
    'can_add', true,
    'is_married_in', coalesce(v_is_admin, false) is not true
                     and v_self is not null and v_gate and not v_blood,
    'gate_active', v_gate,
    'self_person_id', v_self,
    'onboarding', v_self is null
  );
end;
$$;

revoke all on function public.my_growth_rights() from anon, public;
grant execute on function public.my_growth_rights() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- add_people_with_connections — recreated from 20260831100000 with the
-- bloodline gate (step 5b) added. Everything else is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.add_people_with_connections(
  p_people jsonb,
  p_edges jsonb default '[]'::jsonb,
  p_self_index int default null,
  p_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_has_profile boolean;
  v_self_existing uuid;
  v_tree uuid;
  v_ids uuid[] := '{}';
  v_count int;
  v_elem jsonb;
  v_i int;
  v_edge jsonb;
  v_type text;
  v_deceased boolean;
  v_a uuid;
  v_b uuid;
  v_person uuid;
  v_cycle boolean;
  v_unreached uuid[];
  v_self_id uuid := null;
  v_res text;
  v_resolved_at timestamptz;
  v_blood uuid[];
  v_outside uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select true, (role = 'admin'), self_person_id
    into v_has_profile, v_is_admin, v_self_existing
  from public.profiles
  where auth_user_id = v_uid;

  if v_has_profile is not true then
    raise exception 'No member profile' using errcode = '42501';
  end if;

  if p_people is null
     or jsonb_typeof(p_people) <> 'array'
     or jsonb_array_length(p_people) = 0 then
    raise exception 'Add at least one person';
  end if;
  v_count := jsonb_array_length(p_people);

  if p_self_index is not null then
    if v_self_existing is not null then
      raise exception 'Your own entry already exists' using errcode = 'unique_violation';
    end if;
    if p_self_index < 0 or p_self_index >= v_count then
      raise exception 'Invalid self index';
    end if;
  end if;

  select id into v_tree from public.trees order by created_at asc limit 1;
  if v_tree is null then
    raise exception 'No family tree exists yet';
  end if;

  -- 1. Insert people (owner + creator = caller).
  for v_i in 0 .. v_count - 1 loop
    v_elem := p_people -> v_i;
    v_deceased := coalesce((v_elem ->> 'is_deceased')::boolean, false);
    insert into public.people (
      tree_id, first_name, middle_name, preferred_name, last_name, maiden_name,
      date_of_birth, city_of_birth, country_of_birth,
      is_deceased, date_of_death, place_of_death, lineage_type,
      created_by, owner_user_id
    ) values (
      v_tree,
      nullif(btrim(v_elem ->> 'first_name'), ''),
      nullif(btrim(v_elem ->> 'middle_name'), ''),
      nullif(btrim(v_elem ->> 'preferred_name'), ''),
      btrim(v_elem ->> 'last_name'),
      nullif(btrim(v_elem ->> 'maiden_name'), ''),
      nullif(v_elem ->> 'date_of_birth', '')::date,
      nullif(btrim(v_elem ->> 'city_of_birth'), ''),
      btrim(v_elem ->> 'country_of_birth'),
      v_deceased,
      case when v_deceased then nullif(v_elem ->> 'date_of_death', '')::date end,
      case when v_deceased then nullif(btrim(v_elem ->> 'place_of_death'), '') end,
      nullif(btrim(v_elem ->> 'lineage_type'), ''),
      v_uid, v_uid
    )
    returning id into v_person;
    v_ids := array_append(v_ids, v_person);
  end loop;

  -- 2. Insert base + additional edges.
  if p_edges is not null and jsonb_typeof(p_edges) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_edges) - 1 loop
      v_edge := p_edges -> v_i;
      v_type := v_edge ->> 'type';
      if v_type is null or v_type not in ('parent', 'spouse', 'sibling') then
        raise exception 'Unknown relationship type: %', coalesce(v_type, '(null)');
      end if;
      v_a := private.resolve_person_ref(v_edge ->> 'a', v_ids, v_tree);
      v_b := private.resolve_person_ref(v_edge ->> 'b', v_ids, v_tree);
      if v_a = v_b then
        raise exception 'A person cannot connect to themselves';
      end if;
      insert into public.relationships (tree_id, from_person, to_person, type,
        created_by, marriage_date, is_divorced, divorce_date)
      values (
        v_tree,
        case when v_type in ('spouse', 'sibling') then least(v_a, v_b) else v_a end,
        case when v_type in ('spouse', 'sibling') then greatest(v_a, v_b) else v_b end,
        v_type,
        v_uid,
        case when v_type = 'spouse'
          then nullif(v_edge ->> 'marriage_date', '')::date end,
        case when v_type = 'spouse'
          then coalesce((v_edge ->> 'is_divorced')::boolean, false) else false end,
        case when v_type = 'spouse' and coalesce((v_edge ->> 'is_divorced')::boolean, false)
          then nullif(v_edge ->> 'divorce_date', '')::date end
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 3. Resolved implied connections (Step 11.2 / 11.3).
  if p_suggestions is not null and jsonb_typeof(p_suggestions) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_suggestions) - 1 loop
      v_edge := p_suggestions -> v_i;
      v_type := v_edge ->> 'suggested_type';
      if v_type is null or v_type not in ('spouse', 'parent', 'sibling_check') then
        raise exception 'Unknown suggestion type: %', coalesce(v_type, '(null)');
      end if;
      if (v_edge ->> 'source') is null
         or (v_edge ->> 'source') not in
            ('co_parent', 'unlinked_spouse_child', 'name_dob_match') then
        raise exception 'Unknown suggestion source';
      end if;
      v_res := coalesce(v_edge ->> 'resolution', 'pending');
      if v_res not in ('accepted', 'dismissed', 'pending') then
        raise exception 'Unknown suggestion resolution: %', v_res;
      end if;
      v_a := private.resolve_person_ref(v_edge ->> 'subject', v_ids, v_tree);
      v_b := private.resolve_person_ref(v_edge ->> 'related', v_ids, v_tree);
      if v_a = v_b then
        raise exception 'A suggestion cannot link a person to themselves';
      end if;
      v_resolved_at := case when v_res = 'pending' then null else now() end;

      insert into public.connection_suggestions (
        tree_id, subject_person_id, related_person_id, suggested_type, source,
        status, created_by, resolved_by, resolved_at
      ) values (
        v_tree, v_a, v_b, v_type, v_edge ->> 'source',
        v_res, v_uid,
        case when v_res = 'pending' then null else v_uid end,
        v_resolved_at
      )
      on conflict on constraint connection_suggestions_unique_key do nothing;

      if v_res = 'accepted' and v_type in ('spouse', 'parent') then
        insert into public.relationships (tree_id, from_person, to_person, type, created_by)
        values (
          v_tree,
          case when v_type = 'spouse' then least(v_a, v_b) else v_a end,
          case when v_type = 'spouse' then greatest(v_a, v_b) else v_b end,
          v_type,
          v_uid
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- 4. Cycle guard: no directed loop in parent edges for this tree.
  with recursive walk as (
    select r.from_person as root, r.to_person as node, 1 as depth
    from public.relationships r
    where r.tree_id = v_tree and r.type = 'parent'
    union all
    select w.root, r.to_person, w.depth + 1
    from walk w
    join public.relationships r
      on r.from_person = w.node
     and r.type = 'parent'
     and r.tree_id = v_tree
    where w.depth < 500 and w.root <> w.node
  )
  select exists (select 1 from walk where root = node) into v_cycle;
  if v_cycle then
    raise exception 'That connection would create a parent/child loop'
      using errcode = '23514';
  end if;

  -- 4b. A pair cannot be both a parent-child and a spouse edge.
  if exists (
    select 1
    from public.relationships p
    join public.relationships s
      on s.tree_id = p.tree_id
     and s.type = 'spouse'
     and least(s.from_person, s.to_person) = least(p.from_person, p.to_person)
     and greatest(s.from_person, s.to_person) = greatest(p.from_person, p.to_person)
    where p.tree_id = v_tree and p.type = 'parent'
  ) then
    raise exception 'Two people cannot be both partners and parent and child'
      using errcode = '23514';
  end if;

  -- 5. Connectivity: every new person must reach a pre-existing tree member
  --    (admins are exempt so they can seed root people).
  if not v_is_admin then
    with recursive rel_edges as (
      select from_person as a, to_person as b
      from public.relationships where tree_id = v_tree
      union all
      select to_person as a, from_person as b
      from public.relationships where tree_id = v_tree
    ),
    reach as (
      select p.id as node
      from public.people p
      where p.tree_id = v_tree
        and not (p.id = any(v_ids))
      union
      select e.b
      from reach r
      join rel_edges e on e.a = r.node
    )
    select array_agg(x) into v_unreached
    from unnest(v_ids) as x
    where x not in (select node from reach);

    if v_unreached is not null and array_length(v_unreached, 1) > 0 then
      raise exception 'New entries must connect to someone already in the tree'
        using errcode = '23514';
    end if;
  end if;

  -- 5b. Bloodline gate (Step 14): a member who married in may only create
  --     people who land inside the bloodline — their children with a blood
  --     partner, their partner's kin. A branch hanging off them alone means
  --     they are starting their own tree, and belongs on their own canvas.
  --     Recomputed *after* the edges land so a new child of a blood parent
  --     counts as blood. Admins, onboarding (no self entry yet), and trees
  --     with no anchors are exempt.
  if not v_is_admin
     and v_self_existing is not null
     and private.bloodline_gate_active(v_tree) then
    v_blood := array(select private.bloodline_ids(v_tree));

    if not (v_self_existing = any(v_blood)) then
      select array_agg(x) into v_outside
      from unnest(v_ids) as x
      where not (x = any(v_blood));

      if v_outside is not null and array_length(v_outside, 1) > 0 then
        raise exception 'BLOODLINE_GATE: new entries must connect to the family bloodline'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- 6. Link the caller's self entry.
  if p_self_index is not null then
    v_self_id := v_ids[p_self_index + 1];
    update public.profiles
       set self_person_id = v_self_id
     where auth_user_id = v_uid;
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'self_id', v_self_id);
end;
$$;

revoke all on function public.add_people_with_connections(jsonb, jsonb, int, jsonb)
  from anon, public;
grant execute on function public.add_people_with_connections(jsonb, jsonb, int, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Close the direct-insert door
--
-- `people_insert` / `relationships_insert` let any member INSERT rows straight
-- through the Data API, which would sidestep the gate entirely. Creation
-- already runs exclusively through the SECURITY DEFINER RPCs
-- (`add_people_with_connections`, `connect_people`, `claim_person`,
-- `start_own_tree`), which bypass RLS on their own, so restricting the raw
-- policies to admins costs nothing and leaves the gate the only path.
-- ---------------------------------------------------------------------------

drop policy people_insert on public.people;
create policy people_insert on public.people
  for insert to authenticated
  with check (
    (select private.is_admin())
    and created_by = (select auth.uid())
  );

drop policy relationships_insert on public.relationships;
create policy relationships_insert on public.relationships
  for insert to authenticated
  with check (
    (select private.is_admin())
    and created_by = (select auth.uid())
  );
