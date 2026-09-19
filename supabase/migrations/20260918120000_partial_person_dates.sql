-- Step 17 — Partial birth and death dates
--
-- Older relatives' dates are often known only to the year ("born 1931") or the
-- month. The form used the browser's date picker, which takes a whole date or
-- nothing — so people either scrolled a phone's date wheel back to 1931 and
-- guessed a day, or left the date out. Arzu's feedback (Step 17) asked to just
-- type the date; this is the half of that which the schema has to carry.
--
-- A date stays a `date`, and says how much of it is known:
--
--     date_of_birth_precision / date_of_death_precision  'day' | 'month' | 'year'
--
-- A partial date is stored on the first day of its period — "1931" is
-- 1931-01-01 at 'year', "March 1931" is 1931-03-01 at 'month' — which the CHECKs
-- below enforce, so every reader that only wants the year (lifespans, search,
-- sibling order, historical place names) keeps working untouched, and anything
-- that shows the whole date asks the precision first. Existing rows default to
-- 'day', which is what they are.
--
-- The three functions that write or watch these columns are re-created from
-- their latest migrations, verbatim apart from the precision lines:
--
--   * public.add_people_with_connections (20260908120000) and
--     public.start_own_tree (20260831040050) read `date_of_birth_precision` /
--     `date_of_death_precision` from the payload and fall back to 'day' when
--     it's absent — so the app already deployed, which sends neither, keeps
--     working the moment this lands;
--   * private.person_edit_notify (20260904120000) counts a precision-only change
--     ("1 January 1950" becoming "1950") as a date change, because everyone sees
--     it as one.
--
-- Before copying, each live body was compared with its migration file line by
-- line: the only differences were comments, so the repo copies are the code
-- that is running. `search_self_candidates` also reads these dates but only
-- years ever reach the screen from it, so it is left alone.
--
-- Down: re-run the three functions from the migrations named above, then
--   alter table public.people
--     drop column date_of_birth_precision, drop column date_of_death_precision;

alter table public.people
  add column date_of_birth_precision text not null default 'day',
  add column date_of_death_precision text not null default 'day';

-- `extract` rather than `date_trunc`: on a `date`, date_trunc resolves to the
-- timestamptz overload and would depend on the session's time zone.
alter table public.people
  add constraint people_date_of_birth_precision_check check (
    date_of_birth_precision = 'day'
    or (
      date_of_birth_precision = 'month'
      and (date_of_birth is null or extract(day from date_of_birth) = 1)
    )
    or (
      date_of_birth_precision = 'year'
      and (
        date_of_birth is null
        or (
          extract(month from date_of_birth) = 1
          and extract(day from date_of_birth) = 1
        )
      )
    )
  ),
  add constraint people_date_of_death_precision_check check (
    date_of_death_precision = 'day'
    or (
      date_of_death_precision = 'month'
      and (date_of_death is null or extract(day from date_of_death) = 1)
    )
    or (
      date_of_death_precision = 'year'
      and (
        date_of_death is null
        or (
          extract(month from date_of_death) = 1
          and extract(day from date_of_death) = 1
        )
      )
    )
  );

comment on column public.people.date_of_birth_precision is
  'How much of date_of_birth is known: day | month | year. A partial date is stored on the first day of its period (1931 -> 1931-01-01).';
comment on column public.people.date_of_death_precision is
  'How much of date_of_death is known: day | month | year. A partial date is stored on the first day of its period.';

-- ---------------------------------------------------------------------------
-- public.add_people_with_connections — carries the two precisions.
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
      date_of_birth, date_of_birth_precision, city_of_birth, country_of_birth,
      is_deceased, date_of_death, date_of_death_precision, place_of_death,
      lineage_type,
      created_by, owner_user_id
    ) values (
      v_tree,
      nullif(btrim(v_elem ->> 'first_name'), ''),
      nullif(btrim(v_elem ->> 'middle_name'), ''),
      nullif(btrim(v_elem ->> 'preferred_name'), ''),
      btrim(v_elem ->> 'last_name'),
      nullif(btrim(v_elem ->> 'maiden_name'), ''),
      nullif(v_elem ->> 'date_of_birth', '')::date,
      coalesce(nullif(v_elem ->> 'date_of_birth_precision', ''), 'day'),
      nullif(btrim(v_elem ->> 'city_of_birth'), ''),
      btrim(v_elem ->> 'country_of_birth'),
      v_deceased,
      case when v_deceased then nullif(v_elem ->> 'date_of_death', '')::date end,
      case when v_deceased
        then coalesce(nullif(v_elem ->> 'date_of_death_precision', ''), 'day')
        else 'day' end,
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

-- ---------------------------------------------------------------------------
-- public.start_own_tree — carries the two precisions (Step 9 seam, flagged).
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
    tree_id, first_name, middle_name, preferred_name, last_name,
    date_of_birth, date_of_birth_precision, city_of_birth, country_of_birth,
    is_deceased, date_of_death, date_of_death_precision, place_of_death,
    created_by, owner_user_id
  ) values (
    v_new_tree,
    nullif(btrim(p_person ->> 'first_name'), ''),
    nullif(btrim(p_person ->> 'middle_name'), ''),
    nullif(btrim(p_person ->> 'preferred_name'), ''),
    btrim(p_person ->> 'last_name'),
    nullif(p_person ->> 'date_of_birth', '')::date,
    coalesce(nullif(p_person ->> 'date_of_birth_precision', ''), 'day'),
    nullif(btrim(p_person ->> 'city_of_birth'), ''),
    btrim(p_person ->> 'country_of_birth'),
    v_deceased,
    case when v_deceased then nullif(p_person ->> 'date_of_death', '')::date end,
    case when v_deceased
      then coalesce(nullif(p_person ->> 'date_of_death_precision', ''), 'day')
      else 'day' end,
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

-- ---------------------------------------------------------------------------
-- private.person_edit_notify — a precision-only change is a date change.
-- The trigger that calls it is untouched: `create or replace` keeps the
-- function's identity, so `people_edit_notify` picks the new body up as is.
-- ---------------------------------------------------------------------------
create or replace function private.person_edit_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_label text;
  v_changes text[] := '{}';
  v_body text;
begin
  if new.first_name is distinct from old.first_name
     or new.preferred_name is distinct from old.preferred_name
     or new.middle_name is distinct from old.middle_name then
    v_changes := v_changes || 'name'::text;
  end if;
  if new.last_name is distinct from old.last_name
     or new.maiden_name is distinct from old.maiden_name then
    v_changes := v_changes || 'family name'::text;
  end if;
  if new.date_of_birth is distinct from old.date_of_birth
     or new.date_of_birth_precision is distinct from old.date_of_birth_precision then
    v_changes := v_changes || 'date of birth'::text;
  end if;
  if new.city_of_birth is distinct from old.city_of_birth
     or new.country_of_birth is distinct from old.country_of_birth
     or new.place_id_birth is distinct from old.place_id_birth then
    v_changes := v_changes || 'birthplace'::text;
  end if;
  if new.is_deceased is distinct from old.is_deceased
     or new.date_of_death is distinct from old.date_of_death
     or new.date_of_death_precision is distinct from old.date_of_death_precision
     or new.place_of_death is distinct from old.place_of_death
     or new.place_id_death is distinct from old.place_id_death then
    v_changes := v_changes || 'death details'::text;
  end if;
  if new.sex is distinct from old.sex then
    v_changes := v_changes || 'sex'::text;
  end if;
  if new.lineage_type is distinct from old.lineage_type then
    v_changes := v_changes || 'lineage'::text;
  end if;
  if new.photo_path is distinct from old.photo_path
     or new.photo_crop is distinct from old.photo_crop then
    v_changes := v_changes || 'photo'::text;
  end if;

  if array_length(v_changes, 1) is null then
    return new;
  end if;

  v_label := private.person_label(new.id);
  v_body := v_label || ' was updated: '
    || array_to_string(v_changes, ', ') || '.';

  perform private.notify(
    new.owner_user_id, v_actor, 'entry_updated', new.id, null, v_body
  );
  if new.created_by is distinct from new.owner_user_id then
    perform private.notify(
      new.created_by, v_actor, 'entry_updated', new.id, null, v_body
    );
  end if;
  return new;
end;
$$;

grant execute on function private.person_edit_notify()
  to authenticated, service_role;
