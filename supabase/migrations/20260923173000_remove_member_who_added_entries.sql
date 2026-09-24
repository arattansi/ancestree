-- Step 45 — A Root can remove a member who has added entries
--
-- `remove_tree_member` failed for any member who had ever added an entry:
-- "Only a card's position can be changed here" (42501), so the admin
-- console's Remove said only "Couldn't remove that member. Try again."
-- Every entry a member adds gets its home placement with `placed_by` = them
-- (`private.people_home_placement`), and the function handed those to the
-- acting Root before it set `ancestree.privileged_profile_write`, which it
-- set only around the membership delete. `private.tree_placements_guard`
-- lets `placed_by` change only as a privileged write (that flag, or no
-- signed-in user), so the whole removal rolled back. Only a member who had
-- added nothing could be removed. Found during Step 42.
--
-- 1. `remove_tree_member` hands over the placements and drops the
--    membership under the flag, saving its value first and putting it back
--    after, as `private.join_tree` and `private.merge_invited_entry` do.
--    Every check stays: Roots only, never yourself, never a Root
--    (ROOT_IS_PERMANENT), and the profile goes with their last tree.
-- 2. `private.tree_placements_guard` lets the profile delete's cascade
--    through. When it's the member's last tree, deleting their profile
--    clears `placed_by` (on delete set null) on any card they placed on a
--    tree they had already left, run as the removing Root, who may not be on
--    that tree. Clearing a placer whose profile is gone is let through, as
--    `tree_members_guard` does for `invited_by_user_id` (Step 35).
--
-- The live bodies were checked against their migrations first (md5
-- identical): `remove_tree_member` 20260922090000, `tree_placements_guard`
-- 20260923050000.

-- ---------------------------------------------------------------------------
-- 1. The handover runs under the privileged flag
-- ---------------------------------------------------------------------------
create or replace function public.remove_tree_member(p_tree uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid := (select auth.uid());
  v_role text;
  v_last boolean;
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
begin
  if v_root is null or not private.is_root_of(p_tree) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = v_root then
    raise exception 'cannot remove yourself' using errcode = '22023';
  end if;
  select role into v_role from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  if v_role is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if v_role = 'admin' then
    raise exception 'ROOT_IS_PERMANENT: cannot remove a Root' using errcode = '22023';
  end if;

  update public.people set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.people set owner_user_id = v_root where owner_user_id = p_user_id and tree_id = p_tree;
  update public.relationships set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.entry_comments set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.documents set uploaded_by = v_root where uploaded_by = p_user_id and tree_id = p_tree;
  update public.invites set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.share_links set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pets set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pet_companions pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;
  update public.pet_comments pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;

  -- Who placed a card, and the membership itself, change only as a
  -- privileged write (tree_placements_guard, tree_members_guard).
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.tree_placements set placed_by = v_root where placed_by = p_user_id and tree_id = p_tree;
  delete from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

  select not exists (select 1 from public.tree_members where user_id = p_user_id) into v_last;
  if v_last then
    -- Anything left elsewhere (nothing, if every home was this tree) is
    -- reassigned by the caller before the auth user goes.
    update public.people set created_by = v_root where created_by = p_user_id;
    update public.people set owner_user_id = v_root where owner_user_id = p_user_id;
    update public.relationships set created_by = v_root where created_by = p_user_id;
    update public.entry_comments set created_by = v_root where created_by = p_user_id;
    update public.documents set uploaded_by = v_root where uploaded_by = p_user_id;
    update public.invites set created_by = v_root where created_by = p_user_id;
    update public.share_links set created_by = v_root where created_by = p_user_id;
    update public.pets set created_by = v_root where created_by = p_user_id;
    update public.pet_companions set created_by = v_root where created_by = p_user_id;
    update public.pet_comments set created_by = v_root where created_by = p_user_id;
    update public.trees set created_by = null where created_by = p_user_id;
    -- A card they placed on a tree they had already left keeps its place,
    -- with nobody recorded as placing it (on delete set null).
    delete from public.profiles where auth_user_id = p_user_id;
  end if;
  return v_last;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. A placer's profile going clears their name from the card
-- ---------------------------------------------------------------------------
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
    -- Whoever placed the card is going: deleting their profile clears the
    -- link (on delete set null) as whoever deleted it, for remove_tree_member
    -- a Root who may not be on this tree.
    if old.placed_by is not null and new.placed_by is null
       and new.tree_id = old.tree_id and new.person_id = old.person_id
       and new.status = old.status
       and new.responded_at is not distinct from old.responded_at
       and not exists (select 1 from public.profiles p where p.auth_user_id = old.placed_by) then
      return new;
    end if;

    if new.tree_id <> old.tree_id or new.person_id <> old.person_id
       or new.status <> old.status or new.placed_by is distinct from old.placed_by
       or new.responded_at is distinct from old.responded_at then
      raise exception 'Only a card''s position can be changed here' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
