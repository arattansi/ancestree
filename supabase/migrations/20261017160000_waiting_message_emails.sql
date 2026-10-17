-- Step 182 — Telling a relative that a message waits for them
--
-- Aalim (2026-10-17), asked how a member who has never set up messages
-- should hear that someone wrote to them: "Both: an email right away
-- (never the words, once per sender until they set up, with its own off
-- switch) and a line in the weekly newsletter's Unread Messages." Phase
-- 0's "no email when a message waits" (Step 177.2) still stands for
-- everyone else: this is only for a member with no messaging key, who
-- can't see the messenger until they visit, and visiting is what makes
-- their key.
--
-- The email. After a message that waits (sealed to the sender alone,
-- `20261017140000`), the sender's device asks the app to tell them
-- (`/api/messages/waiting`, `/api/mobile/messages/waiting`), which asks
-- `claim_waiting_notice` as the sender: someone with no key, a message of
-- the sender's waiting for them, not blocked either way, still on a tree
-- together, their emails on, not suspended, and not told of this sender
-- already. At most three such emails a day to anyone, twenty a day from
-- anyone. `message_waiting_notices` records whom each was about; it's
-- cleared once they publish a key, the stretch over. The app then reads
-- their address with `waiting_notice_email` (service role) and sends:
-- who wrote, never what.
--
-- The off switch. `message_waiting_emails` holds each member's switch
-- (on unless they turn it off) and the token in each email's unsubscribe
-- link, which works signed out (`/message-emails/<token>`), as the
-- newsletter's (Step 95) and the getting started emails' (Step 151) do.
--
-- The newsletter. `newsletter_waiting_messages` (service role, as
-- `newsletter_unread_messages`): for each member with no key, who has
-- messages waiting for them, how many, and when the newest was written;
-- not someone blocked either way, nor anyone they no longer share a tree
-- with.
--
-- Re-created: `delete_message` from `20261017150000`, holding the message
-- before it reads who held it (the review's last point: a delivery
-- landing in between went untold).

-- ---------------------------------------------------------------------------
-- 1. The switch, and whom each was told of
-- ---------------------------------------------------------------------------

create table public.message_waiting_emails (
  user_id uuid primary key
    references public.profiles (auth_user_id) on delete cascade,
  -- On unless they turn it off. A member with no row yet is on.
  subscribed boolean not null default true,
  -- In each email's unsubscribe link, which works signed out.
  token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

comment on table public.message_waiting_emails is
  'Step 182: whether a member is emailed when a message waits for them before they''ve set up messages, and the token in those emails'' unsubscribe link. The service role''s only.';

alter table public.message_waiting_emails enable row level security;
revoke all on table public.message_waiting_emails from anon, authenticated;

create table public.message_waiting_notices (
  -- Whom the email went to, and whose message it was about.
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  sender_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  told_at timestamptz not null default now(),
  primary key (user_id, sender_id)
);

create index message_waiting_notices_sender_told_idx
  on public.message_waiting_notices (sender_id, told_at);

comment on table public.message_waiting_notices is
  'Step 182: one row a member told by email that someone''s message waits for them, until they publish a key. The service role''s only.';

alter table public.message_waiting_notices enable row level security;
revoke all on table public.message_waiting_notices from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Whether to tell them, asked as the sender
-- ---------------------------------------------------------------------------

-- The other member of a direct conversation, to email now, or null: see
-- the head of this file for when. Records it, so the next waiting message
-- from the same sender tells no one.
create function public.claim_waiting_notice(p_conversation uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_other uuid;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  select cm.user_id into v_other
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id and mine.user_id = v_me
  join public.conversation_members cm
    on cm.conversation_id = c.id and cm.user_id <> v_me
  where c.id = p_conversation and c.kind = 'direct';
  if v_other is null then
    return null;
  end if;

  -- Someone with no key yet, with a message of the sender's waiting for
  -- them, whom the sender may still write to.
  if exists (select 1 from public.messaging_keys k where k.user_id = v_other) then
    return null;
  end if;
  if not exists (
    select 1 from public.messages m
    where m.conversation_id = p_conversation
      and m.sender_id = v_me
      and not exists (
        select 1 from public.message_keys k
        where k.message_id = m.id and k.user_id = v_other
      )
  ) then
    return null;
  end if;
  if private.blocked_between(v_me, v_other) or not private.share_a_tree(v_me, v_other) then
    return null;
  end if;

  -- Their switch; and nothing to a suspended account.
  if exists (
    select 1 from public.message_waiting_emails e
    where e.user_id = v_other and not e.subscribed
  ) or exists (
    select 1 from auth.users u
    where u.id = v_other and u.banned_until > now()
  ) then
    return null;
  end if;

  -- At most three a day to anyone, twenty a day from anyone.
  if (
    select count(*) from public.message_waiting_notices n
    where n.user_id = v_other and n.told_at > now() - interval '1 day'
  ) >= 3 or (
    select count(*) from public.message_waiting_notices n
    where n.sender_id = v_me and n.told_at > now() - interval '1 day'
  ) >= 20 then
    return null;
  end if;

  insert into public.message_waiting_notices (user_id, sender_id)
  values (v_other, v_me)
  on conflict do nothing;
  if not found then
    return null;
  end if;
  return v_other;
end;
$$;

revoke all on function public.claim_waiting_notice(uuid) from public, anon;
grant execute on function public.claim_waiting_notice(uuid) to authenticated, service_role;

-- Where the email goes and what it says of the sender (service role): the
-- member's address and unsubscribe token (their switch's row made the
-- first time), and the sender by their own entry's name, else the name
-- they set.
create function public.waiting_notice_email(p_user uuid, p_sender uuid)
returns table (email text, token uuid, sender_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.message_waiting_emails (user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  return query
  select
    u.email::text,
    e.token,
    coalesce(
      nullif(btrim(concat_ws(' ',
        coalesce(nullif(btrim(pe.preferred_name), ''), nullif(btrim(pe.first_name), '')),
        nullif(btrim(pe.last_name), '')
      )), ''),
      nullif(btrim(sp.display_name), ''),
      'A relative'
    )
  from auth.users u
  join public.message_waiting_emails e on e.user_id = u.id
  left join public.profiles sp on sp.auth_user_id = p_sender
  left join public.people pe on pe.id = sp.self_person_id
  where u.id = p_user;
end;
$$;

revoke all on function public.waiting_notice_email(uuid, uuid) from public, anon, authenticated;
grant execute on function public.waiting_notice_email(uuid, uuid) to service_role;

-- A member's first key ends the stretch: whom they were told of is
-- forgotten.
create function private.messaging_key_clears_waiting_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.message_waiting_notices n where n.user_id = new.user_id;
  return null;
end;
$$;

revoke all on function private.messaging_key_clears_waiting_notices() from public, anon, authenticated;

create trigger messaging_keys_clear_waiting_notices
  after insert on public.messaging_keys
  for each row execute function private.messaging_key_clears_waiting_notices();

-- ---------------------------------------------------------------------------
-- 3. The newsletter's line
-- ---------------------------------------------------------------------------

-- For each of `p_users` with no key yet: everyone whose messages wait for
-- them, how many, and when the newest was written. Not a conversation
-- they've muted, nor anyone blocked either way or no longer on a tree
-- with them.
create function public.newsletter_waiting_messages(p_users uuid[])
returns table (
  user_id uuid,
  sender_id uuid,
  unread integer,
  newest_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.user_id, w.sender_id, w.unread, w.newest_at
  from (
    select mine.user_id, m.sender_id, count(*)::integer as unread,
           max(m.created_at) as newest_at
    from public.conversation_members mine
    join public.messages m
      on m.conversation_id = mine.conversation_id
     and m.sender_id <> mine.user_id
    where mine.user_id = any (p_users)
      and not exists (select 1 from public.messaging_keys k where k.user_id = mine.user_id)
      and not exists (
        select 1 from public.message_keys k
        where k.message_id = m.id and k.user_id = mine.user_id
      )
      and (mine.muted_until is null or mine.muted_until <= now())
    group by mine.user_id, m.sender_id
  ) w
  where not private.blocked_between(w.user_id, w.sender_id)
    and private.share_a_tree(w.user_id, w.sender_id)
  order by w.user_id, w.newest_at desc, w.sender_id;
$$;

revoke all on function public.newsletter_waiting_messages(uuid[]) from public, anon, authenticated;
grant execute on function public.newsletter_waiting_messages(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Deleting a message, held first
-- ---------------------------------------------------------------------------

create or replace function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation uuid;
  v_member uuid;
  v_holders uuid[];
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  -- Held first, so a delivery can't add a holder between reading who held
  -- it and deleting it (a delivery adding one waits, then finds it gone).
  perform 1 from public.messages m
   where m.id = p_message and m.sender_id = v_me
   for update;
  -- Who held it, before its keys go with it: only they are told (a member
  -- it still waited for never had it, Step 182).
  select array_agg(k.user_id) into v_holders
  from public.message_keys k where k.message_id = p_message;
  delete from public.messages m
   where m.id = p_message and m.sender_id = v_me
  returning m.conversation_id into v_conversation;
  if v_conversation is null then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;

  update public.conversations c
     set last_message_at = (
       select max(m.created_at) from public.messages m
       where m.conversation_id = v_conversation
     )
   where c.id = v_conversation;

  for v_member in
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = v_conversation
      and cm.user_id = any (coalesce(v_holders, '{}'))
  loop
    perform realtime.send(
      jsonb_build_object('id', p_message, 'conversation_id', v_conversation),
      'deleted',
      'inbox:' || v_member::text,
      true
    );
  end loop;
end;
$$;
