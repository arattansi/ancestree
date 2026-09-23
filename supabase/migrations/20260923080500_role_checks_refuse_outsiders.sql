-- Security fix: a signed-in outsider got past every Root-only check on a tree.
--
-- `private.role_in(tree)` is null for anyone with no tree_members row there,
-- so `private.is_root_of(tree)` was null for them too, and every guard written
-- `if not private.is_root_of(x) then raise …` let them through: `not null` is
-- null, and an `if` only acts on true. Anyone who had a tree's id (a visitor
-- through tree_visibility, an ex-member) could rename or delete it, change its
-- members' account types, bring people onto it, resolve its claims and flags,
-- and verify or revert its entries. Members who aren't Roots were always
-- refused ('member' = 'admin' is false). Found by the Step 30.3 agent,
-- 2026-09-22.
--
-- 1. The yes/no checks built on role_in answer false instead of null:
--    is_root_of, is_branch_of, can_invite_as, can_edit_person,
--    can_delete_person and can_invite_to_claim. In an RLS policy, or in
--    `if check() then`, null already meant no, so nothing new is allowed.
--    Every `not check()` on live was read for the other case, a null relied
--    on to refuse where false would allow: none of these six is used so.
--    can_edit_person and can_invite_to_claim were null for more than
--    outsiders: `p_person_id = private.self_person_id()` is null for anyone
--    without their own entry, so a member who hadn't added themselves could
--    resolve any flag (resolve_entry_flag) and send a claim invite for any
--    entry (invites_guard).
--
--    `private.is_leaf_in` keeps its null on purpose: can_edit_relationship's
--    `not private.is_leaf_in(…)` and can_edit_pet's
--    `not coalesce(private.is_leaf_in(…), true)` count on it to refuse someone
--    no longer on the tree. False there would let them back in.
--
-- 2. Two guards had a null of their own, still open after (1):
--    - set_home_tree compared `v_owner = v_uid`, null for an unclaimed entry,
--      so anyone signed in could move its home to another tree showing it.
--    - documents_guard compared `new.person_id = private.self_person_id()`,
--      so anyone without their own entry who could edit a document could
--      share it across trees.
--
-- 3. tree_members_guard now refuses outsiders, and remove_tree_member would
--    have tripped on it: deleting a departing member's profile clears
--    invited_by_user_id (on delete set null) on every tree they invited
--    someone onto, run as the removing Root, who may not be on those trees.
--    Clearing an inviter whose profile is gone is let through.

create or replace function private.is_root_of(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.role_in(p_tree) = 'admin', false);
$$;

create or replace function private.is_branch_of(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.role_in(p_tree) = 'branch_admin', false);
$$;

create or replace function private.can_invite_as(p_tree_id uuid, p_joins_as text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.is_root_of(p_tree_id)
    or (p_joins_as = 'leaf' and private.role_in(p_tree_id) in ('branch_admin', 'member')),
    false
  );
$$;

create or replace function private.can_edit_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    or p_person_id = private.self_person_id()
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and exists (
        select 1
        from public.people pe
        where pe.id = p_person_id
          and (
            pe.owner_user_id = (select auth.uid())
            or (
              pe.created_by = (select auth.uid())
              and pe.owner_user_id = pe.created_by
              and not private.person_is_claimed(pe.id)
            )
          )
      )
    )
    or (
      private.is_on_own_branch(p_person_id, h.tree)
      and not private.person_is_someones_own(p_person_id)
    ),
    false
  )
  from h;
$$;

create or replace function private.can_delete_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.entry_comments ec
        where ec.person_id = p_person_id and ec.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.documents d
        where d.person_id = p_person_id and d.uploaded_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$$;

create or replace function private.can_invite_to_claim(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.role_in(h.tree) in ('admin', 'branch_admin', 'member')
    and private.can_edit_person(p_person_id)
    and not private.person_is_claimed(p_person_id)
    and exists (
      select 1 from public.people pe
      where pe.id = p_person_id and pe.owner_user_id = pe.created_by and not pe.is_deceased
    )
    and not exists (select 1 from public.profiles p where p.self_person_id = p_person_id),
    false
  )
  from h;
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
  if v_owner is distinct from v_uid
     and not (v_owner is null and private.is_root_of(v_home)) then
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

create or replace function private.documents_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shared_across_trees is distinct from old.shared_across_trees
     and (select auth.uid()) is not null
     and not (
       coalesce(new.person_id = private.self_person_id(), false)
       or private.is_root_of(private.home_tree(new.person_id))
       or exists (
         select 1 from public.claims c
         where c.person_id = new.person_id and c.status = 'approved'
           and c.claimant_user_id = (select auth.uid())
       )
     ) then
    raise exception 'Only this person, or a Root of their home tree, can share a document across trees'
      using errcode = '42501';
  end if;
  if new.tree_id <> old.tree_id or new.person_id <> old.person_id then
    raise exception 'A document stays where it was uploaded' using errcode = '42501';
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
