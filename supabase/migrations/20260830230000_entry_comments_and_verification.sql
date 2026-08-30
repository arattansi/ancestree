-- Step 8 — Entry comments, flags & verification
--
-- 1. Any tree member can comment on an entry or raise a flag (is_flag = true)
--    with a message. Comments/flags are inserted directly under RLS (optimistic
--    UI), and an AFTER trigger notifies the entry's owner + original creator.
-- 2. Flags carry an open -> resolved lifecycle. `resolve_entry_flag()` lets the
--    entry owner, an admin, or the flag's author resolve (or reopen) it, stamps
--    `resolved_by` / `resolved_at`, and notifies the flag's author.
-- 3. `set_entry_verified()` (admins only) marks an entry verified, stamping
--    `verified_by` / `verified_at`, and notifies the owner + creator.

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------

alter table public.people
  add column verified_at timestamptz,
  add column verified_by uuid
    references public.profiles (auth_user_id) on delete set null;

alter table public.entry_comments
  add column resolved_at timestamptz,
  add column resolved_by uuid
    references public.profiles (auth_user_id) on delete set null;

create index entry_comments_open_flag_idx
  on public.entry_comments (person_id)
  where is_flag and status = 'open';
create index entry_comments_person_created_idx
  on public.entry_comments (person_id, created_at desc);

-- Extend the notification vocabulary.
alter table public.notifications
  drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'claim_approved',
      'claim_disputed',
      'claim_upheld',
      'claim_reversed',
      'entry_commented',
      'entry_flagged',
      'flag_resolved',
      'entry_verified'
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: broaden entry_comments UPDATE so the entry owner / admin can resolve a
-- flag (previously: admin or the comment's own author only).
-- ---------------------------------------------------------------------------

drop policy entry_comments_update on public.entry_comments;
create policy entry_comments_update on public.entry_comments
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.can_edit_person(person_id))
  )
  with check (
    created_by = (select auth.uid())
    or (select private.can_edit_person(person_id))
  );

-- ---------------------------------------------------------------------------
-- Notification triggers
-- ---------------------------------------------------------------------------

create or replace function private.entry_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_creator uuid;
  v_actor uuid := (select auth.uid());
  v_label text;
  v_type text;
  v_snippet text;
begin
  select owner_user_id, created_by into v_owner, v_creator
  from public.people where id = new.person_id;
  v_label := private.person_label(new.person_id);
  v_snippet := left(btrim(new.body), 140);

  if tg_op = 'INSERT' then
    v_type := case when new.is_flag then 'entry_flagged' else 'entry_commented' end;
    perform private.notify(
      v_owner, v_actor, v_type, new.person_id, null,
      v_label
        || case when new.is_flag then ' was flagged: ' else ' has a new comment: ' end
        || v_snippet
    );
    if v_creator is distinct from v_owner then
      perform private.notify(
        v_creator, v_actor, v_type, new.person_id, null,
        v_label
          || case when new.is_flag then ' was flagged: ' else ' has a new comment: ' end
          || v_snippet
      );
    end if;
    return new;
  end if;

  -- UPDATE: a flag was resolved -> tell whoever raised it.
  if old.status = 'open' and new.status = 'resolved' then
    perform private.notify(
      new.created_by, v_actor, 'flag_resolved', new.person_id, null,
      'Your flag on ' || v_label || ' was resolved.'
    );
  end if;
  return new;
end;
$$;

grant execute on function private.entry_comment_notify() to authenticated, service_role;

create trigger entry_comments_notify
  after insert or update on public.entry_comments
  for each row execute function private.entry_comment_notify();

-- ---------------------------------------------------------------------------
-- public.resolve_entry_flag — owner / admin / author resolves or reopens a flag
-- ---------------------------------------------------------------------------

create or replace function public.resolve_entry_flag(
  p_comment_id uuid,
  p_resolved boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_author uuid;
  v_is_flag boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select person_id, created_by, is_flag
    into v_person, v_author, v_is_flag
  from public.entry_comments
  where id = p_comment_id;

  if v_person is null then
    raise exception 'That comment no longer exists';
  end if;
  if not v_is_flag then
    raise exception 'Only flags can be resolved';
  end if;
  if v_uid <> v_author
     and not private.is_admin()
     and not private.can_edit_person(v_person) then
    raise exception 'Only the entry owner, an admin, or the person who raised the flag can resolve it'
      using errcode = '42501';
  end if;

  update public.entry_comments
  set status = case when p_resolved then 'resolved' else 'open' end,
      resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then v_uid else null end
  where id = p_comment_id;
end;
$$;

revoke all on function public.resolve_entry_flag(uuid, boolean) from anon, public;
grant execute on function public.resolve_entry_flag(uuid, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.set_entry_verified — admins mark an entry verified (or clear it)
-- ---------------------------------------------------------------------------

create or replace function public.set_entry_verified(
  p_person_id uuid,
  p_verified boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_creator uuid;
  v_label text;
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select owner_user_id, created_by into v_owner, v_creator
  from public.people where id = p_person_id;
  if v_owner is null then
    raise exception 'That entry no longer exists';
  end if;

  update public.people
  set verified_at = case when p_verified then now() else null end,
      verified_by = case when p_verified then v_uid else null end
  where id = p_person_id;

  if not p_verified then
    return;
  end if;

  v_label := private.person_label(p_person_id);
  perform private.notify(
    v_owner, v_uid, 'entry_verified', p_person_id, null,
    v_label || ' was marked verified by an admin.'
  );
  if v_creator is distinct from v_owner then
    perform private.notify(
      v_creator, v_uid, 'entry_verified', p_person_id, null,
      v_label || ' was marked verified by an admin.'
    );
  end if;
end;
$$;

revoke all on function public.set_entry_verified(uuid, boolean) from anon, public;
grant execute on function public.set_entry_verified(uuid, boolean)
  to authenticated, service_role;
