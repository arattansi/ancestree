-- Step 98.1: children under 18 are added by their parent.
--
-- Adding someone who could be a child (someone's child or sibling once the
-- call's lines are drawn) asks "18 or older?" of whoever isn't their parent:
-- `add_people_with_connections` takes each person's answer as `adult` and
-- refuses (`MINOR`) a living one without a yes, or whose date of birth says
-- they're under 18 whatever the answer. The deceased aren't asked about, nor
-- is the caller's own new entry, nor a child whose parents include the
-- caller's own entry. Behind it:
--   * `people_before_write` refuses an update that gives a living person a
--     date of birth under 18, unless it's their own entry or their parent's
--     edit (edits, fills, accepted suggestions, undos);
--   * `connect_people` refuses the first line that makes a living child
--     under 18 someone's child or sibling, unless their parent draws it;
--   * `people_insert` goes: every entry is added through
--     `add_people_with_connections` (it's a definer and doesn't need it), so
--     nobody can add an unconnected entry to line up afterwards.

-- 'adult' when a date of birth is 18 years ago or more however it's read
-- (a year or a month counts from its last day), 'minor' when it's under 18
-- however it's read (from its first), else 'unknown' (no date, or a year or
-- month that straddles the day). `lib/minors.ts#ageFromBirth` mirrors it.
create or replace function private.birth_age(p_dob date, p_precision text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_dob is null then 'unknown'
    when p_dob > (current_date - interval '18 years')::date then 'minor'
    when (case p_precision
            when 'year' then (date_trunc('year', p_dob) + interval '1 year - 1 day')::date
            when 'month' then (date_trunc('month', p_dob) + interval '1 month - 1 day')::date
            else p_dob
          end) <= (current_date - interval '18 years')::date then 'adult'
    else 'unknown'
  end;
$$;

-- Whether the caller's own entry is drawn as this person's parent.
create or replace function private.is_own_child(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.relationships r
    where r.type = 'parent' and r.to_person = p_person
      and r.from_person = private.self_person_id()
  );
$$;

revoke all on function private.birth_age(date, text) from public, anon, authenticated;
revoke all on function private.is_own_child(uuid) from public, anon, authenticated;

drop policy if exists people_insert on public.people;

CREATE OR REPLACE FUNCTION public.add_people_with_connections(p_people jsonb, p_edges jsonb DEFAULT '[]'::jsonb, p_self_index integer DEFAULT NULL::integer, p_suggestions jsonb DEFAULT '[]'::jsonb, p_tree uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_age text;
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
      date_of_birth, date_of_birth_precision, birth_month, birth_day,
      city_of_birth, country_of_birth,
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
      nullif(v_elem ->> 'birth_month', '')::smallint,
      nullif(v_elem ->> 'birth_day', '')::smallint,
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
        created_by, marriage_date, marriage_month, marriage_day, is_divorced,
        divorce_date)
      values (
        v_tree,
        case when v_type in ('spouse', 'sibling') then least(v_a, v_b) else v_a end,
        case when v_type in ('spouse', 'sibling') then greatest(v_a, v_b) else v_b end,
        v_type, v_uid,
        case when v_type = 'spouse' then nullif(v_edge ->> 'marriage_date', '')::date end,
        case when v_type = 'spouse' then nullif(v_edge ->> 'marriage_month', '')::smallint end,
        case when v_type = 'spouse' then nullif(v_edge ->> 'marriage_day', '')::smallint end,
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

  -- 5d. Children under 18 (Step 98): only their parent adds them. A new
  --     living entry that is someone's child or sibling once this call's
  --     lines are drawn, and whose parents don't include the caller's own
  --     entry, needs a yes to "18 or older?" (`adult`) unless its date of
  --     birth says so already, and is refused whatever the answer when its
  --     date of birth says they're under 18. The caller's own new entry and
  --     anyone who has died aren't asked about. The detail says which of
  --     `p_people`.
  v_line_from := coalesce(v_self_existing, v_ids[p_self_index + 1]);
  for v_i in 1 .. v_count loop
    v_person := v_ids[v_i];
    continue when p_self_index is not null and v_i = p_self_index + 1;
    select pe.is_deceased or pe.date_of_death is not null,
           private.birth_age(pe.date_of_birth, pe.date_of_birth_precision)
      into v_deceased, v_age
      from public.people pe where pe.id = v_person;
    continue when v_deceased or v_age = 'adult';
    continue when not exists (
      select 1 from public.relationships r
      where (r.type = 'parent' and r.to_person = v_person)
         or (r.type = 'sibling' and v_person in (r.from_person, r.to_person))
    );
    continue when v_line_from is not null and exists (
      select 1 from public.relationships r
      where r.type = 'parent' and r.to_person = v_person
        and r.from_person = v_line_from
    );
    if v_age = 'minor'
       or not coalesce((p_people -> (v_i - 1) ->> 'adult')::boolean, false) then
      raise exception 'MINOR: % is under 18; only their parent can add them',
        coalesce(nullif(private.person_label(v_person), ''), 'Someone')
        using errcode = '42501',
              detail = 'new:' || (v_i - 1);
    end if;
  end loop;

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
$function$;

CREATE OR REPLACE FUNCTION private.people_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := new.created_by;
    end if;
    if (select auth.uid()) is not null and not private.is_root_of(new.tree_id) then
      new.lineage_type := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if (select auth.uid()) is not null
       and not private.is_root_of(new.tree_id)
       and new.lineage_type is distinct from old.lineage_type then
      raise exception 'lineage_type can only be changed by a Root' using errcode = '42501';
    end if;
    if new.tree_id is distinct from old.tree_id
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on'
       and (select auth.uid()) is not null then
      raise exception 'HOME_TREE: change a home tree through set_home_tree' using errcode = '42501';
    end if;
    -- A living child's date of birth under 18 is their parent's to give
    -- (Step 98), or their own; anyone else's edit, fill, accepted
    -- suggestion or undo that sets one is refused.
    if (select auth.uid()) is not null
       and (new.date_of_birth, new.date_of_birth_precision, new.is_deceased, new.date_of_death)
           is distinct from
           (old.date_of_birth, old.date_of_birth_precision, old.is_deceased, old.date_of_death)
       and not new.is_deceased and new.date_of_death is null
       and private.birth_age(new.date_of_birth, new.date_of_birth_precision) = 'minor'
       and new.id is distinct from private.self_person_id()
       and not private.is_own_child(new.id) then
      raise exception 'MINOR: % is under 18; only their parent can give that date of birth',
        coalesce(nullif(private.person_label(new.id), ''), 'Someone')
        using errcode = '42501';
    end if;
  end if;
  -- A rough date needs its date (Step 81): when the date goes, circa goes.
  if new.date_of_birth is null then
    new.date_of_birth_circa := false;
  end if;
  if new.date_of_death is null then
    new.date_of_death_circa := false;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.connect_people(p_from uuid, p_to uuid, p_type text, p_marriage_date date DEFAULT NULL::date, p_is_divorced boolean DEFAULT false, p_divorce_date date DEFAULT NULL::date, p_tree uuid DEFAULT NULL::uuid, p_marriage_month smallint DEFAULT NULL::smallint, p_marriage_day smallint DEFAULT NULL::smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
  v_directed boolean := (p_type = 'parent');
  v_a uuid;
  v_b uuid;
  v_id uuid;
  v_child uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('parent', 'spouse', 'sibling') then
    raise exception 'Unknown relationship type: %', coalesce(p_type, '(null)');
  end if;
  if p_from = p_to then
    raise exception 'A person cannot connect to themselves' using errcode = '23514';
  end if;

  -- The tree being worked on, else any tree the caller belongs to that shows
  -- both people.
  v_tree := coalesce(
    p_tree,
    (select pl.tree_id
     from public.tree_placements pl
     join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
     where pl.person_id = p_from and pl.status = 'active'
       and private.is_placed(pl.tree_id, p_to)
     order by (pl.tree_id = private.home_tree(p_from)) desc
     limit 1)
  );
  if v_tree is null or not private.can_connect_on(v_tree, p_from, p_to) then
    raise exception 'Those two are not both on a tree you can draw on' using errcode = '42501';
  end if;

  v_a := case when v_directed then p_from else least(p_from, p_to) end;
  v_b := case when v_directed then p_to else greatest(p_from, p_to) end;

  if exists (
    select 1 from public.relationships r
    where r.type <> p_type
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
  ) then
    raise exception 'Those two are already connected another way' using errcode = '23514';
  end if;

  insert into public.relationships (
    tree_id, from_person, to_person, type, created_by, marriage_date,
    marriage_month, marriage_day, is_divorced, divorce_date
  )
  values (
    v_tree, v_a, v_b, p_type, v_uid,
    case when p_type = 'spouse' then p_marriage_date end,
    case when p_type = 'spouse' then p_marriage_month end,
    case when p_type = 'spouse' then p_marriage_day end,
    case when p_type = 'spouse' then coalesce(p_is_divorced, false) else false end,
    case when p_type = 'spouse' and coalesce(p_is_divorced, false) then p_divorce_date end
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id
    from public.relationships r
    where r.type = p_type
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b);
  end if;

  if v_directed then
    perform private.assert_tree_consistent(v_tree);
  end if;

  -- A living child under 18 joins a family through their parent (Step 98):
  -- the first line making them someone's child or sibling is a parent's own.
  if p_type in ('parent', 'sibling') then
    foreach v_child in array
      case when v_directed then array[v_b] else array[v_a, v_b] end
    loop
      if v_child is distinct from private.self_person_id()
         and not private.is_own_child(v_child)
         and exists (
           select 1 from public.people pe
           where pe.id = v_child and not pe.is_deceased
             and pe.date_of_death is null
             and private.birth_age(pe.date_of_birth, pe.date_of_birth_precision) = 'minor'
         )
         and not exists (
           select 1 from public.relationships r
           where r.id <> v_id
             and ((r.type = 'parent' and r.to_person = v_child)
               or (r.type = 'sibling' and v_child in (r.from_person, r.to_person)))
         ) then
        raise exception 'MINOR: % is under 18; only their parent can add them',
          coalesce(nullif(private.person_label(v_child), ''), 'Someone')
          using errcode = '42501';
      end if;
    end loop;
  end if;

  return v_id;
end;
$function$;
