-- Step 40.5 — Drop the unused ancestral-lands columns.
--
-- Step 40 stopped asking families for their own words about whose land a
-- place is: a card and a form show Native Land Digital's names, looked up
-- live and never stored, or nothing at all. The columns Steps 27 and 27.7
-- added for those words were never written (none held a value when Step 40
-- shipped, and no entry revision mentions them), so they go, along with
-- everything that names them: tree_people, the fields a Root can undo, and
-- the edit notice's "ancestral lands". Each comes back exactly as it was
-- before Step 27.

-- The functions first, so nothing ever names a column that's gone.
-- revert_entry_edit only puts back fields named here, and skips any other.
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

  -- A Branch of the home tree changing what one of its Roots owns or added.
  if v_actor is not null
     and private.is_branch_of(new.tree_id)
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

-- A view can't lose a column in place, and tree_people names two of these,
-- so it's dropped and made again as it was before Step 27. Nothing depends
-- on it; the schema's default privileges give it the same grants as before.
drop view public.tree_people;

alter table public.people
  drop column ancestral_lands_birth,
  drop column ancestral_lands_death;

alter table public.pets
  drop column ancestral_lands_birth;

create view public.tree_people
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
  pe.email_visible
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

grant select on public.tree_people to authenticated, service_role;
