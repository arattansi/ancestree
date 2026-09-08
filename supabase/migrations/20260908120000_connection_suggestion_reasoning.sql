-- Step 16 — a graph-reasoning connection-suggestion engine
--
-- The old engine only ever ran over the edges of a *pending* add, and its one
-- broad rule matched on surname + birth year — near-useless in a tree where a
-- handful of surnames cover everyone. The new engine reasons about the shape of
-- the established graph and runs over the whole tree, continuously.
--
-- The consequence for this schema: suggestions are no longer *stored*, they are
-- derived on read. `connection_suggestions` becomes a **ledger of answers** —
-- one row per question a member has resolved. A candidate whose key is already
-- in the table is never asked again. Nothing writes a `pending` row any more
-- (the ones already there stay, and still resolve through the old RPC).
--
-- Down: drop `resolve_implied_connection`; restore the two CHECK constraints to
-- their previous value lists.

-- ---------------------------------------------------------------------------
-- 1. New rule outputs
-- ---------------------------------------------------------------------------
-- `sibling_implied_parent` — A is recorded as B's sibling; B's parents are
--   missing from A.
-- `shared_neighbours`      — two entries with compatible names occupying the
--   same position in the graph: likely one person entered twice.
-- `duplicate_check`        — the question that asks about the latter. Accepting
--   it creates NO edge; the app has no merge, so a confirmed duplicate is
--   reported for an admin to resolve by hand.

alter table public.connection_suggestions
  drop constraint connection_suggestions_suggested_type_check;
alter table public.connection_suggestions
  add constraint connection_suggestions_suggested_type_check
  check (suggested_type in ('spouse', 'parent', 'sibling_check', 'duplicate_check'));

alter table public.connection_suggestions
  drop constraint connection_suggestions_source_check;
alter table public.connection_suggestions
  add constraint connection_suggestions_source_check
  check (source in (
    'co_parent',
    'unlinked_spouse_child',
    'sibling_implied_parent',
    'shared_neighbours',
    -- Retired, but rows written by it are still on the table.
    'name_dob_match'
  ));

-- ---------------------------------------------------------------------------
-- 2. resolve_implied_connection — answer a computed candidate
-- ---------------------------------------------------------------------------
-- A derived candidate has no row to point at, so it is identified by its own
-- shape: (subject, related, type, source) — the table's unique key. Resolving
-- writes the ledger row and, for an accepted `spouse` / `parent`, the edge.
--
-- Who may answer: any member of the tree. The old id-based RPC restricted this
-- to the suggestion's author, which made sense when a human's submit created
-- the row; a candidate the engine derived has no author. Members can already
-- create these same edges through `connect_people`, so this grants nothing new.
--
-- The two guards from `connect_people` / `resolve_connection_suggestion` are
-- carried over verbatim: a pair cannot be both partners and parent-and-child,
-- and parent edges may not form a cycle.

create or replace function public.resolve_implied_connection(
  p_subject uuid,
  p_related uuid,
  p_type text,
  p_source text,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
  v_related_tree uuid;
  v_cycle boolean;
  v_a uuid;
  v_b uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_resolution not in ('accepted', 'dismissed') then
    raise exception 'Unknown resolution: %', p_resolution;
  end if;
  if p_type not in ('spouse', 'parent', 'sibling_check', 'duplicate_check') then
    raise exception 'Unknown suggestion type: %', p_type;
  end if;
  if p_source not in (
    'co_parent', 'unlinked_spouse_child',
    'sibling_implied_parent', 'shared_neighbours', 'name_dob_match'
  ) then
    raise exception 'Unknown suggestion source: %', p_source;
  end if;
  if p_subject = p_related then
    raise exception 'A suggestion cannot link a person to themselves';
  end if;

  select tree_id into v_tree from public.people where id = p_subject;
  select tree_id into v_related_tree from public.people where id = p_related;
  if v_tree is null or v_related_tree is null then
    raise exception 'Suggestion refers to an entry that no longer exists';
  end if;
  if v_tree <> v_related_tree then
    raise exception 'Those two entries are in different trees';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'Only a member of this tree can answer its suggestions'
      using errcode = '42501';
  end if;

  -- The ledger. `on conflict do nothing` makes a double-click a no-op rather
  -- than an error, and keeps the first answer authoritative.
  insert into public.connection_suggestions (
    tree_id, subject_person_id, related_person_id, suggested_type, source,
    status, created_by, resolved_by, resolved_at
  ) values (
    v_tree,
    case when p_type in ('spouse', 'sibling_check', 'duplicate_check')
      then least(p_subject, p_related) else p_subject end,
    case when p_type in ('spouse', 'sibling_check', 'duplicate_check')
      then greatest(p_subject, p_related) else p_related end,
    p_type, p_source, p_resolution, v_uid, v_uid, now()
  )
  on conflict on constraint connection_suggestions_unique_key do nothing;

  if p_resolution <> 'accepted' or p_type not in ('spouse', 'parent') then
    return;
  end if;

  v_a := p_subject;
  v_b := p_related;

  -- A pair cannot be both a spouse pair and a parent-child pair.
  if p_type = 'spouse' and exists (
    select 1 from public.relationships r
    where r.tree_id = v_tree
      and r.type = 'parent'
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
  ) then
    raise exception 'Two people cannot be both partners and parent and child'
      using errcode = '23514';
  end if;
  if p_type = 'parent' and exists (
    select 1 from public.relationships r
    where r.tree_id = v_tree
      and r.type = 'spouse'
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
  ) then
    raise exception 'Two people cannot be both partners and parent and child'
      using errcode = '23514';
  end if;

  insert into public.relationships (tree_id, from_person, to_person, type, created_by)
  values (
    v_tree,
    case when p_type = 'spouse' then least(v_a, v_b) else v_a end,
    case when p_type = 'spouse' then greatest(v_a, v_b) else v_b end,
    p_type,
    v_uid
  )
  on conflict do nothing;

  with recursive walk as (
    select r.from_person as root, r.to_person as node, 1 as depth
    from public.relationships r
    where r.tree_id = v_tree and r.type = 'parent'
    union all
    select w.root, r.to_person, w.depth + 1
    from walk w
    join public.relationships r
      on r.from_person = w.node and r.type = 'parent'
     and r.tree_id = v_tree
    where w.depth < 500 and w.root <> w.node
  )
  select exists (select 1 from walk where root = node) into v_cycle;
  if v_cycle then
    raise exception 'That connection would create a parent/child loop'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.resolve_implied_connection(uuid, uuid, text, text, text)
  from anon, public;
grant execute on function public.resolve_implied_connection(uuid, uuid, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. add_people_with_connections — accept the new rule outputs
-- ---------------------------------------------------------------------------
-- Recreated from 20260901020000 with two validation lists widened, so a
-- suggestion the member answers inside the add-person modal can carry one of
-- the new sources or the `duplicate_check` type. Everything else is unchanged;
-- an accepted `duplicate_check` writes no edge, because the block below only
-- creates one for 'spouse' and 'parent'.

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
  v_allowed uuid[];
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
      if v_type is null or v_type not in
         ('spouse', 'parent', 'sibling_check', 'duplicate_check') then
        raise exception 'Unknown suggestion type: %', coalesce(v_type, '(null)');
      end if;
      if (v_edge ->> 'source') is null
         or (v_edge ->> 'source') not in
            ('co_parent', 'unlinked_spouse_child', 'sibling_implied_parent',
             'shared_neighbours', 'name_dob_match') then
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

  -- 5b. Bloodline gate (Step 14 / 14.2): a member who married in may only
  --     create people who are in the bloodline or descend from them — their
  --     children and grandchildren, their partner's kin. Their own parents,
  --     siblings and in-laws are neither, and mean they are starting their own
  --     tree, which belongs on their own canvas. Recomputed *after* the edges
  --     land. Admins, onboarding (no self entry yet), and trees with no anchors
  --     are exempt.
  if not v_is_admin
     and v_self_existing is not null
     and private.bloodline_gate_active(v_tree) then
    v_allowed := array(select private.bloodline_ids(v_tree));

    if not (v_self_existing = any(v_allowed)) then
      v_allowed := v_allowed
        || array(select private.descendant_ids(v_tree, v_self_existing));

      select array_agg(x) into v_outside
      from unnest(v_ids) as x
      where not (x = any(v_allowed));

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
