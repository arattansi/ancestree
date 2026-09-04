-- Actually switch on the entry-update notifications
--
-- 20260901070000 added `private.person_edit_notify()` and the trigger that
-- calls it, but that migration never reached the remote database: neither the
-- function, the trigger, nor its `entry_updated` type were there. The feature
-- has been committed and dormant ever since — every entry edit went unannounced
-- while the repo said otherwise.
--
-- This re-runs just the function and the trigger, idempotently, so the database
-- catches up. It deliberately does *not* re-run that migration's constraint
-- rewrite: 20260904110000 has since replaced it with a superset, and replaying
-- the older, shorter list would drop 'person_added' and break the new-relative
-- notifications with it.
--
-- On a database built from scratch 20260901070000 already created both, which
-- is why everything here is written to run cleanly a second time.
--
-- It also carries a fix the original needed. `v_changes := v_changes || 'name'`
-- looks like appending a string to a text[], but with an untyped literal
-- Postgres picks array_cat and tries to read 'name' as an array literal, so the
-- trigger raised `malformed array literal` on the first edit it saw — which
-- would have failed the UPDATE behind it and made entries uneditable. The
-- literals are cast to ::text so the append resolves to the element form. This
-- is almost certainly why the feature was left switched off.

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
  if new.date_of_birth is distinct from old.date_of_birth then
    v_changes := v_changes || 'date of birth'::text;
  end if;
  if new.city_of_birth is distinct from old.city_of_birth
     or new.country_of_birth is distinct from old.country_of_birth
     or new.place_id_birth is distinct from old.place_id_birth then
    v_changes := v_changes || 'birthplace'::text;
  end if;
  if new.is_deceased is distinct from old.is_deceased
     or new.date_of_death is distinct from old.date_of_death
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

  perform private.notify(
    new.owner_user_id, v_actor, 'entry_updated', new.id, null, v_body
  );
  if new.created_by is distinct from new.owner_user_id then
    perform private.notify(
      new.created_by, v_actor, 'entry_updated', new.id, null, v_body
    );
  end if;
  return new;
end;
$$;

grant execute on function private.person_edit_notify()
  to authenticated, service_role;

drop trigger if exists people_edit_notify on public.people;
create trigger people_edit_notify
  after update on public.people
  for each row execute function private.person_edit_notify();
