-- Step 34, once the new code is live — retire the `leaf` key for good
--
-- `20260923090000_three_account_types` moved every Leaf to `member` and kept
-- a shim for the app that was live then, which still offered the old Leaf: a
-- `leaf` it wrote was stored as `member`. That app has been replaced, so the
-- shim goes and the check constraints stop accepting `leaf` at all. Apply
-- this only after the Step 34 code is serving production.

update public.tree_members set role = 'member' where role = 'leaf';
update public.invites set joins_as = 'member' where joins_as = 'leaf';

alter table public.tree_members drop constraint tree_members_role_check;
alter table public.tree_members add constraint tree_members_role_check
  check (role in ('admin', 'branch_admin', 'member'));

alter table public.invites drop constraint invites_joins_as_check;
alter table public.invites add constraint invites_joins_as_check
  check (joins_as = 'member');

-- Everyone who can invite, invites as a Leaf.
create or replace function private.can_invite_as(p_tree_id uuid, p_joins_as text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_joins_as = 'member'
    and private.role_in(p_tree_id) in ('admin', 'branch_admin', 'member'),
    false
  );
$$;

create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_root_of(new.tree_id) then
    if new.founds_tree and new.person_id is not null then
      raise exception 'A founder invite is not for an entry' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.founds_tree then
    raise exception 'Only a Root can invite someone to found a tree' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.joins_as is distinct from old.joins_as
       or (new.person_id is not null and new.person_id is distinct from old.person_id) then
      raise exception 'Only a Root can change what an invite joins as, or whose entry it is for'
        using errcode = '42501';
    end if;
    if new.invited_email is not null and new.invited_email is distinct from old.invited_email then
      raise exception 'Only a Root can change who an invite signs in' using errcode = '42501';
    end if;
  else
    if new.person_id is not null and not private.can_invite_to_claim(new.person_id) then
      raise exception 'You can invite someone to claim only an unclaimed entry you can edit'
        using errcode = '42501';
    end if;
    if new.invited_email is not null then
      raise exception 'Only a Root can bind an invite to an email address' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.tree_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- RPCs (founding, redeeming, handing over) and the service role.
  if coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on'
     or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Members join a tree through an invite' using errcode = '42501';
  end if;

  -- The tree itself is going: its memberships go with it.
  if tg_op = 'DELETE' and not exists (select 1 from public.trees t where t.id = old.tree_id) then
    return old;
  end if;

  -- Whoever invited them is going: deleting their profile clears the link (on
  -- delete set null) as whoever deleted it, for remove_tree_member a Root who
  -- may not be on this tree.
  if tg_op = 'UPDATE'
     and old.invited_by_user_id is not null and new.invited_by_user_id is null
     and new.tree_id = old.tree_id and new.user_id = old.user_id and new.role = old.role
     and not exists (select 1 from public.profiles p where p.auth_user_id = old.invited_by_user_id) then
    return new;
  end if;

  if not private.is_root_of(old.tree_id) then
    -- Leaving a tree you are not a Root of is the one thing a member may do.
    if tg_op = 'DELETE' and old.user_id = (select auth.uid()) and old.role <> 'admin' then
      return old;
    end if;
    raise exception 'Only a Root of this tree can change its members' using errcode = '42501';
  end if;

  if old.role = 'admin' then
    if tg_op = 'DELETE' or new.role is distinct from 'admin' then
      raise exception 'ROOT_IS_PERMANENT: a Root stays a Root' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.tree_id <> old.tree_id or new.user_id <> old.user_id) then
    raise exception 'A membership cannot be moved' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- Change a member's account type in one tree: Root, Branch or Leaf.
create or replace function public.set_member_role(p_tree uuid, p_user uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can change account types' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'branch_admin', 'member') then
    raise exception 'Unknown account type: %', p_role;
  end if;
  -- The guard raises ROOT_IS_PERMANENT for a Root being demoted.
  update public.tree_members set role = p_role
  where tree_id = p_tree and user_id = p_user
  returning role into v_role;
  if v_role is null then
    raise exception 'That member is not on this tree';
  end if;
  return v_role;
end;
$$;
