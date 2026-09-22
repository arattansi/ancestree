-- Step 25.5 — Drop the single-tree scaffolding
--
-- APPLY ONLY AFTER the Step 25 code is deployed. Until then the live app
-- reads `profiles.role` and drags `people.pos_*`; 20260922090000 kept both
-- mirrored so nothing broke while the code was being written. Once the
-- deployed app reads `tree_members` and `tree_placements` instead, the
-- mirrors and the compatibility wrappers can go.

-- Any card dragged on the deployed canvas since the mirrors were laid down
-- has already been copied to its home placement by trigger; copy once more
-- to be sure, then drop the columns.
update public.tree_placements pl
set pos_x = pe.pos_x, pos_y = pe.pos_y, pos_dx = pe.pos_dx, pos_dy = pe.pos_dy
from public.people pe
where pe.id = pl.person_id and pe.tree_id = pl.tree_id
  and (pl.pos_x is distinct from pe.pos_x or pl.pos_y is distinct from pe.pos_y
       or pl.pos_dx is distinct from pe.pos_dx or pl.pos_dy is distinct from pe.pos_dy);

drop trigger if exists people_mirror_position on public.people;
drop function if exists private.people_mirror_position();

create or replace function private.people_home_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tree_placements (tree_id, person_id, status, placed_by)
  values (new.tree_id, new.id, 'active', new.created_by)
  on conflict (tree_id, person_id) do update
    set status = 'active', responded_at = coalesce(public.tree_placements.responded_at, now());
  return new;
end;
$$;

create or replace function private.tree_placements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home uuid;
  v_privileged boolean :=
    coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on'
    or (select auth.uid()) is null;
begin
  if tg_op = 'DELETE' then
    select tree_id into v_home from public.people where id = old.person_id;
    if v_home = old.tree_id
       and exists (select 1 from public.trees t where t.id = old.tree_id) then
      raise exception 'HOME_PLACEMENT: change the home tree first' using errcode = '42501';
    end if;
    return old;
  end if;

  if not v_privileged then
    if new.tree_id <> old.tree_id or new.person_id <> old.person_id
       or new.status <> old.status or new.placed_by is distinct from old.placed_by
       or new.responded_at is distinct from old.responded_at then
      raise exception 'Only a card''s position can be changed here' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_home_tree(p_person uuid, p_tree uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_home uuid := private.home_tree(p_person);
  v_owner uuid := private.person_owner_member(p_person);
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_home is null then
    raise exception 'That entry no longer exists';
  end if;
  if v_home = p_tree then
    return;
  end if;
  if not (v_owner = v_uid or (v_owner is null and private.is_root_of(v_home))) then
    raise exception 'Only this person, or a Root of their home tree for an unclaimed entry, can move their home'
      using errcode = '42501';
  end if;
  if not private.is_placed(p_tree, p_person) then
    raise exception 'The new home must already show this person' using errcode = '23514';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.people set tree_id = p_tree where id = p_person;
  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

alter table public.people
  drop column if exists pos_x,
  drop column if exists pos_y,
  drop column if exists pos_dx,
  drop column if exists pos_dy;

-- The account type lives on the membership alone.
drop trigger if exists tree_members_mirror_role on public.tree_members;
drop function if exists private.tree_members_mirror_role();
drop trigger if exists profiles_protect_role on public.profiles;
drop function if exists private.profiles_protect_role();
alter table public.profiles drop column if exists role;

-- The RPCs that wrote `profiles.role` on the way in.
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
    insert into public.trees (name, slug, created_by)
    values ('Family', 'family', v_uid)
    returning id into v_tree_id;
  end if;

  insert into public.profiles (auth_user_id, display_name)
  values (v_uid, coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)))
  returning * into v_profile;

  perform private.join_tree(v_tree_id, v_uid, 'admin', null);
  return v_profile;
end;
$$;

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
  v_tree public.trees;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  v_email := private.current_email();
  v_name := coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1));

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if not found then
    insert into public.profiles (auth_user_id, display_name, invited_by_user_id)
    values (v_uid, v_name, v_invite.created_by)
    returning * into v_profile;
  end if;

  if v_invite.founds_tree then
    if exists (select 1 from public.trees t where t.created_by = v_uid) then
      raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
    end if;
    v_tree := private.found_tree_for(v_uid, private.default_tree_name(v_uid));
  else
    perform private.join_tree(v_invite.tree_id, v_uid, v_invite.joins_as, v_invite.created_by);
    select * into v_tree from public.trees where id = v_invite.tree_id;
  end if;

  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;
  end if;

  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  perform set_config('ancestree.privileged_profile_write', '', true);
  return v_profile;
end;
$$;

-- "The oldest tree" is no longer a thing anything should ask for.
drop function if exists public.admin_delete_member(uuid);
drop function if exists private.is_admin();
drop function if exists private.is_branch_admin();
drop function if exists private.is_leaf();
drop function if exists private.is_member();
