-- Step 67 — Suggest a change to an entry you can't edit
--
-- A relative who knows a detail is wrong (a date of birth someone else
-- entered, say) could only comment on the entry or flag it, which reached
-- its owner and whoever made it. Now they can suggest the change itself:
-- the entry's owner and the Roots of its home tree are asked, and anyone
-- who may edit the entry accepts it, which makes the change, or declines
-- it. Whoever suggested it hears either way.
--
-- 1. `entry_suggestions` — one row a suggestion: the entry, the tree it was
--    suggested from (whose inbox hears the answer), who suggested it and
--    what they were called then (a reviewer may not see their profile: a
--    member of another tree the entry is shown on), what it changes and
--    what those details were, an optional note, and whether it's pending,
--    accepted or declined. A member has one pending suggestion an entry;
--    suggesting again replaces it. It's seen by whoever suggested it and
--    whoever may edit the entry. Only the functions below write it, apart
--    from the suggester withdrawing one still pending.
-- 2. `notifications.suggestion_id`, and three notice types:
--    `change_suggested` (to the owner and the Roots), `suggestion_accepted`
--    and `suggestion_declined` (to the suggester). A withdrawn or replaced
--    suggestion takes its notices with it.
-- 3. `public.suggest_entry_change(person, tree, values, note)` — a member of
--    a tree the entry is shown on who can't edit it. Takes the entry's
--    details as the form holds them (names, sex, date and place of birth,
--    whether they've died, date and place of death) and keeps what differs
--    from the entry: a date with its precision, a place with its labels.
--    What it suggests has to fit the entry as it stands (every check on
--    `people`, tried and undone). Returns the details it suggests changing.
-- 4. `public.decide_entry_suggestion(suggestion, accept)` — whoever may edit
--    the entry. Accepting writes the suggested details as their own edit,
--    so the owner and maker are told as of any edit, and a Branch's change
--    to a Root's entry keeps the Root's undo. Returns the details changed.

-- The details a suggestion may change, each with the columns that change
-- together: a date with its precision (and a birthday kept without its
-- year, Step 63), a place with the labels it was picked with.
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
    ('date_of_birth', array['date_of_birth', 'date_of_birth_precision', 'birth_month', 'birth_day']),
    ('place_of_birth', array['place_id_birth', 'city_of_birth', 'country_of_birth']),
    ('is_deceased', array['is_deceased']),
    ('date_of_death', array['date_of_death', 'date_of_death_precision']),
    ('place_of_death', array['place_id_death', 'place_of_death'])
$$;

revoke all on function private.suggestion_columns() from public, anon, authenticated;

-- 1. The suggestions.
create table public.entry_suggestions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  tree_id uuid not null references public.trees (id) on delete cascade,
  suggested_by uuid not null references public.profiles (auth_user_id) on delete cascade,
  suggested_by_name text,
  changes jsonb not null,
  before jsonb not null,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (auth_user_id) on delete set null,
  constraint entry_suggestions_status_check
    check (status in ('pending', 'accepted', 'declined')),
  constraint entry_suggestions_changes_shape check (
    jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb
    and jsonb_typeof(before) = 'object'
  ),
  constraint entry_suggestions_note_length
    check (note is null or length(btrim(note)) between 1 and 500),
  constraint entry_suggestions_decided
    check ((status = 'pending') = (decided_at is null))
);

create unique index entry_suggestions_one_pending
  on public.entry_suggestions (person_id, suggested_by)
  where status = 'pending';
create index entry_suggestions_person_idx on public.entry_suggestions (person_id);
create index entry_suggestions_suggested_by_idx on public.entry_suggestions (suggested_by);
create index entry_suggestions_tree_idx on public.entry_suggestions (tree_id);

alter table public.entry_suggestions enable row level security;

revoke all on table public.entry_suggestions from anon, authenticated, public;
grant select, delete on table public.entry_suggestions to authenticated;
grant all on table public.entry_suggestions to service_role;

create policy entry_suggestions_select on public.entry_suggestions
  for select to authenticated
  using (
    suggested_by = (select auth.uid())
    or (select private.can_edit_person(entry_suggestions.person_id))
  );

-- Withdrawing: the suggester, while it's still waiting.
create policy entry_suggestions_delete on public.entry_suggestions
  for delete to authenticated
  using (suggested_by = (select auth.uid()) and status = 'pending');

-- 2. The notices.
alter table public.notifications
  add column suggestion_id uuid
    references public.entry_suggestions (id) on delete cascade;
create index notifications_suggestion_idx on public.notifications (suggestion_id)
  where suggestion_id is not null;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placement_accepted', 'placement_declined',
    'tree_request_approved', 'placed_on_join', 'joined_by_link',
    'change_suggested', 'suggestion_accepted', 'suggestion_declined'
  )
);

-- 3. Suggesting.
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

  -- Asked: whoever owns the entry, and the Roots of its home tree, in that
  -- tree's inbox.
  v_label := private.person_label(p_person);
  for v_recipient in
    select v_row.owner_user_id
    union
    select m.user_id from public.tree_members m
    where m.tree_id = v_row.tree_id and m.role = 'admin'
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

revoke all on function public.suggest_entry_change(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.suggest_entry_change(uuid, uuid, jsonb, text) to authenticated;

-- 4. Accepting or declining.
create or replace function public.decide_entry_suggestion(
  p_suggestion uuid,
  p_accept boolean
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
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'SUGGESTION: accept or decline it' using errcode = '22023';
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
        place_id_birth = v_row.place_id_birth,
        city_of_birth = v_row.city_of_birth,
        country_of_birth = v_row.country_of_birth,
        is_deceased = v_row.is_deceased,
        date_of_death = v_row.date_of_death,
        date_of_death_precision = v_row.date_of_death_precision,
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
      decided_by = v_uid
  where id = p_suggestion;

  perform private.notify(
    v_suggestion.suggested_by, v_uid,
    case when p_accept then 'suggestion_accepted' else 'suggestion_declined' end,
    v_suggestion.person_id, null,
    coalesce(private.member_label(v_uid), 'A relative')
      || case when p_accept then ' accepted' else ' declined' end
      || ' your suggested change to '
      || private.person_label(v_suggestion.person_id) || '.',
    v_suggestion.tree_id
  );

  return v_applied;
end;
$$;

revoke all on function public.decide_entry_suggestion(uuid, boolean) from public, anon;
grant execute on function public.decide_entry_suggestion(uuid, boolean) to authenticated;
