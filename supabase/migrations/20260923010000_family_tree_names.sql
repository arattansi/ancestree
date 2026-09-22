-- Default tree names, take two: "Family" for someone's first tree, then
-- "Second Family", "Third Family", … (lib/tree-names.ts is the mirror).
-- Re-creates the helper from 20260923000000 and the first-admin bootstrap
-- with only the names changed; their live bodies were checked against that
-- file first.

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
    return 'Family';
  end if;
  if v_existing <= array_length(v_words, 1) then
    return v_words[v_existing] || ' Family';
  end if;
  v_n := v_existing + 1;
  v_suffix := case
    when v_n % 100 between 11 and 13 then 'th'
    when v_n % 10 = 1 then 'st'
    when v_n % 10 = 2 then 'nd'
    when v_n % 10 = 3 then 'rd'
    else 'th'
  end;
  return v_n || v_suffix || ' Family';
end;
$$;

revoke all on function private.default_tree_name(uuid) from anon, public;

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
