-- Step 30.9 — Accepting an invite shows your own entry on that tree
--
-- A member who already had their own entry and accepted an invite to
-- another tree joined it and nothing more: `private.join_tree` adds a
-- membership, so their entry stayed off the new tree's canvas, and they
-- landed on onboarding to read that a Root of the tree could bring it over
-- from their admin page, with nothing to press. Nobody on that tree knew to.
--
-- Decided 2026-09-22: accepting an invite is their say-so. So when
-- `redeem_invite` redeems an ordinary invite — not a founder invite, not a
-- claim invite — for someone who has an entry of their own, that entry is
-- placed on the invite's tree, active, unless the tree shows it already, and
-- each of the tree's Roots is told (`placed_on_join`), with the way to the
-- admin page's "Who This Tree Shows", where they can take it off again.
-- `redeem_invite_tree` then reports `self_placed`, and the app opens the
-- canvas on their entry (`joinedTreeHref`).
--
-- * `placed_by` is the member, not the inviter: accepting is what put the
--   entry there. It sits in the admin page's "Brought over so far" with the
--   rest, for a Root to keep or remove; the inviter never chose to show it,
--   and may be a Branch or Canopy member, who can't place anyone
--   (`place_people` is a Root's).
-- * A pending or declined placement left by an earlier request becomes
--   active, keeping the Root who asked as `placed_by`, as accepting that
--   request would have (`respond_to_placement`).
-- * A claim invite keeps just the vouch (Step 30.2): placing their own
--   entry as well would show two entries for one person. A founder brings
--   theirs over on their first run (Step 29, `bringOwnEntry`).
-- * If placing fails for any reason, they still join, as before.
--
-- The live body of `redeem_invite` was checked against 20260923070000
-- first, and the type check against the live constraint.

-- ---------------------------------------------------------------------------
-- 1. The Roots' notice
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_verified',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placement_accepted', 'placement_declined',
    'tree_request_approved', 'placed_on_join'
  )
);

-- ---------------------------------------------------------------------------
-- 2. Redeeming an ordinary invite places their own entry
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
  v_tree public.trees;
  v_name text;
  v_new_profile boolean := false;
  v_member text;
  v_inviter text;
  v_root uuid;
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
    v_new_profile := true;
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

  -- A claim invite (never a founder invite: `invites_guard`). Its vouch for
  -- the entry outlives the invite.
  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;

    -- Someone with no entry of their own claims it here (Step 30.2), the
    -- vouch standing in for the name match. Anything that stops the claim —
    -- the entry claimed by someone else, deleted or off this tree, the daily
    -- limit — leaves them joined, for onboarding to take from there. A member
    -- who has an entry keeps the vouch for the canvas's "This is me".
    if v_profile.self_person_id is null then
      begin
        perform private.claim_as_self(v_invite.person_id, v_tree.id, true);
        -- Named after the entry, not the email, when the invite carried no name.
        if v_new_profile and nullif(btrim(p_display_name), '') is null then
          update public.profiles
          set display_name = coalesce(nullif(private.person_label(v_invite.person_id), ''), display_name)
          where auth_user_id = v_uid;
        end if;
      exception when others then
        null;
      end;
    end if;
  end if;

  -- An ordinary invite accepted by someone who has an entry of their own
  -- shows it on the tree they've joined (Step 30.9): accepting is their
  -- say-so. Every Root of the tree is told, and can take it off again. A
  -- claim invite keeps just the vouch above, and a founder brings theirs
  -- over on their first run. Anything that stops it leaves them joined.
  if not v_invite.founds_tree
     and v_invite.person_id is null
     and v_profile.self_person_id is not null
     and not private.is_placed(v_tree.id, v_profile.self_person_id) then
    begin
      insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
      values (v_tree.id, v_profile.self_person_id, 'active', v_uid, now())
      on conflict (tree_id, person_id) do update
        set status = 'active', responded_at = now();

      v_member := coalesce(private.member_label(v_uid), 'A relative');
      v_inviter := private.member_label(v_invite.created_by);
      for v_root in
        select m.user_id from public.tree_members m
        where m.tree_id = v_tree.id and m.role = 'admin'
      loop
        perform private.notify(
          v_root, v_uid, 'placed_on_join', v_profile.self_person_id, null,
          v_member
            || case
                 when v_root = v_invite.created_by then ' accepted your invite to ' || v_tree.name
                 else ' joined ' || v_tree.name || coalesce(' with an invite from ' || v_inviter, ' with an invite')
               end
            || ', bringing their own entry from another tree. You can take it off this tree from the admin page.',
          v_tree.id
        );
      end loop;
    exception when others then
      null;
    end;
  end if;

  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  perform set_config('ancestree.privileged_profile_write', '', true);

  -- Read afresh: a claim above set `self_person_id` and perhaps the name.
  select * into v_profile from public.profiles where auth_user_id = v_uid;
  return v_profile;
end;
$$;
