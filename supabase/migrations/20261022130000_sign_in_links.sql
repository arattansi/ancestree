-- Step 202.3: sign-in links from a Root.
--
-- A member with no email (Step 202.1) who is signed out — a new phone, or
-- WeChat cleared its storage — asks their family. A Root of a tree they're
-- on makes a sign-in link and sends it in WeChat; opening it shows one
-- button, and pressing it signs them in. Each link works once, for 24
-- hours, and only for an account with no email: a member with an address
-- signs in with a code. The member and every Root of the tree are told.
--
-- 1. `signed_in_by_link` added to `notifications_type_check` (the live
--    list, which has Step 177's message notices besides `20261016120000`'s).
-- 2. `private.sign_in_links`: only the token's hash is kept, and nothing
--    reads the table but the functions below.
-- 3. `make_sign_in_link` (a Root), `sign_in_link_preview` and
--    `spend_sign_in_link` (the service role, for /sign-in/<token>), and
--    `no_email_members` (a Root, for the console's list).

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
    'invite_renewed', 'member_joined', 'message_reported',
    'message_report_resolved', 'signed_in_by_link'
  ));

-- ---------------------------------------------------------------------------
-- 2. The links
-- ---------------------------------------------------------------------------
create table private.sign_in_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  tree_id uuid not null references public.trees (id) on delete cascade,
  made_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz
);

create index sign_in_links_user on private.sign_in_links (user_id, expires_at);

-- At most this many live links a member at once.
create or replace function private.sign_in_links_per_member()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

-- ---------------------------------------------------------------------------
-- 3. Making, reading and spending one
-- ---------------------------------------------------------------------------

-- A Root makes a sign-in link for a member of their tree who has no email.
-- The token comes back once; only its hash is kept.
create or replace function public.make_sign_in_link(p_tree uuid, p_user uuid)
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
    raise exception 'Only a Root can make a sign-in link' using errcode = '42501';
  end if;
  if p_user = v_uid then
    raise exception 'NOT_FOR_YOURSELF: a sign-in link is for someone else'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tree_members m
    where m.tree_id = p_tree and m.user_id = p_user
  ) then
    raise exception 'NOT_ON_TREE: they aren''t on this tree' using errcode = '22023';
  end if;
  -- Only for an account with no email, and not one that's suspended.
  if not exists (
    select 1 from auth.users u
    where u.id = p_user
      and private.is_no_email(u.email)
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'HAS_EMAIL: they sign in with their email' using errcode = '22023';
  end if;

  -- Counted under a lock on the member's links, so two Roots at once can't
  -- pass the limit.
  perform pg_advisory_xact_lock(hashtext('sign_in_links:' || p_user::text));
  if (select count(*) from private.sign_in_links l
      where l.user_id = p_user and l.used_at is null and l.expires_at > now())
     >= private.sign_in_links_per_member() then
    raise exception 'SIGN_IN_LINK_LIMIT: at most % live sign-in links a member',
      private.sign_in_links_per_member()
      using errcode = '23514';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sign_in_links (token_hash, user_id, tree_id, made_by)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_user, p_tree, v_uid);
  return v_token;
end;
$$;

revoke all on function public.make_sign_in_link(uuid, uuid) from anon, public;
grant execute on function public.make_sign_in_link(uuid, uuid) to authenticated;

-- What /sign-in/<token> shows before anything is spent: whose link it is,
-- and whether it still works. The page is a GET that chat apps open for
-- their previews, so it never spends the link.
create or replace function public.sign_in_link_preview(p_token text)
returns table (state text, member_name text, tree_name text, user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when l.used_at is not null then 'used'
      when l.expires_at <= now() then 'expired'
      else 'live'
    end,
    coalesce(private.member_label(l.user_id), 'a member'),
    t.name,
    l.user_id
  from private.sign_in_links l
  join public.trees t on t.id = l.tree_id
  where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

revoke all on function public.sign_in_link_preview(text) from anon, authenticated, public;
grant execute on function public.sign_in_link_preview(text) to service_role;

-- The button on /sign-in/<token>: spends the link and says whose address to
-- sign in as, which the app then does with the service role. Refused unless
-- the link is live, they're still on its tree, still have no email and
-- aren't suspended. The member and every Root of the tree are told.
create or replace function public.spend_sign_in_link(p_token text)
returns table (user_id uuid, email text, tree_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_link private.sign_in_links;
  v_email text;
  v_member text;
  v_maker text;
  v_tree text;
  v_root uuid;
begin
  select * into v_link
  from private.sign_in_links l
  where l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_link.used_at is not null or v_link.expires_at <= now() then
    raise exception 'SIGN_IN_LINK_INVALID: used, expired or never made'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tree_members m
    where m.tree_id = v_link.tree_id and m.user_id = v_link.user_id
  ) then
    raise exception 'SIGN_IN_LINK_INVALID: no longer on the tree' using errcode = '22023';
  end if;
  select u.email into v_email
  from auth.users u
  where u.id = v_link.user_id
    and private.is_no_email(u.email)
    and (u.banned_until is null or u.banned_until <= now());
  if v_email is null then
    raise exception 'SIGN_IN_LINK_INVALID: has an email or is suspended'
      using errcode = '22023';
  end if;

  update private.sign_in_links set used_at = now() where id = v_link.id;

  v_member := coalesce(private.member_label(v_link.user_id), 'A member');
  v_maker := coalesce(private.member_label(v_link.made_by), 'a Root');
  select t.name into v_tree from public.trees t where t.id = v_link.tree_id;

  perform private.notify(
    v_link.user_id, v_link.made_by, 'signed_in_by_link', null, null,
    'You signed in with a sign-in link from ' || v_maker || '.',
    v_link.tree_id
  );
  for v_root in
    select m.user_id from public.tree_members m
    where m.tree_id = v_link.tree_id and m.role = 'admin'
  loop
    perform private.notify(
      v_root, v_link.user_id, 'signed_in_by_link', null, null,
      v_member || ' signed in to ' || v_tree || ' with '
        || case when v_root = v_link.made_by then 'the sign-in link you sent'
                else 'a sign-in link from ' || v_maker end
        || '.',
      v_link.tree_id
    );
  end loop;

  return query select v_link.user_id, v_email, v_link.tree_id;
end;
$$;

revoke all on function public.spend_sign_in_link(text) from anon, authenticated, public;
grant execute on function public.spend_sign_in_link(text) to service_role;

-- Which members of a tree have no email, for its Root console: those are
-- the ones a sign-in link is offered beside.
create or replace function public.no_email_members(p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.tree_members m
  join auth.users u on u.id = m.user_id
  where m.tree_id = p_tree
    and private.is_root_of(p_tree)
    and private.is_no_email(u.email);
$$;

revoke all on function public.no_email_members(uuid) from anon, public;
grant execute on function public.no_email_members(uuid) to authenticated;
