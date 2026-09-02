-- Notify an entry's owner and original creator when someone else edits its
-- content. Canvas position (drags, auto-arrange) and system stamps
-- (verified_at, updated_at) are deliberately ignored — only the fields a person
-- fills in on the entry form count as an edit worth hearing about.
--
-- private.notify() already drops notifications addressed to the actor or to a
-- null recipient, so a member editing their own entry, or an unclaimed entry,
-- generates nothing.

alter table public.notifications
  drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'claim_approved',
      'claim_disputed',
      'claim_upheld',
      'claim_reversed',
      'canvas_interest',
      'entry_commented',
      'entry_flagged',
      'flag_resolved',
      'entry_verified',
      'entry_updated'
    )
  );

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
    v_changes := v_changes || 'name';
  end if;
  if new.last_name is distinct from old.last_name
     or new.maiden_name is distinct from old.maiden_name then
    v_changes := v_changes || 'family name';
  end if;
  if new.date_of_birth is distinct from old.date_of_birth then
    v_changes := v_changes || 'date of birth';
  end if;
  if new.city_of_birth is distinct from old.city_of_birth
     or new.country_of_birth is distinct from old.country_of_birth
     or new.place_id_birth is distinct from old.place_id_birth then
    v_changes := v_changes || 'birthplace';
  end if;
  if new.is_deceased is distinct from old.is_deceased
     or new.date_of_death is distinct from old.date_of_death
     or new.place_of_death is distinct from old.place_of_death
     or new.place_id_death is distinct from old.place_id_death then
    v_changes := v_changes || 'death details';
  end if;
  if new.sex is distinct from old.sex then
    v_changes := v_changes || 'sex';
  end if;
  if new.lineage_type is distinct from old.lineage_type then
    v_changes := v_changes || 'lineage';
  end if;
  if new.photo_path is distinct from old.photo_path
     or new.photo_crop is distinct from old.photo_crop then
    v_changes := v_changes || 'photo';
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

create trigger people_edit_notify
  after update on public.people
  for each row execute function private.person_edit_notify();
