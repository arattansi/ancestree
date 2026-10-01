-- Step 98.1, the gap closed: ask when the line is drawn.
--
-- 98.1 asked "18 or older?" only of people being added. Someone added
-- without the question (as a partner, or a Root's unconnected entry) could
-- then be drawn as someone's child or sibling with no date of birth, and so
-- nobody asked. Now every line asks: a trigger on `relationships` judges
-- the first line that makes a living person someone's child or sibling,
-- however it's drawn (`add_people_with_connections`, `connect_people`,
-- `resolve_implied_connection`, `resolve_connection_suggestion`):
--   * born under 18: refused (`MINOR`), unless their parent draws it;
--   * no date that says they're an adult, and nobody has said yes for
--     them: refused with `ASK_ADULT` (detail `existing:<id>`), which the
--     app turns into "Is {name} 18 or older?" and sends again with the
--     answer (`p_adult_existing` / `p_adults`);
--   * their parent drawing it, their own entry, the deceased, and anyone
--     with a parent or sibling line already: not asked.
-- A yes is kept (`private.adult_confirmations`), so nobody is asked about
-- twice; 98.1's yeses for new entries are kept too. This call's own new
-- entries are left to 98.1's check once all their lines are drawn
-- (`ancestree.new_people`, `private.note_new_people`). The guard 98.1 put
-- in `connect_people` moves into the trigger.

create table private.adult_confirmations (
  person_id uuid primary key references public.people (id) on delete cascade,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz not null default now()
);
revoke all on private.adult_confirmations from public, anon, authenticated;

-- Record "yes, 18 or older" for these people, from the caller.
create or replace function private.confirm_adults(p_people uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.adult_confirmations (person_id, confirmed_by)
  select distinct x, (select auth.uid())
  from unnest(coalesce(p_people, '{}'::uuid[])) as x
  where x is not null
    and exists (select 1 from public.people pe where pe.id = x)
  on conflict (person_id) do nothing;
$$;

-- The people a call is adding while it draws their lines, whom the line
-- guard leaves to the call's own check (`add_people_with_connections` 5d,
-- or a placeholder's RPC, 98.2). Null clears it once the lines are in, so
-- nothing after in the same transaction is skipped.
create or replace function private.note_new_people(p_people uuid[])
returns void
language sql
set search_path = ''
as $$
  select set_config(
    'ancestree.new_people',
    coalesce(array_to_string(p_people, ','), ''),
    true
  );
$$;

create or replace function private.relationships_minor_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_self uuid;
  v_child uuid;
  v_gone boolean;
  v_age text;
  v_new text[] := string_to_array(
    coalesce(current_setting('ancestree.new_people', true), ''), ',');
begin
  if (select auth.uid()) is null or new.type not in ('parent', 'sibling') then
    return new;
  end if;
  v_self := private.self_person_id();
  foreach v_child in array
    case when new.type = 'parent' then array[new.to_person]
         else array[new.from_person, new.to_person] end
  loop
    continue when v_child = v_self;
    continue when v_child::text = any(v_new);
    -- Their parent drawing it.
    continue when new.type = 'parent' and new.from_person = v_self;
    select pe.is_deceased or pe.date_of_death is not null,
           private.birth_age(pe.date_of_birth, pe.date_of_birth_precision)
      into v_gone, v_age
      from public.people pe where pe.id = v_child;
    continue when v_gone or v_age = 'adult';
    -- Someone's child or sibling already: not the line that makes them one.
    continue when exists (
      select 1 from public.relationships r
      where (r.type = 'parent' and r.to_person = v_child)
         or (r.type = 'sibling' and v_child in (r.from_person, r.to_person))
    );
    if v_age = 'minor' then
      raise exception 'MINOR: % is under 18; only their parent can add them',
        coalesce(nullif(private.person_label(v_child), ''), 'Someone')
        using errcode = '42501', detail = 'existing:' || v_child;
    end if;
    if not exists (
      select 1 from private.adult_confirmations c where c.person_id = v_child
    ) then
      raise exception 'ASK_ADULT: is % 18 or older?',
        coalesce(nullif(private.person_label(v_child), ''), 'Someone')
        using errcode = '42501', detail = 'existing:' || v_child;
    end if;
  end loop;
  return new;
end;
$$;

create trigger relationships_minor_guard
  before insert on public.relationships
  for each row execute function private.relationships_minor_guard();

revoke all on function private.confirm_adults(uuid[]) from public, anon, authenticated;
revoke all on function private.note_new_people(uuid[]) from public, anon, authenticated;
revoke all on function private.relationships_minor_guard() from public, anon, authenticated;

-- Each RPC takes its yeses as one more argument, so the old signature goes.
drop function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid);
drop function public.connect_people(uuid, uuid, text, date, boolean, date, uuid, smallint, smallint);
drop function public.resolve_implied_connection(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.add_people_with_connections(p_people jsonb, p_edges jsonb DEFAULT '[]'::jsonb, p_self_index integer DEFAULT NULL::integer, p_suggestions jsonb DEFAULT '[]'::jsonb, p_tree uuid DEFAULT NULL::uuid, p_adult_existing uuid[] DEFAULT NULL::uuid[])
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

  -- Step 98: this call's new entries are judged once their lines are drawn
  -- (5d), not line by line; anyone already on the tree whom a line makes
  -- someone's child or sibling for the first time is asked about as it goes
  -- in (`private.relationships_minor_guard`), this call's yeses for them
  -- (`p_adult_existing`, people on this tree) taken first.
  perform private.note_new_people(v_ids);
  perform private.confirm_adults(array(
    select x from unnest(p_adult_existing) as x
    where private.is_placed(v_tree, x)
  ));

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

  perform private.note_new_people(null);

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
    -- A yes stands: no line drawn to them later asks again.
    perform private.confirm_adults(array[v_person]);
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

CREATE OR REPLACE FUNCTION public.connect_people(p_from uuid, p_to uuid, p_type text, p_marriage_date date DEFAULT NULL::date, p_is_divorced boolean DEFAULT false, p_divorce_date date DEFAULT NULL::date, p_tree uuid DEFAULT NULL::uuid, p_marriage_month smallint DEFAULT NULL::smallint, p_marriage_day smallint DEFAULT NULL::smallint, p_adults uuid[] DEFAULT NULL::uuid[])
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

  -- "18 or older?" answered yes for either end (Step 98): the line's guard
  -- asks about anyone else it makes someone's child or sibling.
  perform private.confirm_adults(array(
    select x from unnest(p_adults) as x where x in (p_from, p_to)
  ));

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

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_implied_connection(p_subject uuid, p_related uuid, p_type text, p_source text, p_resolution text, p_adults uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
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
  if p_source not in ('co_parent', 'unlinked_spouse_child', 'sibling_implied_parent', 'shared_neighbours', 'name_dob_match') then
    raise exception 'Unknown suggestion source: %', p_source;
  end if;
  if p_subject = p_related then
    raise exception 'A suggestion cannot link a person to themselves';
  end if;

  select pl.tree_id into v_tree
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
  where pl.person_id = p_subject and pl.status = 'active' and private.is_placed(pl.tree_id, p_related)
  order by (pl.tree_id = private.home_tree(p_subject)) desc
  limit 1;
  if v_tree is null then
    raise exception 'Those two entries are not both on a tree you belong to' using errcode = '42501';
  end if;

  insert into public.connection_suggestions (
    tree_id, subject_person_id, related_person_id, suggested_type, source,
    status, created_by, resolved_by, resolved_at
  ) values (
    v_tree,
    case when p_type in ('spouse', 'sibling_check', 'duplicate_check') then least(p_subject, p_related) else p_subject end,
    case when p_type in ('spouse', 'sibling_check', 'duplicate_check') then greatest(p_subject, p_related) else p_related end,
    p_type, p_source, p_resolution, v_uid, v_uid, now()
  )
  on conflict on constraint connection_suggestions_unique_key do nothing;

  if p_resolution <> 'accepted' or p_type not in ('spouse', 'parent') then
    return;
  end if;
  if not private.can_connect_on(v_tree, p_subject, p_related) then
    raise exception 'You can''t draw lines on this tree' using errcode = '42501';
  end if;

  v_a := p_subject;
  v_b := p_related;
  -- "18 or older?" answered yes (Step 98), as `connect_people` takes it.
  perform private.confirm_adults(array(
    select x from unnest(p_adults) as x where x in (p_subject, p_related)
  ));

  insert into public.relationships (tree_id, from_person, to_person, type, created_by)
  values (
    v_tree,
    case when p_type = 'spouse' then least(v_a, v_b) else v_a end,
    case when p_type = 'spouse' then greatest(v_a, v_b) else v_b end,
    p_type, v_uid
  )
  on conflict do nothing;

  perform private.assert_tree_consistent(v_tree);
end;
$function$;

revoke all on function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid, uuid[]) from public, anon;
grant execute on function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid, uuid[]) to authenticated, service_role;
revoke all on function public.connect_people(uuid, uuid, text, date, boolean, date, uuid, smallint, smallint, uuid[]) from public, anon;
grant execute on function public.connect_people(uuid, uuid, text, date, boolean, date, uuid, smallint, smallint, uuid[]) to authenticated, service_role;
revoke all on function public.resolve_implied_connection(uuid, uuid, text, text, text, uuid[]) from public, anon;
grant execute on function public.resolve_implied_connection(uuid, uuid, text, text, text, uuid[]) to authenticated, service_role;
