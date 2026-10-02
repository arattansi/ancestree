-- Step 103.4: account and tree actions on the admin page's manage tab. A
-- beta reviewer finds an account (by address or name) or a tree (by name)
-- and acts on it: suspends or restores the account (a ban in Supabase Auth,
-- set by the app with the service role), deletes the account (the app's
-- own delete-account hand-over, with the service role), or deletes the
-- tree (`delete_tree`, which now lets a reviewer through as well as the
-- tree's Roots).
--
-- Nothing new is stored. The two finders only read, for reviewers only.

-- Accounts whose address or name holds `p_query`, or the one `p_user`:
-- whether it's suspended or a reviewer's, and each tree it's on with its
-- type there. Where it's the tree's only Root, the other members who could
-- take over (`successors`), as the account page's own deletion asks.
create or replace function public.find_accounts(
  p_query text default null,
  p_user uuid default null
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  suspended boolean,
  reviewer boolean,
  trees jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  if v_q is null and p_user is null then
    return;
  end if;
  v_like := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select
      u.id,
      u.email::text,
      p.display_name,
      u.created_at,
      u.last_sign_in_at,
      coalesce(u.banned_until > now(), false),
      exists (select 1 from private.beta_reviewers r where lower(r.email) = lower(u.email)),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'role', m.role,
          'successors', case
            when m.role = 'admin' and not exists (
              select 1 from public.tree_members o
              where o.tree_id = m.tree_id and o.role = 'admin' and o.user_id <> u.id
            ) then coalesce((
              select jsonb_agg(jsonb_build_object(
                'user_id', o.user_id, 'name', op.display_name, 'role', o.role
              ) order by op.display_name)
              from public.tree_members o
              join public.profiles op on op.auth_user_id = o.user_id
              where o.tree_id = m.tree_id and o.user_id <> u.id
            ), '[]'::jsonb)
          end
        ) order by t.name)
        from public.tree_members m
        join public.trees t on t.id = m.tree_id
        where m.user_id = u.id
      ), '[]'::jsonb)
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
    where case
      when p_user is not null then u.id = p_user
      else u.email ilike v_like or p.display_name ilike v_like
    end
    order by (lower(u.email) = lower(v_q)) desc nulls last, u.created_at desc
    limit 20;
end;
$$;

-- Trees whose name holds `p_query`, or the one `p_tree`: when each was
-- started, its members and the entries whose home it is, and its Roots.
create or replace function public.find_trees(
  p_query text default null,
  p_tree uuid default null
)
returns table (
  tree_id uuid,
  name text,
  created_at timestamptz,
  members integer,
  entries integer,
  roots text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  if v_q is null and p_tree is null then
    return;
  end if;
  v_like := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select
      t.id,
      t.name,
      t.created_at,
      (select count(*)::integer from public.tree_members m where m.tree_id = t.id),
      (select count(*)::integer from public.people pe where pe.tree_id = t.id),
      coalesce((
        select array_agg(coalesce(p.display_name, 'Unnamed member') order by m.created_at)
        from public.tree_members m
        join public.profiles p on p.auth_user_id = m.user_id
        where m.tree_id = t.id and m.role = 'admin'
      ), '{}'::text[])
    from public.trees t
    where case
      when p_tree is not null then t.id = p_tree
      else t.name ilike v_like
    end
    order by (lower(t.name) = lower(v_q)) desc nulls last, t.created_at desc
    limit 20;
end;
$$;

revoke all on function public.find_accounts(text, uuid) from public, anon;
revoke all on function public.find_trees(text, uuid) from public, anon;
grant execute on function public.find_accounts(text, uuid) to authenticated;
grant execute on function public.find_trees(text, uuid) to authenticated;

-- A tree's Roots delete it, and now a beta reviewer may too. Body as in
-- 20260929090000_carry_a_family_line, with only the check widened.
create or replace function public.delete_tree(p_tree uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_moved int := 0;
  v_gone int := 0;
  v_row record;
  v_new_home uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) and not private.is_beta_reviewer() then
    raise exception 'Only a Root can delete a tree' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  for v_row in
    select pe.id from public.people pe where pe.tree_id = p_tree
  loop
    select pl.tree_id into v_new_home
    from public.tree_placements pl
    where pl.person_id = v_row.id and pl.tree_id <> p_tree
      and pl.status = 'active' and pl.detail = 'full'
    order by pl.created_at asc
    limit 1;

    if v_new_home is not null then
      update public.people set tree_id = v_new_home where id = v_row.id;
      v_moved := v_moved + 1;
    else
      v_gone := v_gone + 1;
    end if;
  end loop;

  -- Their own entry gone with the tree: members start over elsewhere.
  update public.profiles p
  set self_person_id = null
  where p.self_person_id in (select id from public.people where tree_id = p_tree);

  delete from public.trees where id = p_tree;

  perform set_config('ancestree.privileged_profile_write', '', true);
  return jsonb_build_object('moved', v_moved, 'deleted', v_gone);
end;
$$;
