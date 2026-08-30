-- Step 11 — Optional "Maiden Name" for people
--
-- 1. Add a nullable `maiden_name` column to `people`. No default; existing rows
--    are untouched (stay NULL) so the app can surface a per-person backfill
--    prompt. Visible to all members (no admin gate, unlike `lineage_type`).
-- 2. Teach `add_people_with_connections` to persist `maiden_name` on create.

alter table public.people
  add column maiden_name text;

comment on column public.people.maiden_name is
  'Optional name at birth / before marriage. Nullable; visible to all members.';

-- ---------------------------------------------------------------------------
-- Re-create add_people_with_connections with maiden_name threaded through the
-- person INSERT. Unchanged otherwise (see 20260830210000).
-- ---------------------------------------------------------------------------
create or replace function public.add_people_with_connections(
  p_people jsonb,
  p_edges jsonb default '[]'::jsonb,
  p_self_index int default null
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
      tree_id, given_name, preferred_name, family_name, maiden_name,
      date_of_birth, city_of_birth, country_of_birth,
      is_deceased, date_of_death, place_of_death, lineage_type,
      created_by, owner_user_id
    ) values (
      v_tree,
      nullif(btrim(v_elem ->> 'given_name'), ''),
      nullif(btrim(v_elem ->> 'preferred_name'), ''),
      btrim(v_elem ->> 'family_name'),
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

  -- 2. Insert edges.
  if p_edges is not null and jsonb_typeof(p_edges) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_edges) - 1 loop
      v_edge := p_edges -> v_i;
      v_type := v_edge ->> 'type';
      if v_type is null or v_type not in ('parent', 'spouse') then
        raise exception 'Unknown relationship type: %', coalesce(v_type, '(null)');
      end if;
      v_a := private.resolve_person_ref(v_edge ->> 'a', v_ids, v_tree);
      v_b := private.resolve_person_ref(v_edge ->> 'b', v_ids, v_tree);
      if v_a = v_b then
        raise exception 'A person cannot connect to themselves';
      end if;
      insert into public.relationships (tree_id, from_person, to_person, type, created_by)
      values (
        v_tree,
        case when v_type = 'spouse' then least(v_a, v_b) else v_a end,
        case when v_type = 'spouse' then greatest(v_a, v_b) else v_b end,
        v_type,
        v_uid
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 3. Cycle guard: no directed loop in parent edges for this tree.
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

  -- 4. Connectivity: every new person must reach a pre-existing tree member
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

  -- 5. Link the caller's self entry.
  if p_self_index is not null then
    v_self_id := v_ids[p_self_index + 1];
    update public.profiles
       set self_person_id = v_self_id
     where auth_user_id = v_uid;
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'self_id', v_self_id);
end;
$$;

revoke all on function public.add_people_with_connections(jsonb, jsonb, int)
  from anon, public;
grant execute on function public.add_people_with_connections(jsonb, jsonb, int)
  to authenticated, service_role;
