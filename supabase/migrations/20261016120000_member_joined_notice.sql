-- Step 171 — Onboarding R10: tell the Roots when someone joins
--
-- From the 2026-10-16 onboarding audit (W10): Root, Branch and Leaf were
-- explained before anyone had joined, and nothing told a Root when someone
-- did — a plain invite accepted, or a claim invite taken by someone with no
-- entry of their own, raised no notice at all. Aalim's decision: each Root
-- hears "Nadia joined The Haddad Family.", and the app offers making her a
-- Branch there, within the four Branches each Root may make (Step 39,
-- `tree_members_limits`, which this leaves as it is).
--
-- One notice a join, for each Root: the ones `redeem_invite` already sent
-- (`placed_on_join` for someone bringing their own entry, `joined_by_link`
-- for the family link) stay as they are, and the new `member_joined` is for
-- everyone else. The app offers Branch on all three.
--
-- 1. `member_joined` added to `notifications_type_check`.
-- 2. `redeem_invite` re-created from `20260929090000_carry_a_family_line`
--    (live body unchanged since): the two notices above now mark the Roots
--    told, and a last block tells them otherwise.

-- ---------------------------------------------------------------------------
-- 1. The notice
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_updated',
    'person_added', 'edit_reverted', 'placement_requested',
    'placements_requested', 'placement_accepted', 'placement_declined',
    'placements_lapsed', 'tree_request_approved', 'placed_on_join',
    'joined_by_link', 'change_suggested', 'suggestion_accepted',
    'suggestion_declined', 'story_to_approve', 'story_approved',
    'story_declined', 'story_commented', 'photo_to_approve',
    'photo_approved', 'photo_declined', 'placeholder_child',
    'invite_renewed', 'member_joined'
  ));

-- ---------------------------------------------------------------------------
-- 2. Raised where invites and family links are redeemed
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
  -- A claim invite accepted by someone whose own entry is another one.
  v_claimed text;
  v_maker uuid;
  v_merged boolean := false;
  v_joined text;
  -- The family link (Step 52): how they came in, for the Roots' notices.
  v_family_link boolean;
  v_via_link text;
  v_told boolean := false;
  -- Their own entry once the claim above has run (Step 171).
  v_self uuid;
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

  -- An invite emailed to someone joins that address and no other (Step 51),
  -- not whoever happens to be signed in where it's opened: a forwarded
  -- email, a shared device. For a claim invite that would hand them the
  -- entry it names. The account's own address, verified, must be the one it
  -- was sent to. A bare link names nobody, so anyone may still take it.
  if v_invite.invited_email is not null
     and not exists (
       select 1 from auth.users u
       where u.id = v_uid
         and u.email_confirmed_at is not null
         and lower(u.email) = lower(btrim(v_invite.invited_email))
     ) then
    raise exception 'INVITE_FOR_ANOTHER_ADDRESS: this invite was sent to another email address'
      using errcode = '42501';
  end if;

  -- A family link (Step 52) goes round a family group, where most who open
  -- it may be members already: they go straight through, uncounted. Anyone
  -- else takes one of its places, and once they're gone it's closed.
  v_family_link := v_invite.max_uses is not null;
  if v_family_link then
    if exists (
      select 1 from public.tree_members m
      where m.tree_id = v_invite.tree_id and m.user_id = v_uid
    ) then
      perform set_config('ancestree.redeemed_tree', v_invite.tree_id::text, true);
      select * into v_profile from public.profiles where auth_user_id = v_uid;
      return v_profile;
    end if;
    if v_invite.use_count >= v_invite.max_uses then
      raise exception 'invalid_or_expired_invite' using errcode = '22023';
    end if;
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

  -- Counted and recorded (Step 52). The row is locked above, so the count
  -- can't pass the cap.
  if v_family_link then
    update public.invites
    set use_count = use_count + 1
    where id = v_invite.id
    returning * into v_invite;
    insert into private.family_link_joins (tree_id, user_id, invite_id)
    values (v_tree.id, v_uid, v_invite.id);
    v_via_link := ' joined ' || v_tree.name || ' with the family link ('
      || v_invite.use_count || ' of ' || v_invite.max_uses
      || case when v_invite.use_count >= v_invite.max_uses then ', now full' else '' end
      || ')';
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
    -- limit — leaves them joined, for onboarding to take from there.
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
    -- Someone who has an entry already (Step 41.3): the invite's entry folds
    -- into theirs when its maker alone has built on it, and theirs takes its
    -- place here. Otherwise it's left as it is, and theirs is shown beside it
    -- below, for a Root to sort out. Either way the Roots hear which.
    elsif v_invite.person_id <> v_profile.self_person_id then
      v_claimed := coalesce(nullif(private.person_label(v_invite.person_id), ''), 'an entry');
      select created_by into v_maker from public.people where id = v_invite.person_id;
      begin
        v_merged := private.merge_invited_entry(v_invite.person_id, v_profile.self_person_id, v_tree.id);
      exception when others then
        v_merged := false;
      end;
    end if;
  end if;

  -- An invite accepted by someone who has an entry of their own shows it on
  -- the tree they've joined (Step 30.9): accepting is their say-so. Since
  -- Step 41.3 that includes a claim invite, unless its merge above placed it
  -- already. Every Root of the tree is told, and can take it off again. A
  -- founder brings theirs over on their first run. Anything that stops it
  -- leaves them joined.
  if not v_invite.founds_tree
     and v_profile.self_person_id is not null
     and not private.is_placed_in_full(v_tree.id, v_profile.self_person_id) then
    begin
      insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
      values (v_tree.id, v_profile.self_person_id, 'active', v_uid, now())
      on conflict (tree_id, person_id) do update
        set status = 'active', responded_at = now(),
            approval = case when tp.approval = 'none' then 'none' else 'approved' end,
            answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end;

      -- A claim invite's own notice follows below.
      if v_claimed is null then
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
                   when v_family_link then v_via_link
                   when v_root = v_invite.created_by then ' accepted your invite to ' || v_tree.name
                   else ' joined ' || v_tree.name || coalesce(' with an invite from ' || v_inviter, ' with an invite')
                 end
              || ', bringing their own entry from another tree. You can take it off this tree from the Root console.',
            v_tree.id
          );
        end loop;
        v_told := true;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Everyone else who came in by the family link (Step 52): each Root hears
  -- who, and how full it is.
  if v_family_link and not v_told then
    begin
      v_member := coalesce(private.member_label(v_uid), 'A relative');
      for v_root in
        select m.user_id from public.tree_members m
        where m.tree_id = v_tree.id and m.role = 'admin'
      loop
        perform private.notify(
          v_root, v_uid, 'joined_by_link', null, null,
          v_member || v_via_link || '.',
          v_tree.id
        );
      end loop;
      v_told := true;
    exception when others then
      null;
    end;
  end if;

  -- What accepting a claim invite did with the entry it named (Step 41.3):
  -- folded into theirs, or both on the tree now. Told to every Root, and to
  -- whoever made the entry if it was merged away and they aren't one.
  if v_claimed is not null
     and private.is_placed(v_tree.id, v_profile.self_person_id) then
    begin
      v_member := coalesce(private.member_label(v_uid), 'A relative');
      v_inviter := private.member_label(v_invite.created_by);
      for v_root in
        select m.user_id from public.tree_members m
        where m.tree_id = v_tree.id and m.role = 'admin'
      loop
        v_joined := case
          when v_root = v_invite.created_by then
            v_member || ' accepted your invite to claim ' || v_claimed
          else
            v_member || ' joined ' || v_tree.name
              || coalesce(' with an invite from ' || v_inviter, ' with an invite')
              || ' to claim ' || v_claimed
        end;
        perform private.notify(
          v_root, v_uid, 'placed_on_join',
          case when v_merged then v_profile.self_person_id else v_invite.person_id end,
          null,
          case
            when v_merged then
              v_joined || '. They already had their own entry on another tree, so theirs has taken that entry''s place on '
                || v_tree.name || ', with everything that was on it.'
            else
              v_joined || ', but already had their own entry on another tree, so ' || v_tree.name
                || ' now shows both. If they''re the same person, you can delete the entry '
                || case when v_root = v_invite.created_by then 'you invited them to claim' else 'they were invited to claim' end
                || ', or take their own entry off this tree from the Root console.'
          end,
          v_tree.id
        );
      end loop;
      v_told := true;

      if v_merged and exists (
        select 1 from public.tree_members m
        where m.tree_id = v_tree.id and m.user_id = v_maker and m.role <> 'admin'
      ) then
        perform private.notify(
          v_maker, v_uid, 'claim_approved', v_profile.self_person_id, null,
          case
            when v_maker = v_invite.created_by then
              v_member || ' accepted your invite to claim ' || v_claimed
            else
              v_member || ' accepted an invite to claim ' || v_claimed || ', which you added'
          end
            || '. They already had their own entry on another tree, so theirs has taken that entry''s place on '
            || v_tree.name || ', with everything that was on it.',
          v_tree.id
        );
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Everyone the notices above didn't cover (Step 171): a plain invite, or
  -- a claim invite taken by someone with no entry of their own. Each Root
  -- hears who joined, with their entry if a claim gave them one here; the
  -- app offers making them a Branch on it. A founder invite starts a tree
  -- of their own, with nobody to tell.
  if not v_invite.founds_tree and not v_told then
    begin
      v_member := coalesce(private.member_label(v_uid), 'A relative');
      select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
      if v_self is not null and not private.is_placed(v_tree.id, v_self) then
        v_self := null;
      end if;
      for v_root in
        select m.user_id from public.tree_members m
        where m.tree_id = v_tree.id and m.role = 'admin'
      loop
        perform private.notify(
          v_root, v_uid, 'member_joined', v_self, null,
          v_member || ' joined ' || v_tree.name || '.',
          v_tree.id
        );
      end loop;
    exception when others then
      null;
    end;
  end if;

  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  -- A family link stays for the next one; any other invite is spent.
  if not v_family_link then
    delete from public.invite_requests where invite_id = v_invite.id;
    delete from public.invites where id = v_invite.id;
  end if;

  perform set_config('ancestree.privileged_profile_write', '', true);

  -- Read afresh: a claim above set `self_person_id` and perhaps the name.
  select * into v_profile from public.profiles where auth_user_id = v_uid;
  return v_profile;
end;
$$;
