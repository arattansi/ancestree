-- Step 204 — Push notifications on the phone: new messages, new stories
--
-- Aalim (2026-10-23): "there should be [push notifications] for messages
-- and new stories added". Until now the phone heard of either only while
-- it was open (the menu bar's counts) or from the weekly newsletter.
--
-- The phone. Signed in, it asks the member once whether it may notify
-- them, then gives its Expo push token to `register_push_token`: a phone
-- is one member's at a time, so a token another account had moves to
-- whoever signs in on it now. Signing out gives it back
-- (`forget_push_token`). `push_tokens` is the service role's only.
--
-- What's sent goes out from the web, through Expo's push service, as the
-- waiting-message emails do (Step 182): after a send, the sender's device
-- asks the web to tell the others, which asks a `claim_*` function as the
-- sender. Each says whom to tell, once, and records it, so asking again
-- tells nobody twice.
--
--   * A message (`claim_message_push`): the other member of the
--     conversation, unless they muted it, either blocked the other, they
--     no longer share a tree, or the account is suspended. Who wrote,
--     never what: the words are end-to-end encrypted. Asked within ten
--     minutes of the send, by its sender.
--   * A story (`claim_story_push`): everyone who can read it now because
--     someone it's about said yes in the last day, as
--     `private.can_read_story` decides (a member of a tree where that
--     person is fully placed), except its teller and whoever asked. Asked
--     by its teller, or by someone who said one of those yeses. Each
--     reader is told of a story once, however many say yes after.
--
-- The switches. `push_settings` holds each member's two (on unless they
-- turn one off), read by the member and set through `set_push_settings`.

-- ---------------------------------------------------------------------------
-- 1. Phones, and each member's switches
-- ---------------------------------------------------------------------------

create table public.push_tokens (
  -- Expo's token for the app on one phone.
  token text primary key
    check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$'),
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  -- The last time the phone gave it, each time the app opens signed in.
  seen_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

comment on table public.push_tokens is
  'Step 204: the phones each member is signed in on, by Expo push token, written through register_push_token and forget_push_token. The service role''s only.';

alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from anon, authenticated;

create table public.push_settings (
  user_id uuid primary key references public.profiles (auth_user_id) on delete cascade,
  -- On unless they turn them off. A member with no row has both on.
  messages boolean not null default true,
  stories boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.push_settings is
  'Step 204: whether a member''s phones are told of new messages and new stories. Read by the member; set through set_push_settings.';

alter table public.push_settings enable row level security;
revoke all on table public.push_settings from anon, authenticated;
grant select on table public.push_settings to authenticated;

create policy push_settings_select on public.push_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Whom each message and story was pushed to, so nobody is told twice.
create table public.message_pushes (
  message_id uuid primary key references public.messages (id) on delete cascade,
  pushed_at timestamptz not null default now()
);

create table public.story_pushes (
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  pushed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index story_pushes_user_idx on public.story_pushes (user_id);

comment on table public.message_pushes is
  'Step 204: each message its recipients'' phones were told of. The service role''s only.';
comment on table public.story_pushes is
  'Step 204: each reader''s phones told of a story, once. The service role''s only.';

alter table public.message_pushes enable row level security;
alter table public.story_pushes enable row level security;
revoke all on table public.message_pushes from anon, authenticated;
revoke all on table public.story_pushes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The phone's token, and the switches
-- ---------------------------------------------------------------------------

-- This phone is the caller's now. A member keeps ten phones at most; the
-- one longest unseen goes first.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'BAD_PLATFORM' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$' then
    raise exception 'BAD_TOKEN' using errcode = '22023';
  end if;

  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_me, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        seen_at = now();

  delete from public.push_tokens t
  where t.user_id = v_me
    and t.token in (
      select o.token from public.push_tokens o
      where o.user_id = v_me
      order by o.seen_at desc
      offset 10
    );
end;
$$;

-- Signing out on this phone: it's nobody's until someone signs in again.
create function public.forget_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens t
  where t.token = p_token and t.user_id = (select auth.uid());
$$;

create function public.set_push_settings(p_messages boolean, p_stories boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  insert into public.push_settings (user_id, messages, stories)
  values (v_me, coalesce(p_messages, true), coalesce(p_stories, true))
  on conflict (user_id) do update
    set messages = excluded.messages,
        stories = excluded.stories,
        updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Whom to tell, asked as the sender
-- ---------------------------------------------------------------------------

-- Someone the phone may tell of something: a phone to tell, the switch for
-- it on, and not suspended.
create function private.push_reachable(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.push_tokens t where t.user_id = p_user)
    and not exists (
      select 1 from public.push_settings s
      where s.user_id = p_user
        and not (case p_kind when 'messages' then s.messages else s.stories end)
    )
    and not exists (
      select 1 from auth.users u
      where u.id = p_user and u.banned_until > now()
    );
$$;

-- The others in the conversation of a message the caller just sent, each
-- with who wrote it: see the head of this file for whom. Once a message.
create function public.claim_message_push(p_message uuid)
returns table (user_id uuid, conversation_id uuid, sender_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation uuid;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  select m.conversation_id into v_conversation
  from public.messages m
  where m.id = p_message
    and m.sender_id = v_me
    and m.created_at > now() - interval '10 minutes';
  if v_conversation is null then
    return;
  end if;

  insert into public.message_pushes (message_id)
  values (p_message)
  on conflict (message_id) do nothing;
  if not found then
    return;
  end if;

  return query
  select cm.user_id, v_conversation,
    coalesce(private.member_label(v_me), 'A relative')
  from public.conversation_members cm
  where cm.conversation_id = v_conversation
    and cm.user_id <> v_me
    and (cm.muted_until is null or cm.muted_until <= now())
    and not private.blocked_between(v_me, cm.user_id)
    and private.share_a_tree(v_me, cm.user_id)
    and private.push_reachable(cm.user_id, 'messages');
end;
$$;

-- Everyone a story's newest yeses let read it, not told of it yet, each
-- with whom they read it through and the words to tell them: see the head
-- of this file for whom.
create function public.claim_story_push(p_story uuid)
returns table (user_id uuid, person_id uuid, title text, about text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_teller uuid;
  v_title text;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  select s.created_by, s.title into v_teller, v_title
  from public.stories s
  where s.id = p_story
    and (
      s.created_by = v_me
      or exists (
        select 1 from public.story_subjects a
        where a.story_id = s.id
          and a.status = 'approved'
          and a.decided_by = v_me
          and a.decided_at > now() - interval '1 day'
      )
    );
  if not found then
    return;
  end if;

  -- As `private.can_read_story`, for everyone at once: a member of a tree
  -- where someone it's about who said yes is fully placed.
  return query
  with readers as (
    select distinct on (m.user_id) m.user_id, a.person_id
    from public.story_subjects a
    join public.tree_placements pl
      on pl.person_id = a.person_id and pl.status = 'active' and pl.detail = 'full'
    join public.tree_members m on m.tree_id = pl.tree_id
    where a.story_id = p_story
      and a.status = 'approved'
      and coalesce(a.decided_at, a.created_at) > now() - interval '1 day'
      and m.user_id <> v_me
      and m.user_id is distinct from v_teller
      and private.push_reachable(m.user_id, 'stories')
    order by m.user_id, a.person_id
  ),
  told as (
    insert into public.story_pushes (story_id, user_id)
    select p_story, r.user_id from readers r
    on conflict do nothing
    returning story_pushes.user_id
  )
  select r.user_id, r.person_id, v_title, private.story_about_label(p_story)
  from readers r
  join told t on t.user_id = r.user_id;
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
revoke all on function public.forget_push_token(text) from public, anon;
revoke all on function public.set_push_settings(boolean, boolean) from public, anon;
revoke all on function private.push_reachable(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_message_push(uuid) from public, anon;
revoke all on function public.claim_story_push(uuid) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.forget_push_token(text) to authenticated;
grant execute on function public.set_push_settings(boolean, boolean) to authenticated;
grant execute on function private.push_reachable(uuid, text) to service_role;
grant execute on function public.claim_message_push(uuid) to authenticated;
grant execute on function public.claim_story_push(uuid) to authenticated;
