-- Step 22.4: a Branch's edit to an entry a Root created publishes at once;
-- the Root is told, and can put it back with one click.
--
-- No approval queue. `person_edit_notify` already tells an entry's owner and
-- creator what changed; when the editor is a Branch and one of them is a
-- Root, it now also keeps the edit as an `entry_revisions` row — the changed
-- fields before and after — and links the Root's notification to it.
-- `revert_entry_edit` puts back only the fields that still hold the Branch's
-- value, so a later edit by anyone else is never undone with it, and tells
-- the Branch it was undone (`edit_reverted`).

-- ---------------------------------------------------------------------------
-- entry_revisions
-- ---------------------------------------------------------------------------

create table public.entry_revisions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  editor_user_id uuid references public.profiles (auth_user_id) on delete set null,
  -- Only the fields the edit changed, as they were and as it left them.
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references public.profiles (auth_user_id) on delete set null
);

create index entry_revisions_person_id_idx on public.entry_revisions (person_id);
create index entry_revisions_editor_user_id_idx on public.entry_revisions (editor_user_id);
create index entry_revisions_reverted_by_idx on public.entry_revisions (reverted_by);

alter table public.entry_revisions enable row level security;

-- Roots read them (to offer the revert); rows are written only by the
-- SECURITY DEFINER trigger and `revert_entry_edit`.
create policy entry_revisions_select on public.entry_revisions
  for select to authenticated
  using ((select private.is_admin()));

grant select on public.entry_revisions to authenticated;

alter table public.notifications
  add column revision_id uuid references public.entry_revisions (id) on delete set null;

create index notifications_revision_id_idx on public.notifications (revision_id);

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'canvas_interest', 'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_verified', 'entry_updated', 'person_added', 'edit_reverted'
  ]::text[]));

-- ---------------------------------------------------------------------------
-- The fields a revision keeps: what the entry form and photo controls write.
-- Card position, lineage (Root-only) and bookkeeping columns stay out.
-- ---------------------------------------------------------------------------

create or replace function private.revision_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'preferred_name', 'middle_name', 'last_name', 'maiden_name',
    'sex', 'date_of_birth', 'date_of_birth_precision',
    'city_of_birth', 'country_of_birth', 'place_id_birth',
    'is_deceased', 'date_of_death', 'date_of_death_precision',
    'place_of_death', 'place_id_death', 'photo_path', 'photo_crop'
  ]::text[];
$$;

-- ---------------------------------------------------------------------------
-- member_label: a member as the family knows them — their own entry's name,
-- else their display name.
-- ---------------------------------------------------------------------------

create or replace function private.member_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(private.person_label(pr.self_person_id), ''),
    nullif(btrim(pr.display_name), '')
  )
  from public.profiles pr
  where pr.auth_user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- notify_edit: an `entry_updated` notice, carrying the revision when the
-- recipient is a Root (only a Root can revert).
-- ---------------------------------------------------------------------------

create or replace function private.notify_edit(
  p_recipient uuid,
  p_actor uuid,
  p_person uuid,
  p_body text,
  p_revision uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  insert into public.notifications
    (recipient_user_id, actor_user_id, type, person_id, body, revision_id)
  values (
    p_recipient, p_actor, 'entry_updated', p_person, p_body,
    case
      when p_revision is not null and exists (
        select 1 from public.profiles
        where auth_user_id = p_recipient and role = 'admin'
      ) then p_revision
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- person_edit_notify: keep a Branch's edit to a Root's entry as a revision
-- ---------------------------------------------------------------------------

create or replace function private.person_edit_notify()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_body := v_label || ' was updated: '
    || array_to_string(v_changes, ', ') || '.';

  -- A Branch changing an entry a Root created or owns, and isn't theirs:
  -- keep what it was, so that Root can put it back.
  if v_actor is not null
     and private.is_branch_admin()
     and v_actor is distinct from new.owner_user_id
     and v_actor is distinct from new.created_by
     and exists (
       select 1 from public.profiles pr
       where pr.role = 'admin'
         and pr.auth_user_id in (new.owner_user_id, new.created_by)
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
        || ' updated ' || v_label || ': '
        || array_to_string(v_changes, ', ') || '.';
    end if;
  end if;

  -- Owner, then the creator when that's somebody else. The revert goes only
  -- to a Root.
  perform private.notify_edit(new.owner_user_id, v_actor, new.id, v_body, v_revision);
  if new.created_by is distinct from new.owner_user_id then
    perform private.notify_edit(new.created_by, v_actor, new.id, v_body, v_revision);
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- revert_entry_edit: a Root puts a Branch's edit back
-- ---------------------------------------------------------------------------

-- Restores each field the edit changed that still holds the value the Branch
-- left, and leaves alone any field someone has changed since. Returns the
-- fields it put back; raises NOTHING_TO_REVERT when every one has moved on,
-- ALREADY_REVERTED on a second click.
create or replace function public.revert_entry_edit(p_revision_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.entry_revisions%rowtype;
  v_current jsonb;
  v_patch jsonb := '{}';
  v_fields text[] := '{}';
  v_field text;
  v_cols text;
  v_label text;
begin
  if not private.is_admin() then
    raise exception 'Only a Root can undo an edit.' using errcode = '42501';
  end if;

  select * into v_rev
  from public.entry_revisions
  where id = p_revision_id
  for update;
  if not found then
    raise exception 'REVISION_NOT_FOUND';
  end if;
  if v_rev.reverted_at is not null then
    raise exception 'ALREADY_REVERTED';
  end if;

  select to_jsonb(pe) into v_current
  from public.people pe
  where pe.id = v_rev.person_id;

  for v_field in select jsonb_object_keys(v_rev.before) loop
    continue when not v_field = any (private.revision_fields());
    if v_current -> v_field is not distinct from v_rev.after -> v_field then
      v_patch := v_patch || jsonb_build_object(v_field, v_rev.before -> v_field);
      v_fields := v_fields || v_field;
    end if;
  end loop;

  if array_length(v_fields, 1) is null then
    raise exception 'NOTHING_TO_REVERT';
  end if;

  select string_agg(format('%I', f), ', ') into v_cols from unnest(v_fields) f;
  execute format(
    'update public.people set (%1$s) = (select %1$s from jsonb_populate_record(null::public.people, $1)) where id = $2',
    v_cols
  ) using v_patch, v_rev.person_id;

  update public.entry_revisions
  set reverted_at = now(), reverted_by = (select auth.uid())
  where id = p_revision_id;

  v_label := private.person_label(v_rev.person_id);
  perform private.notify(
    v_rev.editor_user_id,
    (select auth.uid()),
    'edit_reverted',
    v_rev.person_id,
    null,
    coalesce(private.member_label((select auth.uid())), 'A Root')
      || ' undid your change to ' || coalesce(v_label, 'an entry') || '.'
  );

  return v_fields;
end;
$$;

revoke all on function public.revert_entry_edit(uuid) from public, anon;
grant execute on function public.revert_entry_edit(uuid) to authenticated;
