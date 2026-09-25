-- Step 52 — A family link: one open invite for a family group chat
--
-- The single-use bare invite link ("Create invite link", open to every
-- member) gives way to a family link a Root drops into a WhatsApp group
-- for everyone to join from. Decided 2026-09-25 (Aalim):
--
-- * Only a Root makes one, and it names nobody: whoever opens it joins as a
--   Leaf, as a bare link did. One per tree, shared by its Roots.
-- * It takes a cap the Root picks, 20 at most. Once that many have joined
--   it stops working until it is rotated.
-- * Rotating it is like rotating an API key: a fresh token and a fresh
--   count, and the old link stops working at once.
-- * No expiry: it works until it is full, rotated or turned off.
-- * It records who joined through it, and every Root is told each time.
--
-- A family link is an `invites` row with `max_uses` set, so the invite page,
-- the sign-in form and the callback take it as they took a bare link, and
-- `redeem_invite` redeems it. What differs is in `redeem_invite`: someone
-- on the tree already goes straight through without being counted, a
-- newcomer is counted and logged, and the row stays for the next one.
--
-- 1. `invites.max_uses` / `use_count`, one family link per tree.
-- 2. `private.family_link_joins`, who joined through it.
-- 3. `family_link_guard`: made, rotated, re-capped and counted only through
--    the RPCs below; and `invites_guard` stops anyone but a Root making an
--    open invite at all.
-- 4. `rotate_family_link`, `set_family_link_cap`, `family_link_joins`.
-- 5. `redeem_invite` and `invite_preview`, and the `joined_by_link` notice.
--
-- `redeem_invite` is 20260925120000's (Step 51) with the family-link
-- additions only: its invited-address check, the Step 30.2 claim, the Step
-- 41.3 merge or placement, the Step 30.9 placement and every other notice
-- are unchanged. Its live body and `invites_guard`'s were checked against
-- their files first (md5 identical).

-- ---------------------------------------------------------------------------
-- 1. The link
-- ---------------------------------------------------------------------------

-- How many may join through one link before it must be rotated. The app's
-- `FAMILY_LINK_MAX_USES` (lib/family-link.ts) must agree.
create or replace function private.family_link_max_uses()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20;
$$;

alter table public.invites
  add column max_uses smallint,
  add column use_count smallint not null default 0;

comment on column public.invites.max_uses is
  'Set only on a tree''s family link (Step 52): how many may join through it before it must be rotated, 1 to 20. Null on every other invite, which works once.';
comment on column public.invites.use_count is
  'How many have joined through this family link since it was made or last rotated (Step 52). Only redeem_invite counts; always 0 on other invites.';

alter table public.invites
  add constraint invites_family_link_cap
    check (max_uses is null or max_uses between 1 and 20),
  add constraint invites_family_link_uses
    check (use_count between 0 and 20),
  -- Open to anyone who has it: not bound to an address, an entry or a new tree.
  add constraint invites_family_link_open
    check (max_uses is null or (invited_email is null and person_id is null and not founds_tree));

create unique index invites_one_family_link
  on public.invites (tree_id)
  where max_uses is not null;

-- ---------------------------------------------------------------------------
-- 2. Who joined through it
-- ---------------------------------------------------------------------------

-- In `private`, out of PostgREST's reach: only `redeem_invite` writes here,
-- and a Root reads it through `family_link_joins`. Rows outlive the link
-- they came through (no foreign key on `invite_id`: rotating replaces it),
-- and go with the member's account or the tree.
create table private.family_link_joins (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  invite_id uuid not null,
  joined_at timestamptz not null default now()
);

create index family_link_joins_tree on private.family_link_joins (tree_id, joined_at desc);
create index family_link_joins_user on private.family_link_joins (user_id);

-- ---------------------------------------------------------------------------
-- 3. Only through the RPCs, and only a Root opens an invite to anyone
-- ---------------------------------------------------------------------------

-- Security invoker on purpose, as `profiles_guard`: `current_user` is
-- whoever makes the write. A request through the API runs as
-- `authenticated`; the RPCs below and `redeem_invite` run as their owner,
-- and the service role as itself. So through the API nobody, a Root
-- included, can make a family link, turn an invite into one or back, or
-- change one's cap, count or token. Deleting one (turning it off) is left
-- to `invites_delete`, which is a Root's.
create or replace function private.family_link_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.max_uses is not null
     or new.use_count <> 0
     or (tg_op = 'UPDATE' and old.max_uses is not null) then
    raise exception 'FAMILY_LINK: the family link is made, rotated and capped from the admin page'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger family_link_guard
  before insert or update on public.invites
  for each row execute function private.family_link_guard();

-- `invites_guard` as 20260923091000 left it, plus one refusal: someone who
-- isn't a Root may no longer make an open (bare) invite. They invite by
-- email, which goes through the service role (`sendDirectInvites`).
create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.is_root_of(new.tree_id) then
    if new.founds_tree and new.person_id is not null then
      raise exception 'A founder invite is not for an entry' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.founds_tree then
    raise exception 'Only a Root can invite someone to found a tree' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.joins_as is distinct from old.joins_as
       or (new.person_id is not null and new.person_id is distinct from old.person_id) then
      raise exception 'Only a Root can change what an invite joins as, or whose entry it is for'
        using errcode = '42501';
    end if;
    if new.invited_email is not null and new.invited_email is distinct from old.invited_email then
      raise exception 'Only a Root can change who an invite signs in' using errcode = '42501';
    end if;
  else
    if new.person_id is not null and not private.can_invite_to_claim(new.person_id) then
      raise exception 'You can invite someone to claim only an unclaimed entry you can edit'
        using errcode = '42501';
    end if;
    if new.invited_email is not null then
      raise exception 'Only a Root can bind an invite to an email address' using errcode = '42501';
    end if;
    -- Step 52: an invite open to whoever has it is the family link's job,
    -- and that is a Root's.
    if new.person_id is null then
      raise exception 'Only a Root can make an invite link open to anyone' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Making, rotating and capping it; who joined
-- ---------------------------------------------------------------------------

-- Make the tree's family link, or rotate it: a fresh token, a fresh count
-- and the cap given, attributed to the Root who did it. The old link, if
-- any, stops working at once. Returns the new token.
create or replace function public.rotate_family_link(p_tree uuid, p_max_uses integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
begin
  if v_uid is null or not private.is_root_of(p_tree) then
    raise exception 'Only a Root can make or rotate the family link' using errcode = '42501';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > private.family_link_max_uses() then
    raise exception 'FAMILY_LINK_CAP: a family link takes 1 to % people', private.family_link_max_uses()
      using errcode = '22023';
  end if;

  -- Two Roots rotating at once end with one link, not a unique violation.
  perform 1 from public.trees where id = p_tree for update;

  delete from public.invites where tree_id = p_tree and max_uses is not null;
  insert into public.invites (tree_id, created_by, status, joins_as, max_uses)
  values (p_tree, v_uid, 'active', 'member', p_max_uses)
  returning token into v_token;
  return v_token;
end;
$$;

-- Change how many may join through the current link, keeping its token and
-- count. Below the count, it's full until rotated.
create or replace function public.set_family_link_cap(p_tree uuid, p_max_uses integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_root_of(p_tree) then
    raise exception 'Only a Root can change the family link' using errcode = '42501';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > private.family_link_max_uses() then
    raise exception 'FAMILY_LINK_CAP: a family link takes 1 to % people', private.family_link_max_uses()
      using errcode = '22023';
  end if;

  update public.invites
  set max_uses = p_max_uses
  where tree_id = p_tree and max_uses is not null;
  if not found then
    raise exception 'NO_FAMILY_LINK: this tree has no family link' using errcode = 'P0002';
  end if;
end;
$$;

-- Who joined the tree through its family link, newest first, for its Roots:
-- through this link or an earlier one (`invite_id`), and their account type
-- there now (null once they've left or been removed).
create or replace function public.family_link_joins(p_tree uuid)
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  invite_id uuid,
  role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.user_id, p.display_name, j.joined_at, j.invite_id, m.role
  from private.family_link_joins j
  join public.profiles p on p.auth_user_id = j.user_id
  left join public.tree_members m on m.tree_id = j.tree_id and m.user_id = j.user_id
  where j.tree_id = p_tree
    and private.is_root_of(p_tree)
  order by j.joined_at desc
  limit 200;
$$;

revoke all on function public.rotate_family_link(uuid, integer) from anon, public;
revoke all on function public.set_family_link_cap(uuid, integer) from anon, public;
revoke all on function public.family_link_joins(uuid) from anon, public;
grant execute on function public.rotate_family_link(uuid, integer) to authenticated, service_role;
grant execute on function public.set_family_link_cap(uuid, integer) to authenticated, service_role;
grant execute on function public.family_link_joins(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Redeeming it
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_verified',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placement_accepted', 'placement_declined',
    'tree_request_approved', 'placed_on_join', 'joined_by_link'
  )
);

-- A full family link isn't shown as an invite any more than a used one is.
create or replace function public.invite_preview(p_token text)
returns table (
  valid boolean,
  inviter_name text,
  tree_name text,
  claim_person_name text,
  joins_as text,
  founds_tree boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    true as valid,
    coalesce(p.display_name, 'A family member') as inviter_name,
    t.name as tree_name,
    case
      when pe.id is null then null
      else btrim(
        coalesce(nullif(btrim(pe.preferred_name), ''), coalesce(pe.first_name, ''))
        || ' ' || pe.last_name
      )
    end as claim_person_name,
    i.joins_as,
    i.founds_tree
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  where i.token = p_token
    and i.status = 'active'
    and i.archived_at is null
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.use_count < i.max_uses);
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
                   when v_family_link then v_via_link
                   when v_root = v_invite.created_by then ' accepted your invite to ' || v_tree.name
                   else ' joined ' || v_tree.name || coalesce(' with an invite from ' || v_inviter, ' with an invite')
                 end
              || ', bringing their own entry from another tree. You can take it off this tree from the admin page.',
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

-- Unchanged: whoever is signed in may call it; it works out who they are.
revoke all on function public.redeem_invite(text, text) from anon, public;
grant execute on function public.redeem_invite(text, text) to authenticated, service_role;
