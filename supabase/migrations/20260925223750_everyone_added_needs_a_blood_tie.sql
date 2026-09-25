-- Step 53 — Everyone added needs a blood tie
--
-- Found on live (2026-09-25): a Root added Rosy Tejpar as the mother of
-- Shireen Suleman, who married into the family, and nothing tied Rosy to
-- anyone born into it. The bloodline gate (Steps 14 and 14.2) held only a
-- member who had married in themselves, so Roots, blood members and a
-- newcomer adding themselves could hang anyone off an in-law. Aalim's rule:
-- a direct bloodline tie first, whoever is adding, Roots included.
--
-- On every tree with anchors, each new entry must now, once the call's lines
-- are drawn, be blood, or have a line straight to someone who is: a partner,
-- or the other parent of a blood child. Nobody joins only through someone
-- who married in: not their parents or siblings, a child from another
-- relationship, or a later partner. That holds for Roots, Branches and
-- Leaves, blood or married in, and for a newcomer adding themselves.
-- Bringing people over from another tree (`place_people`) is held to it too,
-- judged across the whole batch as if every placement in it were accepted.
-- A member's own entry shown when they accept an invite is not, and a tree
-- with no anchors still has no gate. The refusal names who has no tie.
--
-- A sibling line now carries blood: someone recorded as a blood relative's
-- brother or sister is blood, so their partner and children can follow.
-- Until now only parent lines counted, so a sibling line left them outside.
--
-- Step 14.2's allowance for a married-in member's own descendants, whoever
-- the other parent, goes. A child of theirs is blood once the blood partner
-- is named as a parent too, which the add flow ticks for a current partner;
-- a child from another relationship has no blood tie.

-- ---------------------------------------------------------------------------
-- 1. The bloodline, with sibling lines
-- ---------------------------------------------------------------------------
-- Up every parent line from the anchors, then down every parent line and
-- across every sibling line from that whole set, keeping to the people the
-- tree shows. Never up again from anyone reached on the way down, so a
-- partner who married in stays out. `p_also_placed` counts as shown: a batch
-- being brought over is judged as a whole.
create or replace function private.blood_ids(p_tree uuid, p_also_placed uuid[] default '{}')
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive on_tree as (
    select pl.person_id as id
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.status = 'active'
    union
    select u.id from unnest(coalesce(p_also_placed, '{}'::uuid[])) as u(id)
  ),
  up as (
    select a.person_id as id
    from public.bloodline_anchors a
    where a.tree_id = p_tree
    union
    select r.from_person as id
    from up
    join public.relationships r on r.to_person = up.id and r.type = 'parent'
    where r.from_person in (select id from on_tree)
  ),
  step as (
    select r.from_person as a, r.to_person as b
    from public.relationships r where r.type = 'parent'
    union all
    select r.from_person, r.to_person
    from public.relationships r where r.type = 'sibling'
    union all
    select r.to_person, r.from_person
    from public.relationships r where r.type = 'sibling'
  ),
  blood as (
    select up.id from up
    union
    select s.b as id
    from blood
    join step s on s.a = blood.id
    where s.b in (select id from on_tree)
  )
  select id from blood;
$$;

grant execute on function private.blood_ids(uuid, uuid[]) to authenticated, service_role;

-- What `my_growth_rights` and everything else reads, now with sibling lines.
create or replace function private.bloodline_ids(p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from private.blood_ids(p_tree) as b(id);
$$;

-- ---------------------------------------------------------------------------
-- 2. Who has no blood tie
-- ---------------------------------------------------------------------------
-- Of `p_people`, in their order: everyone who isn't blood and has no line to
-- anyone who is. Empty on a tree with no anchors.
create or replace function private.without_blood_tie(
  p_tree uuid,
  p_people uuid[],
  p_also_placed uuid[] default '{}'
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with blood as (
    select b.id from private.blood_ids(p_tree, p_also_placed) as b(id)
  )
  select coalesce(array_agg(u.id order by u.ord), '{}'::uuid[])
  from unnest(p_people) with ordinality as u(id, ord)
  where private.bloodline_gate_active(p_tree)
    and not exists (select 1 from blood where blood.id = u.id)
    and not exists (
      select 1
      from public.relationships r
      join blood
        on blood.id = case when r.from_person = u.id then r.to_person else r.from_person end
      where u.id in (r.from_person, r.to_person)
    );
$$;

grant execute on function private.without_blood_tie(uuid, uuid[], uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Adding people: the gate holds everyone
-- ---------------------------------------------------------------------------
-- As `20260923090000_three_account_types`, but with a new step 5b.
create or replace function public.add_people_with_connections(
  p_people jsonb,
  p_edges jsonb default '[]'::jsonb,
  p_self_index integer default null,
  p_suggestions jsonb default '[]'::jsonb,
  p_tree uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
  v_is_root boolean;
  v_self_existing uuid;
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
  v_unreached uuid[];
  v_self_id uuid := null;
  v_res text;
  v_resolved_at timestamptz;
  v_outside uuid[];
  v_line_from uuid;
  v_line uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_tree is null then
    raise exception 'No family tree exists yet';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;
  v_is_root := private.is_root_of(v_tree);

  select self_person_id into v_self_existing
  from public.profiles where auth_user_id = v_uid;

  if p_people is null or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) = 0 then
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

  -- 1. People: home = this tree (the home placement follows by trigger).
  for v_i in 0 .. v_count - 1 loop
    v_elem := p_people -> v_i;
    v_deceased := coalesce((v_elem ->> 'is_deceased')::boolean, false);
    insert into public.people (
      tree_id, first_name, middle_name, preferred_name, last_name, maiden_name,
      date_of_birth, date_of_birth_precision, city_of_birth, country_of_birth,
      is_deceased, date_of_death, date_of_death_precision, place_of_death,
      lineage_type, created_by, owner_user_id
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

  -- 2. Lines, drawn on this tree.
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
        v_type, v_uid,
        case when v_type = 'spouse' then nullif(v_edge ->> 'marriage_date', '')::date end,
        case when v_type = 'spouse' then coalesce((v_edge ->> 'is_divorced')::boolean, false) else false end,
        case when v_type = 'spouse' and coalesce((v_edge ->> 'is_divorced')::boolean, false)
          then nullif(v_edge ->> 'divorce_date', '')::date end
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 3. Resolved implied connections.
  if p_suggestions is not null and jsonb_typeof(p_suggestions) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_suggestions) - 1 loop
      v_edge := p_suggestions -> v_i;
      v_type := v_edge ->> 'suggested_type';
      if v_type is null or v_type not in ('spouse', 'parent', 'sibling_check', 'duplicate_check') then
        raise exception 'Unknown suggestion type: %', coalesce(v_type, '(null)');
      end if;
      if (v_edge ->> 'source') is null or (v_edge ->> 'source') not in
         ('co_parent', 'unlinked_spouse_child', 'sibling_implied_parent', 'shared_neighbours', 'name_dob_match') then
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
        v_tree, v_a, v_b, v_type, v_edge ->> 'source', v_res, v_uid,
        case when v_res = 'pending' then null else v_uid end, v_resolved_at
      )
      on conflict on constraint connection_suggestions_unique_key do nothing;

      if v_res = 'accepted' and v_type in ('spouse', 'parent') then
        insert into public.relationships (tree_id, from_person, to_person, type, created_by)
        values (
          v_tree,
          case when v_type = 'spouse' then least(v_a, v_b) else v_a end,
          case when v_type = 'spouse' then greatest(v_a, v_b) else v_b end,
          v_type, v_uid
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- 4. No loops, no partner who is also a parent.
  perform private.assert_tree_consistent(v_tree);

  -- 5. Every new person must reach someone already on this tree (Roots may
  --    seed).
  if not v_is_root then
    with recursive placed as (
      select person_id as id from public.tree_placements
      where tree_id = v_tree and status = 'active'
    ),
    rel_edges as (
      select r.from_person as a, r.to_person as b
      from public.relationships r
      join placed pa on pa.id = r.from_person
      join placed pb on pb.id = r.to_person
      union all
      select r.to_person as a, r.from_person as b
      from public.relationships r
      join placed pa on pa.id = r.from_person
      join placed pb on pb.id = r.to_person
    ),
    reach as (
      select id as node from placed where not (id = any(v_ids))
      union
      select e.b from reach r join rel_edges e on e.a = r.node
    )
    select array_agg(x) into v_unreached
    from unnest(v_ids) as x
    where x not in (select node from reach);

    if v_unreached is not null and array_length(v_unreached, 1) > 0 then
      raise exception 'New entries must connect to someone already in the tree'
        using errcode = '23514';
    end if;
  end if;

  -- 5b. Everyone added needs a blood tie (Step 53), whoever is adding: once
  --     this call's lines are drawn, each new entry is blood, or has a line
  --     straight to someone who is. The detail says which of `p_people`.
  v_outside := private.without_blood_tie(v_tree, v_ids);
  if cardinality(v_outside) > 0 then
    raise exception 'BLOODLINE_GATE: % has no blood tie to this tree',
      coalesce(nullif(private.person_label(v_outside[1]), ''), 'Someone')
      using errcode = '42501',
            detail = 'new:' || (array_position(v_ids, v_outside[1]) - 1);
  end if;

  -- 5c. A Leaf adds on their own line (Step 34): every new entry must be on
  --     it once this call's lines are drawn. Measured from their own entry,
  --     or the one this call makes for them, so a new great-grandparent
  --     counts, and so do that great-grandparent's other children after.
  if private.role_in(v_tree) = 'member' then
    v_line_from := coalesce(v_self_existing, v_ids[p_self_index + 1]);
    if v_line_from is null then
      raise exception 'OWN_LINE: a Leaf adds relatives once their own entry is on the tree'
        using errcode = '42501';
    end if;
    v_line := array(select private.line_ids(v_line_from, v_tree));

    select array_agg(x) into v_outside
    from unnest(v_ids) as x
    where not (x = any(v_line));

    if v_outside is not null then
      raise exception 'OWN_LINE: a Leaf adds relatives on their own line'
        using errcode = '42501';
    end if;
  end if;

  -- 6. The caller's own entry; a founding Root's becomes the tree's anchor.
  if p_self_index is not null then
    v_self_id := v_ids[p_self_index + 1];
    update public.profiles set self_person_id = v_self_id where auth_user_id = v_uid;
    if v_is_root then
      insert into public.bloodline_anchors (tree_id, person_id, created_by)
      values (v_tree, v_self_id, v_uid)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'self_id', v_self_id);
end;
$$;

revoke all on function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid) from anon, public;
grant execute on function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Bringing people over: the same, across the batch
-- ---------------------------------------------------------------------------
-- As `20260923062000_founder_anchor_on_placement`, plus the check after the
-- loop. The founder's own entry anchors the tree first, so their relatives
-- in the same batch are judged against it. The detail is the person's id.
create or replace function public.place_people(p_tree uuid, p_person_ids uuid[])
returns table (placed_person_id uuid, placement_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_owner uuid;
  v_status text;
  v_tree_name text;
  v_founder uuid;
  v_self uuid;
  v_outside uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can bring people onto a tree' using errcode = '42501';
  end if;
  select name, created_by into v_tree_name, v_founder from public.trees where id = p_tree;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  foreach v_person in array coalesce(p_person_ids, '{}') loop
    if not private.can_see_person(v_person) then
      raise exception 'You can only bring people you can see on a tree you belong to'
        using errcode = '42501';
    end if;

    v_owner := private.person_owner_member(v_person);
    v_status := case when v_owner is null or v_owner = v_uid then 'active' else 'pending' end;

    insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
    values (p_tree, v_person, v_status, v_uid, case when v_status = 'active' then now() end)
    on conflict (tree_id, person_id) do update
      set status = case when tp.status = 'active' then 'active' else excluded.status end,
          placed_by = excluded.placed_by,
          responded_at = case when excluded.status = 'active' then now() end
    returning tp.status into v_status;

    -- The founder's own entry, on the tree they founded, is its anchor —
    -- as adding themselves would have made it.
    if v_status = 'active'
       and v_person = v_self
       and v_founder = v_uid
       and not private.bloodline_gate_active(p_tree) then
      insert into public.bloodline_anchors (tree_id, person_id, created_by)
      values (p_tree, v_person, v_uid)
      on conflict do nothing;
    end if;

    if v_status = 'pending' then
      perform private.notify(
        v_owner, v_uid, 'placement_requested', v_person, null,
        coalesce(private.member_label(v_uid), 'A Root')
          || ' would like to show your entry on ' || coalesce(v_tree_name, 'their tree')
          || '. Accept or decline from your account.',
        p_tree
      );
    end if;

    placed_person_id := v_person;
    placement_status := v_status;
    return next;
  end loop;

  -- Everyone brought over needs a blood tie here (Step 53), judged across
  -- the whole batch as if every placement in it were accepted.
  v_outside := private.without_blood_tie(p_tree, p_person_ids, p_person_ids);
  if cardinality(v_outside) > 0 then
    raise exception 'BLOODLINE_GATE: % has no blood tie to this tree',
      coalesce(nullif(private.person_label(v_outside[1]), ''), 'Someone')
      using errcode = '42501',
            detail = v_outside[1]::text;
  end if;

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.place_people(uuid, uuid[]) from anon, public;
grant execute on function public.place_people(uuid, uuid[]) to authenticated, service_role;
