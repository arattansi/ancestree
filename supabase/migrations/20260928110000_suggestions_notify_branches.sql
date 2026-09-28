-- Step 68 — Suggested changes reach the Branches who tend the entry
--
-- Step 67 asked an entry's owner and the Roots of its home tree to answer a
-- suggested change. A Branch whose part of a Root's side the entry is on may
-- edit it, and so could answer from its card, but wasn't told. Aalim asked
-- that Branches be notified too. Now every Branch of the entry's home tree
-- who tends it is: the ones `private.can_edit_person` lets edit it through
-- `private.is_on_own_branch`, while it's nobody's own entry. A Branch past
-- their side can't edit the entry or answer it, so isn't told.
--
-- 1. `private.tending_branches(person)` — those Branches. The same reach as
--    `private.own_branch_ids`, measured from each Branch's own entry rather
--    than the caller's.
-- 2. `public.suggest_entry_change` — its notice goes to them too. Only the
--    list of whom it asks changes.

-- 1. The Branches who tend an entry.
create or replace function private.tending_branches(p_person uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select private.home_tree(p_person) as tree
  ),
  sides as (
    select r.root, b.id
    from h
    cross join lateral private.root_person_ids(h.tree) as r(root)
    cross join lateral private.branch_ids(r.root, h.tree) as b(id)
  )
  select m.user_id
  from h
  join public.tree_members m
    on m.tree_id = h.tree and m.role = 'branch_admin'
  join public.profiles pr
    on pr.auth_user_id = m.user_id and pr.self_person_id is not null
  where not private.person_is_claimed(p_person)
    and not exists (
      select 1 from public.profiles o where o.self_person_id = p_person
    )
    and exists (
      select 1
      from private.branch_ids(pr.self_person_id, h.tree) as own(id)
      join sides s on s.id = own.id
      where own.id = p_person
        and s.root in (select root from sides where id = pr.self_person_id)
    );
$$;

revoke all on function private.tending_branches(uuid) from public, anon, authenticated;

-- 2. Suggesting asks them too.
create or replace function public.suggest_entry_change(
  p_person uuid,
  p_tree uuid,
  p_values jsonb,
  p_note text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.people%rowtype;
  v_next public.people%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_detail text;
  v_columns text[];
  v_column text;
  v_changes jsonb := '{}';
  v_before jsonb := '{}';
  v_details text[] := '{}';
  v_words text[] := '{}';
  v_note text := nullif(btrim(p_note), '');
  v_name text;
  v_label text;
  v_id uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'SUGGEST: nothing to suggest' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not exists (
      select 1 from private.suggestion_columns() s where v_key = any (s.columns)
    ) then
      raise exception 'SUGGEST: % can''t be suggested', v_key using errcode = '22023';
    end if;
  end loop;
  if length(v_note) > 500 then
    raise exception 'SUGGEST: the note is longer than 500 characters'
      using errcode = '22001';
  end if;

  -- A member of a tree the entry is shown on, who can't edit it themselves.
  if not (private.is_tree_member(p_tree) and private.is_placed(p_tree, p_person)) then
    raise exception 'SUGGEST: not on your tree' using errcode = '42501';
  end if;
  if private.can_edit_person(p_person) then
    raise exception 'SUGGEST: yours to edit' using errcode = '42501';
  end if;

  select * into v_row from public.people where id = p_person;
  if not found then
    raise exception 'SUGGEST: that entry no longer exists' using errcode = '42501';
  end if;

  -- The entry as it would be. Going through its row type refuses a date, a
  -- number or a yes-or-no that isn't one.
  v_next := jsonb_populate_record(v_row, p_values);
  v_next.first_name := nullif(btrim(v_next.first_name), '');
  v_next.middle_name := nullif(btrim(v_next.middle_name), '');
  v_next.preferred_name := nullif(btrim(v_next.preferred_name), '');
  v_next.maiden_name := nullif(btrim(v_next.maiden_name), '');
  v_next.last_name := btrim(v_next.last_name);
  v_next.city_of_birth := nullif(btrim(v_next.city_of_birth), '');
  v_next.country_of_birth := coalesce(btrim(v_next.country_of_birth), '');
  v_next.place_of_death := nullif(btrim(v_next.place_of_death), '');
  v_next.is_deceased := coalesce(v_next.is_deceased, v_row.is_deceased);
  if greatest(
       length(v_next.first_name), length(v_next.middle_name),
       length(v_next.preferred_name), length(v_next.maiden_name),
       length(v_next.last_name), length(v_next.city_of_birth),
       length(v_next.country_of_birth)
     ) > 120
     or length(v_next.place_of_death) > 160 then
    raise exception 'SUGGEST: longer than a detail may be' using errcode = '22001';
  end if;
  -- Someone living has no death details, and a precision means something
  -- only beside its date: without one, the entry's stays as it is.
  if not v_next.is_deceased then
    v_next.date_of_death := null;
    v_next.place_id_death := null;
    v_next.place_of_death := null;
  end if;
  if v_next.date_of_birth is null then
    v_next.date_of_birth_precision := v_row.date_of_birth_precision;
  end if;
  if v_next.date_of_death is null then
    v_next.date_of_death_precision := v_row.date_of_death_precision;
  end if;

  v_old := to_jsonb(v_row);
  v_new := to_jsonb(v_next);
  for v_detail, v_columns in
    select s.detail, s.columns from private.suggestion_columns() s
  loop
    if exists (
      select 1 from unnest(v_columns) c where v_old -> c is distinct from v_new -> c
    ) then
      v_details := array_append(v_details, v_detail);
      foreach v_column in array v_columns loop
        v_changes := v_changes || jsonb_build_object(v_column, v_new -> v_column);
        v_before := v_before || jsonb_build_object(v_column, v_old -> v_column);
      end loop;
    end if;
  end loop;
  if array_length(v_details, 1) is null then
    raise exception 'SUGGEST: nothing changed' using errcode = '22023';
  end if;

  -- It has to fit the entry: tried against every check on people, then
  -- undone, whatever happened.
  begin
    update public.people set
      first_name = v_next.first_name,
      middle_name = v_next.middle_name,
      preferred_name = v_next.preferred_name,
      maiden_name = v_next.maiden_name,
      last_name = v_next.last_name,
      sex = v_next.sex,
      date_of_birth = v_next.date_of_birth,
      date_of_birth_precision = v_next.date_of_birth_precision,
      birth_month = v_next.birth_month,
      birth_day = v_next.birth_day,
      place_id_birth = v_next.place_id_birth,
      city_of_birth = v_next.city_of_birth,
      country_of_birth = v_next.country_of_birth,
      is_deceased = v_next.is_deceased,
      date_of_death = v_next.date_of_death,
      date_of_death_precision = v_next.date_of_death_precision,
      place_id_death = v_next.place_id_death,
      place_of_death = v_next.place_of_death
    where id = p_person;
    raise exception using errcode = 'SG000';
  exception
    when sqlstate 'SG000' then
      null;
    when check_violation or not_null_violation or foreign_key_violation then
      raise exception 'SUGGEST: that doesn''t fit the entry' using errcode = '23514';
  end;

  -- Their earlier suggestion for this entry, still waiting, gives way.
  delete from public.entry_suggestions
  where person_id = p_person and suggested_by = v_uid and status = 'pending';

  v_name := private.member_label(v_uid);
  insert into public.entry_suggestions
    (person_id, tree_id, suggested_by, suggested_by_name, changes, before, note)
  values (p_person, p_tree, v_uid, v_name, v_changes, v_before, v_note)
  returning id into v_id;

  -- Said the way an edit's notice says it.
  if v_details && array['first_name', 'middle_name', 'preferred_name'] then
    v_words := array_append(v_words, 'name');
  end if;
  if v_details && array['last_name', 'maiden_name'] then
    v_words := array_append(v_words, 'family name');
  end if;
  if 'date_of_birth' = any (v_details) then
    v_words := array_append(v_words, 'date of birth');
  end if;
  if 'place_of_birth' = any (v_details) then
    v_words := array_append(v_words, 'birthplace');
  end if;
  if v_details && array['is_deceased', 'date_of_death', 'place_of_death'] then
    v_words := array_append(v_words, 'death details');
  end if;
  if 'sex' = any (v_details) then
    v_words := array_append(v_words, 'sex');
  end if;

  -- Asked: whoever owns the entry, the Roots of its home tree and the
  -- Branches there who tend it (Step 68), in that tree's inbox.
  v_label := private.person_label(p_person);
  for v_recipient in
    select v_row.owner_user_id
    union
    select m.user_id from public.tree_members m
    where m.tree_id = v_row.tree_id and m.role = 'admin'
    union
    select b.user_id from private.tending_branches(p_person) as b(user_id)
  loop
    if v_recipient is not null and v_recipient <> v_uid then
      insert into public.notifications
        (recipient_user_id, actor_user_id, type, person_id, body, tree_id, suggestion_id)
      values (
        v_recipient, v_uid, 'change_suggested', p_person,
        coalesce(v_name, 'A relative') || ' suggested a change to ' || v_label
          || ': ' || array_to_string(v_words, ', ') || '.',
        v_row.tree_id, v_id
      );
    end if;
  end loop;

  return v_details;
end;
$$;
