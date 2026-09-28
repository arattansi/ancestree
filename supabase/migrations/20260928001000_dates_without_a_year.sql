-- Step 63 — A birthday or a wedding anniversary without its year.
--
-- Aalim asked that someone "should be able to add day and month without year
-- for birthdays/anniversaries". A date of birth is a `date` plus how much of
-- it is known (Step 17), and a `date` always has a year; so a day and month
-- alone are kept apart, and only while there's no date:
--
--     people.birth_month / birth_day              a birthday, year unknown
--     relationships.marriage_month / marriage_day  a wedding day, year unknown
--
-- With no `date_of_birth` behind them, everything that reads a birth year —
-- lifespans, search, sibling order, period place names, claim and invite
-- matching — sees none, as before, and needs no change. What shows or saves
-- a whole date learns the new pair: tree_people and tree_edges carry it (as
-- trailing columns, so the views are replaced in place), and so do the
-- writers — add_people_with_connections, connect_people (two new trailing
-- arguments, so a new signature), fill_person_blanks (a birthday fills the
-- date of birth), revision_fields (a Root can undo it) and person_edit_notify
-- (changing it is changing the date of birth). A day and month is checked
-- against a leap year, so 29 February is allowed.
--
-- Each function is its latest migration's body, which matched live by md5,
-- with only the lines named here changed. Additive: the app before it sends
-- neither pair and keeps working, so this goes live before the code.
--
-- Down: re-run the five functions from their migrations
-- (20260925223750, 20260922090000 with its drop of this connect_people,
-- 20260923170000 and 20260923141000), the two views from Step 62's
-- migration and 20260922100000 (dropped first: a view can't lose columns
-- in place), then drop the four columns.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.people
  add column birth_month smallint,
  add column birth_day smallint,
  add constraint people_birthday_without_year check (
    (birth_month is null and birth_day is null)
    or (
      date_of_birth is null
      -- Spelled out: a comparison with a null is null, which a check lets by.
      and birth_month is not null
      and birth_day is not null
      and birth_month between 1 and 12
      and birth_day between 1 and case
        when birth_month = 2 then 29
        when birth_month in (4, 6, 9, 11) then 30
        else 31
      end
    )
  );

comment on column public.people.birth_month is
  'A birthday whose year isn''t known (Step 63): its month, with birth_day. Set only while date_of_birth is null.';
comment on column public.people.birth_day is
  'A birthday whose year isn''t known (Step 63): its day of the month, with birth_month.';

alter table public.relationships
  add column marriage_month smallint,
  add column marriage_day smallint,
  add constraint relationships_marriage_without_year check (
    (marriage_month is null and marriage_day is null)
    or (
      type = 'spouse'
      and marriage_date is null
      and marriage_month is not null
      and marriage_day is not null
      and marriage_month between 1 and 12
      and marriage_day between 1 and case
        when marriage_month = 2 then 29
        when marriage_month in (4, 6, 9, 11) then 30
        else 31
      end
    )
  );

comment on column public.relationships.marriage_month is
  'A wedding day whose year isn''t known (Step 63): its month, with marriage_day. Spouse lines only, and only while marriage_date is null.';
comment on column public.relationships.marriage_day is
  'A wedding day whose year isn''t known (Step 63): its day of the month, with marriage_month.';

-- ---------------------------------------------------------------------------
-- The views: the new columns at the end
-- ---------------------------------------------------------------------------

create or replace view public.tree_people
with (security_invoker = true) as
select
  pl.tree_id,
  pl.id as placement_id,
  pl.status as placement_status,
  pl.pos_x,
  pl.pos_y,
  pl.pos_dx,
  pl.pos_dy,
  (pe.tree_id = pl.tree_id) as is_home,
  pl.person_id as id,
  pe.tree_id as home_tree_id,
  pe.first_name,
  pe.middle_name,
  pe.preferred_name,
  pe.maiden_name,
  pe.last_name,
  pe.date_of_birth,
  pe.date_of_death,
  pe.date_of_birth_precision,
  pe.date_of_death_precision,
  pe.city_of_birth,
  pe.country_of_birth,
  pe.place_id_birth,
  pe.place_id_death,
  pe.is_deceased,
  pe.place_of_death,
  pe.sex,
  pe.lineage_type,
  pe.photo_path,
  pe.photo_crop,
  pe.owner_user_id,
  pe.created_by,
  pe.verified_at,
  pe.hidden_from_visitors,
  pe.created_at,
  pe.updated_at,
  (pe.id is null) as blurred,
  -- Shown to other members only when the person says so; otherwise it is
  -- the entry's owner's alone — not even a Root's.
  case
    when pe.id is not null and (pe.email_visible or pe.owner_user_id = (select auth.uid())) then pe.email
  end as email,
  pe.email_visible,
  pe.birth_month,
  pe.birth_day
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

create or replace view public.tree_edges
with (security_invoker = true) as
select
  a.tree_id,
  r.id,
  r.from_person,
  r.to_person,
  r.type,
  r.created_by,
  r.marriage_date,
  r.is_divorced,
  r.divorce_date,
  r.tree_id as drawn_on_tree_id,
  r.created_at,
  r.marriage_month,
  r.marriage_day
from public.relationships r
join public.tree_placements a
  on a.person_id = r.from_person and a.status = 'active'
join public.tree_placements b
  on b.person_id = r.to_person and b.status = 'active' and b.tree_id = a.tree_id;

-- ---------------------------------------------------------------------------
-- The writers
-- ---------------------------------------------------------------------------

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

-- Two more arguments make a new function: the old one goes, and the app
-- before this, which names only the old arguments, still reaches the new one.
drop function public.connect_people(uuid, uuid, text, date, boolean, date, uuid);
create or replace function public.connect_people(
  p_from uuid,
  p_to uuid,
  p_type text,
  p_marriage_date date default null,
  p_is_divorced boolean default false,
  p_divorce_date date default null,
  p_tree uuid default null,
  p_marriage_month smallint default null,
  p_marriage_day smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.connect_people(uuid, uuid, text, date, boolean, date, uuid, smallint, smallint) from anon, public;
grant execute on function public.connect_people(uuid, uuid, text, date, boolean, date, uuid, smallint, smallint)
  to authenticated, service_role;

create or replace function public.fill_person_blanks(p_person uuid, p_fields jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.people%rowtype;
  v_filled text[] := '{}';
  v_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'FILL_BLANKS: nothing to fill in' using errcode = '22023';
  end if;
  if not (private.can_edit_person(p_person) or private.can_fill_person(p_person)) then
    raise exception 'FILL_BLANKS: not yours to fill in' using errcode = '42501';
  end if;

  select * into v_row from public.people where id = p_person for update;
  if not found then
    raise exception 'FILL_BLANKS: that entry no longer exists' using errcode = '42501';
  end if;

  -- Names.
  v_value := private.fill_value(p_fields, 'first_name', 120);
  if v_value is not null and nullif(btrim(v_row.first_name), '') is null then
    v_row.first_name := v_value;
    v_filled := v_filled || 'first_name'::text;
  end if;
  v_value := private.fill_value(p_fields, 'middle_name', 120);
  if v_value is not null and nullif(btrim(v_row.middle_name), '') is null then
    v_row.middle_name := v_value;
    v_filled := v_filled || 'middle_name'::text;
  end if;
  v_value := private.fill_value(p_fields, 'preferred_name', 120);
  if v_value is not null and nullif(btrim(v_row.preferred_name), '') is null then
    v_row.preferred_name := v_value;
    v_filled := v_filled || 'preferred_name'::text;
  end if;
  v_value := private.fill_value(p_fields, 'maiden_name', 120);
  if v_value is not null and nullif(btrim(v_row.maiden_name), '') is null then
    v_row.maiden_name := v_value;
    v_filled := v_filled || 'maiden_name'::text;
  end if;

  -- Sex (`people_sex_check` holds it to the three answers).
  v_value := private.fill_value(p_fields, 'sex', 20);
  if v_value is not null and v_row.sex is null then
    v_row.sex := v_value;
    v_filled := v_filled || 'sex'::text;
  end if;

  -- Birth: a date, or a birthday with no year (Step 63), where there's
  -- neither; and a place where none is recorded at all.
  if v_row.date_of_birth is null and v_row.birth_month is null then
    v_value := private.fill_value(p_fields, 'date_of_birth', 10);
    if v_value is not null then
      v_row.date_of_birth := v_value::date;
      v_row.date_of_birth_precision :=
        coalesce(private.fill_value(p_fields, 'date_of_birth_precision', 5), 'day');
      v_filled := v_filled || 'date_of_birth'::text;
    elsif private.fill_value(p_fields, 'birth_month', 2) is not null then
      v_row.birth_month := private.fill_value(p_fields, 'birth_month', 2)::smallint;
      v_row.birth_day := private.fill_value(p_fields, 'birth_day', 2)::smallint;
      v_filled := v_filled || 'date_of_birth'::text;
    end if;
  end if;
  v_value := private.fill_value(p_fields, 'place_id_birth', 20);
  if v_value is not null
     and v_row.place_id_birth is null
     and nullif(btrim(v_row.city_of_birth), '') is null
     and nullif(btrim(v_row.country_of_birth), '') is null then
    v_row.place_id_birth := v_value::bigint;
    v_row.city_of_birth := private.fill_value(p_fields, 'city_of_birth', 120);
    v_row.country_of_birth :=
      coalesce(private.fill_value(p_fields, 'country_of_birth', 120), '');
    v_filled := v_filled || 'place_of_birth'::text;
  end if;

  -- Death, for someone already marked as having died.
  if v_row.is_deceased then
    v_value := private.fill_value(p_fields, 'date_of_death', 10);
    if v_value is not null and v_row.date_of_death is null then
      v_row.date_of_death := v_value::date;
      v_row.date_of_death_precision :=
        coalesce(private.fill_value(p_fields, 'date_of_death_precision', 5), 'day');
      v_filled := v_filled || 'date_of_death'::text;
    end if;
    v_value := private.fill_value(p_fields, 'place_id_death', 20);
    if v_value is not null
       and v_row.place_id_death is null
       and nullif(btrim(v_row.place_of_death), '') is null then
      v_row.place_id_death := v_value::bigint;
      v_row.place_of_death := private.fill_value(p_fields, 'place_of_death', 160);
      v_filled := v_filled || 'place_of_death'::text;
    end if;
  end if;

  -- A photo where there's none, already uploaded into this entry's folder.
  v_value := private.fill_value(p_fields, 'photo_path', 300);
  if v_value is not null and v_row.photo_path is null then
    if private.uuid_or_null(split_part(v_value, '/', 2)) is distinct from p_person
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'photos' and o.name = v_value
       ) then
      raise exception 'FILL_BLANKS: that photo isn''t in this entry''s folder'
        using errcode = '42501';
    end if;
    v_row.photo_path := v_value;
    v_row.photo_crop := case
      when jsonb_typeof(p_fields -> 'photo_crop') = 'object' then p_fields -> 'photo_crop'
    end;
    v_filled := v_filled || 'photo'::text;
  end if;

  if array_length(v_filled, 1) is null then
    return v_filled;
  end if;

  perform set_config('ancestree.filling_blanks', 'on', true);
  update public.people set
    first_name = v_row.first_name,
    middle_name = v_row.middle_name,
    preferred_name = v_row.preferred_name,
    maiden_name = v_row.maiden_name,
    sex = v_row.sex,
    date_of_birth = v_row.date_of_birth,
    date_of_birth_precision = v_row.date_of_birth_precision,
    birth_month = v_row.birth_month,
    birth_day = v_row.birth_day,
    place_id_birth = v_row.place_id_birth,
    city_of_birth = v_row.city_of_birth,
    country_of_birth = v_row.country_of_birth,
    date_of_death = v_row.date_of_death,
    date_of_death_precision = v_row.date_of_death_precision,
    place_id_death = v_row.place_id_death,
    place_of_death = v_row.place_of_death,
    photo_path = v_row.photo_path,
    photo_crop = v_row.photo_crop
  where id = p_person;
  perform set_config('ancestree.filling_blanks', '', true);

  return v_filled;
end;
$$;

create or replace function private.revision_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'preferred_name', 'middle_name', 'last_name', 'maiden_name',
    'sex', 'date_of_birth', 'date_of_birth_precision', 'birth_month', 'birth_day',
    'city_of_birth', 'country_of_birth', 'place_id_birth',
    'is_deceased', 'date_of_death', 'date_of_death_precision',
    'place_of_death', 'place_id_death', 'photo_path', 'photo_crop'
  ]::text[];
$$;

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
  v_old jsonb;
  v_new jsonb;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_field text;
  v_revision uuid;
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
     or new.date_of_birth_precision is distinct from old.date_of_birth_precision
     or new.birth_month is distinct from old.birth_month
     or new.birth_day is distinct from old.birth_day then
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
  v_body := v_label || ' was updated: ' || array_to_string(v_changes, ', ') || '.';

  -- A Branch of the home tree changing what one of its Roots owns or added,
  -- or anyone filling in what's missing on it (`fill_person_blanks`).
  if v_actor is not null
     and (
       private.is_branch_of(new.tree_id)
       or coalesce(current_setting('ancestree.filling_blanks', true), '') = 'on'
     )
     and v_actor is distinct from new.owner_user_id
     and v_actor is distinct from new.created_by
     and exists (
       select 1 from public.tree_members m
       where m.tree_id = new.tree_id and m.role = 'admin'
         and m.user_id in (new.owner_user_id, new.created_by)
     )
  then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_field in array private.revision_fields() loop
      if v_old -> v_field is distinct from v_new -> v_field then
        v_before := v_before || jsonb_build_object(v_field, v_old -> v_field);
        v_after := v_after || jsonb_build_object(v_field, v_new -> v_field);
      end if;
    end loop;

    if v_before <> '{}'::jsonb then
      insert into public.entry_revisions (person_id, editor_user_id, before, after)
      values (new.id, v_actor, v_before, v_after)
      returning id into v_revision;

      v_body := coalesce(private.member_label(v_actor), 'A Branch')
        || ' updated ' || v_label || ': ' || array_to_string(v_changes, ', ') || '.';
    end if;
  end if;

  perform private.notify_edit(new.owner_user_id, v_actor, new.id, v_body, v_revision);
  if new.created_by is distinct from new.owner_user_id then
    perform private.notify_edit(new.created_by, v_actor, new.id, v_body, v_revision);
  end if;
  return new;
end;
$$;
