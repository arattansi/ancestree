-- Step 22.1 — drop the per-member invite grant
--
-- `profiles.can_invite` was how a Root let one member invite. Since
-- `20260921130000_claim_invites_by_reach`, who may invite follows from the
-- account type alone (`private.can_invite_as`) and nothing reads the column.
-- Only the two Roots ever held the grant, so dropping it takes nothing away.
--
-- What still named it: the trigger that pins it for non-Roots, the two
-- functions that create a profile, the members view, and the original
-- `can_invite_to_tree`, which `can_invite_as` replaced in Step 18.2.

drop view public.member_directory;

drop function private.can_invite_to_tree(uuid);

-- ---------------------------------------------------------------------------
-- profiles_protect_role: the role is all that is left to pin
-- ---------------------------------------------------------------------------

create or replace function private.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not private.is_admin() then
      new.role := 'member';
    end if;
  elsif tg_op = 'UPDATE' then
    if not private.is_admin() then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_profile / redeem_invite: create the profile without it
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

  insert into public.profiles (auth_user_id, display_name, role)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    'admin'
  )
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.redeem_invite(
  p_token text,
  p_display_name text default null
)
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

  insert into public.profiles (auth_user_id, display_name, role, invited_by_user_id)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    v_invite.joins_as,
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

-- ---------------------------------------------------------------------------
-- The column, and the members view without it
-- ---------------------------------------------------------------------------

alter table public.profiles drop column can_invite;

create view public.member_directory
with (security_invoker = true) as
  select
    p.auth_user_id,
    p.display_name,
    p.role,
    p.created_at,
    p.invited_by_user_id,
    inviter.display_name as invited_by_name
  from public.profiles p
  left join public.profiles inviter on inviter.auth_user_id = p.invited_by_user_id;

grant select on public.member_directory to authenticated;
