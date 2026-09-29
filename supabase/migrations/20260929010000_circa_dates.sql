-- Step 81 — Circa: a rough date of birth or death.
--
-- Aalim asked, "when inputting DOB and DOD, allow for the user to select
-- circa for rough estimates". A date of birth or death is a `date` plus how
-- much of it is known (Step 17); circa says the date itself is a guess, as
-- genealogy's "c. 1950" does, whatever its precision:
--
--     people.date_of_birth_circa   the date of birth is a rough estimate
--     people.date_of_death_circa   the date of death is a rough estimate
--
-- Circa needs its date: the check says so, and `people_before_write` clears
-- it whenever its date is empty, so a writer that empties a date without
-- knowing about circa (someone marked as living, an undo) still fits.
-- Whatever shows or saves a whole date learns it: tree_people carries both
-- (as trailing columns, so the view is replaced in place), and so do the
-- writers that list a person's columns — fill_person_blanks (a date fills in
-- with its circa), suggestion_columns and decide_entry_suggestion (a
-- suggestion can make a date circa), revision_fields (a Root can undo it)
-- and person_edit_notify (changing it is changing the date).
-- `suggest_entry_change` needs no change: it takes any column
-- suggestion_columns lists and tries the row against people's checks.
-- `add_people_with_connections` doesn't either: the app sets circa on the
-- new rows afterwards, as it does their places.
--
-- Each function is its latest migration's body, which matched live by md5,
-- with only the lines named here changed. Additive: the app before it sends
-- no circa and keeps working, so this goes live before the code.
--
-- Down: re-run the functions from their migrations (20260922090000,
-- 20260928001000, 20260928100000, 20260928140000), drop tree_people and
-- create it again from 20260928002000 (a view can't lose columns in place),
-- then drop the two columns.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.people
  add column date_of_birth_circa boolean not null default false,
  add column date_of_death_circa boolean not null default false,
  add constraint people_circa_needs_its_date check (
    (not date_of_birth_circa or date_of_birth is not null)
    and (not date_of_death_circa or date_of_death is not null)
  );

comment on column public.people.date_of_birth_circa is
  'The date of birth is a rough estimate, shown "c. 1950" (Step 81). Only beside a date_of_birth.';
comment on column public.people.date_of_death_circa is
  'The date of death is a rough estimate, shown "c. 1990" (Step 81). Only beside a date_of_death.';

create or replace function private.people_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- The view: the new columns at the end
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
  pe.birth_day,
  pe.date_of_birth_circa,
  pe.date_of_death_circa
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

-- ---------------------------------------------------------------------------
-- The writers
-- ---------------------------------------------------------------------------

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
      v_row.date_of_birth_circa :=
        coalesce(private.fill_value(p_fields, 'date_of_birth_circa', 5), 'false')::boolean;
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
      v_row.date_of_death_circa :=
        coalesce(private.fill_value(p_fields, 'date_of_death_circa', 5), 'false')::boolean;
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
    date_of_birth_circa = v_row.date_of_birth_circa,
    place_id_birth = v_row.place_id_birth,
    city_of_birth = v_row.city_of_birth,
    country_of_birth = v_row.country_of_birth,
    date_of_death = v_row.date_of_death,
    date_of_death_precision = v_row.date_of_death_precision,
    date_of_death_circa = v_row.date_of_death_circa,
    place_id_death = v_row.place_id_death,
    place_of_death = v_row.place_of_death,
    photo_path = v_row.photo_path,
    photo_crop = v_row.photo_crop
  where id = p_person;
  perform set_config('ancestree.filling_blanks', '', true);

  return v_filled;
end;
$$;

create or replace function private.suggestion_columns()
returns table (detail text, columns text[])
language sql
immutable
set search_path = ''
as $$
  values
    ('first_name'::text, array['first_name']::text[]),
    ('middle_name', array['middle_name']),
    ('preferred_name', array['preferred_name']),
    ('maiden_name', array['maiden_name']),
    ('last_name', array['last_name']),
    ('sex', array['sex']),
    ('date_of_birth', array['date_of_birth', 'date_of_birth_precision', 'birth_month', 'birth_day', 'date_of_birth_circa']),
    ('place_of_birth', array['place_id_birth', 'city_of_birth', 'country_of_birth']),
    ('is_deceased', array['is_deceased']),
    ('date_of_death', array['date_of_death', 'date_of_death_precision', 'date_of_death_circa']),
    ('place_of_death', array['place_id_death', 'place_of_death'])
$$;

create or replace function public.decide_entry_suggestion(
  p_suggestion uuid,
  p_accept boolean,
  p_reason text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_suggestion public.entry_suggestions%rowtype;
  v_row public.people%rowtype;
  v_old jsonb;
  v_detail text;
  v_columns text[];
  v_applied text[] := '{}';
  -- Why it was declined (Step 69); accepting keeps none.
  v_reason text := case when not p_accept then nullif(btrim(p_reason), '') end;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'SUGGESTION: accept or decline it' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'SUGGESTION: the reason is longer than 500 characters'
      using errcode = '22001';
  end if;

  select * into v_suggestion
  from public.entry_suggestions where id = p_suggestion
  for update;
  if not found then
    raise exception 'SUGGESTION: withdrawn' using errcode = 'P0002';
  end if;
  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION: already answered' using errcode = '55000';
  end if;
  if not private.can_edit_person(v_suggestion.person_id) then
    raise exception 'SUGGESTION: not yours to answer' using errcode = '42501';
  end if;

  if p_accept then
    select * into v_row from public.people where id = v_suggestion.person_id for update;
    v_old := to_jsonb(v_row);
    v_row := jsonb_populate_record(v_row, v_suggestion.changes);
    -- As their own edit: `person_edit_notify` tells the owner and maker,
    -- and records a Branch's change to a Root's entry for the Root's undo.
    begin
      update public.people set
        first_name = v_row.first_name,
        middle_name = v_row.middle_name,
        preferred_name = v_row.preferred_name,
        maiden_name = v_row.maiden_name,
        last_name = v_row.last_name,
        sex = v_row.sex,
        date_of_birth = v_row.date_of_birth,
        date_of_birth_precision = v_row.date_of_birth_precision,
        birth_month = v_row.birth_month,
        birth_day = v_row.birth_day,
        date_of_birth_circa = v_row.date_of_birth_circa,
        place_id_birth = v_row.place_id_birth,
        city_of_birth = v_row.city_of_birth,
        country_of_birth = v_row.country_of_birth,
        is_deceased = v_row.is_deceased,
        date_of_death = v_row.date_of_death,
        date_of_death_precision = v_row.date_of_death_precision,
        date_of_death_circa = v_row.date_of_death_circa,
        place_id_death = v_row.place_id_death,
        place_of_death = v_row.place_of_death
      where id = v_suggestion.person_id;
    exception
      when check_violation or not_null_violation or foreign_key_violation then
        raise exception 'SUGGESTION: no longer fits the entry' using errcode = '23514';
    end;

    for v_detail, v_columns in
      select s.detail, s.columns from private.suggestion_columns() s
    loop
      if exists (
        select 1 from unnest(v_columns) c
        where v_suggestion.changes ? c
          and v_old -> c is distinct from v_suggestion.changes -> c
      ) then
        v_applied := array_append(v_applied, v_detail);
      end if;
    end loop;
  end if;

  update public.entry_suggestions
  set status = case when p_accept then 'accepted' else 'declined' end,
      decided_at = now(),
      decided_by = v_uid,
      decline_reason = v_reason
  where id = p_suggestion;

  -- The suggester hears, in the inbox of the tree they suggested from, with
  -- the suggestion itself, so a declined one can be opened again to edit and
  -- resend (Step 71).
  if v_suggestion.suggested_by <> v_uid then
    insert into public.notifications
      (recipient_user_id, actor_user_id, type, person_id, body, tree_id, suggestion_id)
    values (
      v_suggestion.suggested_by, v_uid,
      case when p_accept then 'suggestion_accepted' else 'suggestion_declined' end,
      v_suggestion.person_id,
      coalesce(private.member_label(v_uid), 'A relative')
        || case when p_accept then ' accepted' else ' declined' end
        || ' your suggested change to '
        || private.person_label(v_suggestion.person_id)
        || coalesce(': “' || v_reason || '”', '.'),
      v_suggestion.tree_id,
      p_suggestion
    );
  end if;

  return v_applied;
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
    'date_of_birth_circa', 'city_of_birth', 'country_of_birth', 'place_id_birth',
    'is_deceased', 'date_of_death', 'date_of_death_precision', 'date_of_death_circa',
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
     or new.birth_day is distinct from old.birth_day
     or new.date_of_birth_circa is distinct from old.date_of_birth_circa then
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
     or new.date_of_death_circa is distinct from old.date_of_death_circa
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
