-- Step 44 — A shorter "Add a relative" form, and relatives who fill in what's
-- missing
--
-- The add-a-relative form asked for too much up front. It now asks for a name
-- and how they connect, with everything else behind "Add more details", and a
-- place of birth is no longer required. What's left blank is often known to
-- someone other than whoever added the entry: a grandchild who knows where
-- their great-grandmother was born. So a Leaf can now fill in what's missing
-- on an entry nobody has claimed, on their own line.
--
-- 1. `people_required_identity` no longer requires a country of birth. A name
--    (first or preferred) and a last name still are. The column stays NOT
--    NULL: an entry with no birthplace holds '' there, which is what the app
--    has always sent for one.
-- 2. `private.can_fill_person` — who may fill in what's missing on an entry:
--    a Leaf or a Branch of its home tree, when it's on their own line
--    (`private.line_ids`, where a Leaf adds relatives) and it's nobody's own
--    (`private.person_is_someones_own`: no member's entry, no approved
--    claim). A Branch already edits everything on their part of a Root's
--    side, so for them this reaches past it: a Branch can always do at least
--    what a Leaf can. A Root edits everything anyway.
-- 3. `public.fill_person_blanks(person, fields)` — sets what's empty and never
--    changes or clears what isn't: first, middle, preferred and maiden names,
--    sex, date and place of birth, a date and place of death for someone
--    already marked as having died, and a photo where there's none. Whether
--    someone has died, their last name, lineage and contact details stay
--    with whoever can edit the entry. Returns what it filled. Anyone who can
--    edit the entry may call it too; the app sends them to the full form.
-- 4. `private.person_edit_notify` — the entry's owner and maker hear of a fill
--    as of any edit. One of an entry a Root owns or added is also recorded as
--    a Branch's edit is (`entry_revisions`), so the Root's notification names
--    who filled it in and carries the one-click undo. `fill_person_blanks`
--    marks its write with `ancestree.filling_blanks`; setting that flag only
--    ever adds a record, so it grants nothing.
-- 5. `storage_photos_insert_fill` — whoever may fill in an entry may upload a
--    photo into its folder while it has none. Nothing lets them replace or
--    delete one: the update and delete policies still need
--    `private.can_edit_person`.

-- 1. A place of birth is no longer required.
alter table public.people drop constraint people_required_identity;
alter table public.people add constraint people_required_identity check (
  (
    (first_name is not null and length(btrim(first_name)) > 0)
    or (preferred_name is not null and length(btrim(preferred_name)) > 0)
  )
  and length(btrim(last_name)) > 0
);

-- 2. Who may fill in what's missing.
create or replace function private.can_fill_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.role_in(h.tree) in ('branch_admin', 'member')
    and not private.person_is_someones_own(p_person_id)
    and exists (
      select 1
      from private.line_ids(private.self_person_id(), h.tree) as l(id)
      where l.id = p_person_id
    ),
    false
  )
  from h;
$$;

create or replace function private.can_fill_person_photo(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_fill_person(p_person_id)
    and exists (
      select 1 from public.people
      where id = p_person_id and photo_path is null
    );
$$;

-- 3. Filling in.

-- A filled-in value from `p_fields`: trimmed, `null` when blank, refused when
-- longer than a form would take.
create or replace function private.fill_value(p_fields jsonb, p_key text, p_max integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := nullif(btrim(p_fields ->> p_key), '');
begin
  if length(v_value) > p_max then
    raise exception 'FILL_BLANKS: % is longer than % characters', p_key, p_max
      using errcode = '22001';
  end if;
  return v_value;
end;
$$;

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

  -- Birth: a date, and a place where none is recorded at all.
  v_value := private.fill_value(p_fields, 'date_of_birth', 10);
  if v_value is not null and v_row.date_of_birth is null then
    v_row.date_of_birth := v_value::date;
    v_row.date_of_birth_precision :=
      coalesce(private.fill_value(p_fields, 'date_of_birth_precision', 5), 'day');
    v_filled := v_filled || 'date_of_birth'::text;
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

revoke all on function public.fill_person_blanks(uuid, jsonb) from public, anon;
grant execute on function public.fill_person_blanks(uuid, jsonb) to authenticated;

-- 4. A fill of a Root's entry is recorded like a Branch's edit, so it can be
--    undone from the Root's notification.
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

-- 5. A photo where there's none.
create policy storage_photos_insert_fill on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (select private.can_fill_person_photo(private.uuid_or_null((storage.foldername(name))[2])))
  );
