-- Step 41.3 — A claim invite accepted by someone who already has an entry
--
-- A member with their own entry who accepted a claim invite to another tree
-- joined it and nothing more. `redeem_invite` kept only the vouch (Step
-- 30.2): placing their entry as well, as Step 30.9 does for an ordinary
-- invite, would show two entries for one person. So nothing of theirs was on
-- the tree they'd joined. They landed on onboarding's "A Root of <tree> can
-- bring it onto this one from their admin page", with nothing to press (the
-- canvas sends them back there), and no Root was told.
--
-- Decided 2026-09-23 (Aalim): accepting folds the invite's entry into their
-- own when nobody but its maker has built on it, and shows theirs where it
-- was. Anything else shows theirs beside it, for a Root to sort out.
--
-- 1. `private.documents_guard` — a document may be refiled under another
--    entry inside such a merge (the privileged flag). Its tree never changes.
-- 2. `private.merge_invited_entry` — folds the invite's entry into their own.
--    Only a placeholder its maker alone has built on (`is_own_placeholder`,
--    Step 36's test for "This is me"), unclaimed, and shown on the invite's
--    tree and no other. Never into or out of an entry of someone who has died
--    (Step 37), and never when the two are plainly different people: joined
--    by a line, or born more than a year apart. Theirs takes its place on
--    that tree's canvas, with its lines (less any that would double up or
--    point at itself), notes, documents, companions and bloodline anchors,
--    and then it's deleted. Their own entry's details stay as they are. The
--    documents stop being shared across trees, since theirs is on others.
-- 3. `redeem_invite` — runs it for a claim invite accepted by someone whose
--    own entry is another one. Then their own entry is shown on the tree, as
--    Step 30.9 does for an ordinary invite, unless the merge has placed it.
--    Every Root is told which it was: the invite's entry folded into theirs,
--    or both on the tree now ("if they're the same person, you can delete
--    the entry they were invited to claim"). Whoever made the entry hears of
--    a merge too, when the Roots' notice doesn't reach them. They land on
--    their own entry (`redeem_invite_tree`'s `self_placed`).
--
-- The live bodies of `redeem_invite` and `documents_guard` were checked
-- against 20260923073000 and 20260923080500 first (md5 identical).

-- ---------------------------------------------------------------------------
-- 1. A document follows its entry into a merge
-- ---------------------------------------------------------------------------
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
  -- It moves to another entry only when its own is merged into that one
  -- (Step 41.3, `private.merge_invited_entry`).
  if new.tree_id <> old.tree_id
     or (new.person_id <> old.person_id
         and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on') then
    raise exception 'A document stays where it was uploaded' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The invite's entry folds into their own
-- ---------------------------------------------------------------------------
create or replace function private.merge_invited_entry(
  p_invited uuid, p_own uuid, p_tree uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_invited public.people;
  v_own public.people;
begin
  select * into v_invited from public.people where id = p_invited;
  select * into v_own from public.people where id = p_own;
  if v_invited.id is null or v_own.id is null or p_invited = p_own
     or not exists (
       select 1 from public.profiles pr
       where pr.auth_user_id = v_uid and pr.self_person_id = p_own
     ) then
    return false;
  end if;

  -- Someone who has died is nobody's own entry (Steps 36 and 37).
  if v_invited.is_deceased or v_invited.date_of_death is not null
     or v_own.is_deceased or v_own.date_of_death is not null then
    return false;
  end if;

  -- A stand-in its maker added and nobody else has built on, spoken for by
  -- nobody, shown on this tree alone: folding it in loses nobody's work and
  -- moves nothing onto a tree they didn't agree to.
  if not private.person_is_claimable(p_invited)
     or not private.is_own_placeholder(p_invited, v_invited.created_by)
     or not private.is_placed(p_tree, p_invited)
     or exists (
       select 1 from public.tree_placements pl
       where pl.person_id = p_invited and pl.tree_id <> p_tree
     ) then
    return false;
  end if;

  -- Plainly someone else: a relative of theirs (a parent with the same name),
  -- or born more than a year apart.
  if exists (
       select 1 from public.relationships r
       where (r.from_person = p_invited and r.to_person = p_own)
          or (r.from_person = p_own and r.to_person = p_invited)
     )
     or abs(extract(year from v_invited.date_of_birth) - extract(year from v_own.date_of_birth)) > 1 then
    return false;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  -- Theirs sits where the invited entry sat on this canvas, unless it's
  -- there already. A placement a Root asked for and they hadn't answered
  -- becomes active, keeping that Root as `placed_by` (as Step 30.9 does).
  if not private.is_placed(p_tree, p_own) then
    insert into public.tree_placements as tp
      (tree_id, person_id, status, placed_by, responded_at, pos_x, pos_y, pos_dx, pos_dy)
    select p_tree, p_own, 'active', v_uid, now(), pl.pos_x, pl.pos_y, pl.pos_dx, pl.pos_dy
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_invited
    on conflict (tree_id, person_id) do update
      set status = 'active', responded_at = now(),
          pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          pos_dx = excluded.pos_dx, pos_dy = excluded.pos_dy;
  end if;

  -- Its lines move onto theirs, dropping any that would double up or point
  -- at itself (as `claim_person` does).
  delete from public.relationships r
  where (r.from_person = p_invited or r.to_person = p_invited)
    and (
      (case when r.from_person = p_invited then p_own else r.from_person end)
        = (case when r.to_person = p_invited then p_own else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = p_invited then p_own else from_person end,
      to_person = case when to_person = p_invited then p_own else to_person end
  where from_person = p_invited or to_person = p_invited;

  -- Its notes stay on this tree's board, and its documents in this tree's
  -- bank: not shared across trees, since theirs is shown on others.
  update public.entry_comments set person_id = p_own where person_id = p_invited;
  update public.documents
  set person_id = p_own, shared_across_trees = false
  where person_id = p_invited;

  -- Its companions, staying their pet's first person where it was.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_own, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = p_invited and private.is_placed(pt.tree_id, p_own)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_own
  where pt.primary_person_id = p_invited
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_own
    );

  -- And a bloodline it anchors.
  update public.bloodline_anchors a
  set person_id = p_own
  where a.person_id = p_invited
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_own
    );

  delete from public.people where id = p_invited;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return true;
end;
$$;

revoke all on function private.merge_invited_entry(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Redeeming a claim invite with an entry of your own
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
