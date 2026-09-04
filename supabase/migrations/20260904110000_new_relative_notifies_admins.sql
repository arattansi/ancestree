-- Tell every admin when a relative joins the tree
--
-- Admins carry the tree: they verify entries, resolve disputes, and answer for
-- what is on it. Until now nothing told them it had grown — a member could add
-- a branch of six people and the only way to find out was to go looking.
--
-- So every insert into `people` notifies every admin, the actor excepted.
-- `private.notify` already drops a notification addressed to the person who
-- caused it, which is what makes "anyone other than that admin" fall out for
-- free: an admin adding a relative hears nothing about their own work, and the
-- *other* admin still hears about it. Two admins therefore keep each other
-- informed without either being told what they just did themselves.
--
-- One notification per person, not per batch: the add-person flow can create a
-- short chain in one go, and collapsing those into "3 relatives were added"
-- would cost the per-entry link that makes the notification worth having.

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
      -- Not yet live on the remote database: the trigger that raises these
      -- (20260901070000) never got applied there. Listed so the constraint
      -- matches the committed schema and applying that migration cannot fail.
      'entry_updated',
      'person_added'
    )
  );

create or replace function private.person_added_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_admin uuid;
  v_body text;
begin
  select coalesce(nullif(btrim(display_name), ''), 'a member')
    into v_actor_name
  from public.profiles
  where auth_user_id = v_actor;

  v_body := coalesce(nullif(private.person_label(new.id), ''), 'A new relative')
    || ' was added to the tree by '
    || coalesce(v_actor_name, 'a member') || '.';

  for v_admin in
    select auth_user_id from public.profiles where role = 'admin'
  loop
    -- notify() is a no-op when the recipient is the actor, so an admin is
    -- never told about the entry they just created themselves.
    perform private.notify(
      v_admin, v_actor, 'person_added', new.id, null, v_body
    );
  end loop;

  return new;
end;
$$;

grant execute on function private.person_added_notify()
  to authenticated, service_role;

create trigger people_added_notify
  after insert on public.people
  for each row execute function private.person_added_notify();
