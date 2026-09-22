-- Default tree names. A tree someone hasn't named yet is "My Family Tree"
-- (their first) or "My Second Tree", "My Third Tree", … after that, whether
-- it's founded from the app (lib/tree-names.ts) or planted by a founder
-- invite (here). The first-admin bootstrap uses the same first name. The
-- two sign-up functions are re-created from 20260922090000 with only the
-- name changed; their live bodies were checked against that file first.

-- What a tree is called before anyone names it: "My Family Tree" for
-- someone's first, then "My Second Tree", "My Third Tree", … counted from
-- the trees they already belong to. Mirrors `defaultTreeName` in
-- lib/tree-names.ts, which names a tree founded from the app; this names
-- the one a founder invite plants.
create or replace function private.default_tree_name(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_existing integer;
  v_n integer;
  v_words text[] := array['Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'];
  v_suffix text;
begin
  select count(*) into v_existing from public.tree_members where user_id = p_user;
  if v_existing = 0 then
    return 'My Family Tree';
  end if;
  if v_existing <= array_length(v_words, 1) then
    return 'My ' || v_words[v_existing] || ' Tree';
  end if;
  v_n := v_existing + 1;
  v_suffix := case
    when v_n % 100 between 11 and 13 then 'th'
    when v_n % 10 = 1 then 'st'
    when v_n % 10 = 2 then 'nd'
    when v_n % 10 = 3 then 'rd'
    else 'th'
  end;
  return 'My ' || v_n || v_suffix || ' Tree';
end;
$$;

revoke all on function private.default_tree_name(uuid) from anon, public;

-- Allowlisted first sign-in: the bootstrap tree gets the default name.
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
    values ('My Family Tree', 'my-family-tree', v_uid)
    returning id into v_tree_id;
  end if;

  insert into public.profiles (auth_user_id, display_name, role)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    'admin'
  )
  returning * into v_profile;

  perform private.join_tree(v_tree_id, v_uid, 'admin', null);
  return v_profile;
end;
$$;

-- A founder invite plants a tree named by the count of trees they're on.
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
    insert into public.profiles (auth_user_id, display_name, role, invited_by_user_id)
    values (v_uid, v_name, v_invite.joins_as, v_invite.created_by)
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

  -- Keep the invite's vouch for its entry before the invite goes.
  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;
  end if;

  -- Remember where this sign-in should land.
  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  perform set_config('ancestree.privileged_profile_write', '', true);
  return v_profile;
end;
$$;
