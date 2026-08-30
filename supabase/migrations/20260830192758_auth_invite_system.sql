-- Step 3 — Auth & invite system
-- Admin bootstrap allowlist, invite preview / redemption RPCs, and a
-- member directory view that surfaces "invited by <name>".

-- ---------------------------------------------------------------------------
-- Admin bootstrap allowlist
-- ---------------------------------------------------------------------------
-- Emails allowed to self-provision as admin on first magic-link login. The
-- first login by an allowlisted user also creates the single shared v1 tree.
create table private.admin_allowlist (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

insert into private.admin_allowlist (email, note) values
  ('rattansi.aalim@gmail.com', 'Ancestree co-admin (build owner)')
on conflict (email) do nothing;
-- Add the second co-admin before launch, e.g.:
--   insert into private.admin_allowlist (email, note) values ('co-admin@example.com', 'Ancestree co-admin');

-- ---------------------------------------------------------------------------
-- Let SECURITY DEFINER helpers below set role / can_invite during bootstrap
-- ---------------------------------------------------------------------------
create or replace function private.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Privileged escape hatch, only set (LOCAL) inside the definer helpers below.
  if coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not private.is_admin() then
      new.role := 'member';
      new.can_invite := false;
    end if;
  elsif tg_op = 'UPDATE' then
    if not private.is_admin() then
      new.role := old.role;
      new.can_invite := old.can_invite;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.current_tree_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.trees order by created_at asc limit 1;
$$;

create or replace function private.current_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select email from auth.users where id = (select auth.uid());
$$;

grant execute on function private.current_tree_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ensure_profile — idempotent; bootstraps allowlisted admins
-- ---------------------------------------------------------------------------
create or replace function public.ensure_profile(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_profile public.profiles;
  v_tree_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if found then
    return v_profile;
  end if;

  v_email := private.current_email();

  if not exists (
    select 1 from private.admin_allowlist a where lower(a.email) = lower(v_email)
  ) then
    raise exception 'needs_invite' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  v_tree_id := private.current_tree_id();
  if v_tree_id is null then
    insert into public.trees (name, created_by)
    values ('Family Tree', v_uid)
    returning id into v_tree_id;
  end if;

  insert into public.profiles (auth_user_id, display_name, role, can_invite)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    'admin',
    true
  )
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function public.ensure_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- invite_preview — pre-membership lookup by token (safe, minimal fields)
-- ---------------------------------------------------------------------------
create or replace function public.invite_preview(p_token text)
returns table (valid boolean, inviter_name text, tree_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    true as valid,
    coalesce(p.display_name, 'A family member') as inviter_name,
    t.name as tree_name
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  where i.token = p_token
    and i.status = 'active'
    and (i.expires_at is null or i.expires_at > now());
$$;

grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- redeem_invite — create the caller's member profile + consume the token
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(p_token text, p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_invite public.invites;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if found then
    return v_profile;
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  v_email := private.current_email();

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  insert into public.profiles (auth_user_id, display_name, role, can_invite, invited_by_user_id)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    'member',
    false,
    v_invite.created_by
  )
  returning * into v_profile;

  update public.invites
  set status = 'accepted',
      accepted_by_user_id = v_uid,
      updated_at = now()
  where id = v_invite.id;

  return v_profile;
end;
$$;

grant execute on function public.redeem_invite(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- member_directory — profiles + "invited by <name>" (RLS via security_invoker)
-- ---------------------------------------------------------------------------
create view public.member_directory
with (security_invoker = true) as
  select
    p.auth_user_id,
    p.display_name,
    p.role,
    p.can_invite,
    p.created_at,
    p.invited_by_user_id,
    inviter.display_name as invited_by_name
  from public.profiles p
  left join public.profiles inviter on inviter.auth_user_id = p.invited_by_user_id;

grant select on public.member_directory to authenticated;
