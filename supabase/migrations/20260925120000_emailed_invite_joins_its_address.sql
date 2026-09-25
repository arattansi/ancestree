-- Step 51 — An emailed invite joins only the address it was sent to
--
-- An invite emailed to someone (`invites.invited_email`) was bound to that
-- address only on the signed-out path, where `signInWithInvite` signs in
-- exactly that address. `redeem_invite` itself never looked: whoever was
-- signed in redeemed it. A member who opened a forwarded email, or anyone
-- on a shared device, joined in the recipient's place, and for a claim
-- invite took the entry it names: claimed it outright (Step 30.2), or had
-- it folded into their own entry (Step 41.3). A Root who opened a claim
-- invite they had sent, to check it, could do the same. The invite page
-- showed a signed-in member the join button without comparing addresses,
-- and the database was the only thing that could stop the rest: the RPC is
-- callable directly, and any sign-in link can be given an `invite=`.
--
-- Decided 2026-09-25 (Aalim): only an account whose verified address is the
-- invite's may redeem it. Anyone else is refused before anything is
-- written, and the page says who it was sent to and offers Sign out. A bare
-- link (no `invited_email`) still joins whoever opens it.
--
-- `redeem_invite` gains that one check, right after the invite is found.
-- The rest of its body is 20260923153000's, unchanged: the Step 30.2 claim,
-- the Step 41.3 merge or placement, the Step 30.9 placement, and every
-- notice. `redeem_invite_tree` (20260925090000) calls it as before, so its
-- `claim_invite` / `had_entry` / `was_member` keys stand; a refusal raises
-- through it, as an invalid invite does. The live body of `redeem_invite`
-- was checked against 20260923153000 first (md5 identical).

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
     and not private.is_placed(v_tree.id, v_profile.self_person_id) then
    begin
      insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
      values (v_tree.id, v_profile.self_person_id, 'active', v_uid, now())
      on conflict (tree_id, person_id) do update
        set status = 'active', responded_at = now();

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
                   when v_root = v_invite.created_by then ' accepted your invite to ' || v_tree.name
                   else ' joined ' || v_tree.name || coalesce(' with an invite from ' || v_inviter, ' with an invite')
                 end
              || ', bringing their own entry from another tree. You can take it off this tree from the admin page.',
            v_tree.id
          );
        end loop;
      end if;
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
                || ', or take their own entry off this tree from the admin page.'
          end,
          v_tree.id
        );
      end loop;

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

  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  perform set_config('ancestree.privileged_profile_write', '', true);

  -- Read afresh: a claim above set `self_person_id` and perhaps the name.
  select * into v_profile from public.profiles where auth_user_id = v_uid;
  return v_profile;
end;
$$;

-- Unchanged: whoever is signed in may call it; it works out who they are.
revoke all on function public.redeem_invite(text, text) from anon, public;
grant execute on function public.redeem_invite(text, text) to authenticated, service_role;
