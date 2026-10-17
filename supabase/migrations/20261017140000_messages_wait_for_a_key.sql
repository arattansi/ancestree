-- Step 182 — Messages wait for a relative who has no key yet
--
-- Aalim (2026-10-17): "is it possible for the device to hold the message,
-- encrypted, and send once the user sets up their messaging". A member's
-- messaging key is made the first time they visit since messages began
-- (Step 174.6), so until then nothing could be sealed to them and the
-- composer was hidden. Now a member can write to them anyway.
--
-- Nothing here reads a message: the database still holds only ciphertext.
--
-- Waiting. A message to a member with no key at all is encrypted as any
-- other and sealed only to the sender (`send_message` leaves out members
-- with no key, and only them). It's stored like any message, so it shows on
-- all the sender's devices and survives a lost one; to the sender it's
-- marked waiting (`thread_messages.waiting`, `my_conversations.waiting`).
--
-- Delivery. Only the sender's devices can open the message's key, so once
-- the other member has a key, the sender's next device online seals the
-- same key to it and adds it with `deliver_messages` (their own messages,
-- to the other member at their current key, never once either has blocked
-- the other or they share no tree). The signature already commits to the
-- message's key, so nothing is signed again. `waiting_messages` lists what
-- a sender has waiting in a conversation, with their own sealed key.
-- Publishing a key tells each sender with something waiting for its owner
-- (`key` on their inbox), so a device that's online delivers at once.
--
-- Arriving. A member sees a message once it's sealed to them: an
-- undelivered one isn't in their thread or counted unread, and a late one
-- arrives when it's sealed (`message_keys.sealed_at`), which unread counts,
-- the list's last message, Realtime (`sealed_at` on the inbox's `message`)
-- and the newsletter's Unread Messages (Step 180) go by. A member is told
-- how many are on their way to them (`my_conversations.incoming_waiting`),
-- counting only ones that can still be delivered.
--
-- Re-created: `send_message` and `my_conversations` from
-- `20261017110000`, `thread_messages` and `private.message_key_to_inbox`
-- from `20261016160000`, `newsletter_unread_messages` from
-- `20261017120000` (live bodies md5-checked against those files first).

-- ---------------------------------------------------------------------------
-- 1. When a message's key reached each member
-- ---------------------------------------------------------------------------

-- The same moment as the message for everyone it was sealed to when sent
-- (one transaction); later for a member it waited for.
alter table public.message_keys
  add column sealed_at timestamptz not null default now();

update public.message_keys mk
   set sealed_at = m.created_at
  from public.messages m
 where m.id = mk.message_id;

-- ---------------------------------------------------------------------------
-- 2. Sending: a member with no key yet is left out, and waited for
-- ---------------------------------------------------------------------------

create or replace function public.send_message(
  p_conversation uuid,
  p_id uuid,
  p_ciphertext text,
  p_nonce text,
  p_signature text,
  p_sender_key_version integer,
  p_keys jsonb
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_kind text;
  v_at timestamptz;
  v_members integer;
  v_matched integer;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;

  select c.kind into v_kind
  from public.conversations c
  join public.conversation_members cm
    on cm.conversation_id = c.id and cm.user_id = v_me
  where c.id = p_conversation;
  if v_kind is null then
    raise exception 'NO_CONVERSATION' using errcode = '42501';
  end if;

  -- Not once either of you has blocked the other (Step 177.3).
  if v_kind = 'direct' and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id <> v_me
      and private.blocked_between(v_me, cm.user_id)
  ) then
    raise exception 'BLOCKED' using errcode = '42501';
  end if;

  -- Only while the two of you are on a tree together.
  if v_kind = 'direct' and not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id <> v_me
      and private.share_a_tree(v_me, cm.user_id)
  ) then
    raise exception 'NO_SHARED_TREE'
      using errcode = '42501',
            hint = 'You can message people on a tree you''re on.';
  end if;

  if (
    select count(*) from public.messages m
    where m.sender_id = v_me and m.created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'SLOW_DOWN' using errcode = '54000';
  end if;

  -- The sender has a key, and the device sealed to each member's current
  -- version who has one, its own included. A member with none yet (they
  -- haven't visited since messages began) is left out: the message waits
  -- for them, and their copy is added once they have a key (Step 182,
  -- `deliver_messages`).
  if not exists (select 1 from public.messaging_keys k where k.user_id = v_me) then
    raise exception 'NO_KEY' using errcode = '22023';
  end if;
  if p_sender_key_version is distinct from (
    select max(k.version) from public.messaging_keys k where k.user_id = v_me
  ) then
    raise exception 'KEYS_CHANGED' using errcode = '40001';
  end if;
  if jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'KEYS_CHANGED' using errcode = '40001';
  end if;
  select count(*) into v_members
  from public.conversation_members cm
  where cm.conversation_id = p_conversation
    and exists (select 1 from public.messaging_keys k where k.user_id = cm.user_id);
  select count(distinct cm.user_id) into v_matched
  from jsonb_array_elements(p_keys) e
  join public.conversation_members cm
    on cm.conversation_id = p_conversation
   and cm.user_id::text = e ->> 'user_id'
  where (e ->> 'key_version')::integer = (
    select max(k.version) from public.messaging_keys k where k.user_id = cm.user_id
  );
  if jsonb_array_length(p_keys) <> v_members or v_matched <> v_members then
    raise exception 'KEYS_CHANGED' using errcode = '40001';
  end if;

  begin
    insert into public.messages (
      id, conversation_id, sender_id, ciphertext, nonce, signature, sender_key_version
    )
    values (
      p_id, p_conversation, v_me,
      private.unb64(p_ciphertext), private.unb64(p_nonce), private.unb64(p_signature),
      p_sender_key_version
    )
    returning messages.created_at into v_at;

    insert into public.message_keys (message_id, user_id, key_version, sealed_key)
    select p_id, (e ->> 'user_id')::uuid, (e ->> 'key_version')::integer,
           private.unb64(e ->> 'sealed_key')
    from jsonb_array_elements(p_keys) e;
  exception
    when unique_violation then
      raise exception 'DUPLICATE' using errcode = '23505';
    when check_violation or not_null_violation then
      raise exception 'BAD_MESSAGE' using errcode = '22023';
  end;

  update public.conversations c
     set last_message_at = greatest(coalesce(c.last_message_at, v_at), v_at)
   where c.id = p_conversation;

  -- What you've written you've read.
  update public.conversation_members cm
     set last_read_at = greatest(coalesce(cm.last_read_at, v_at), v_at)
   where cm.conversation_id = p_conversation and cm.user_id = v_me;

  return query select p_id, v_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reading: only what's been sealed to you, arriving when it was
-- ---------------------------------------------------------------------------

drop function public.thread_messages(uuid, timestamptz, integer);

-- A page of a thread, newest first, before `p_before` when given: the
-- messages sealed to the caller, each with their sealed key and when it
-- reached them; their own still waiting for the other member say so.
create function public.thread_messages(
  p_conversation uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  sender_id uuid,
  created_at timestamptz,
  ciphertext text,
  nonce text,
  signature text,
  sender_key_version integer,
  key_version integer,
  sealed_key text,
  sealed_at timestamptz,
  waiting boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.sender_id, m.created_at,
         private.b64(m.ciphertext), private.b64(m.nonce), private.b64(m.signature),
         m.sender_key_version, mk.key_version, private.b64(mk.sealed_key), mk.sealed_at,
         m.sender_id = (select auth.uid()) and exists (
           select 1 from public.conversation_members cm
           where cm.conversation_id = m.conversation_id
             and cm.user_id <> m.sender_id
             and not exists (
               select 1 from public.message_keys k
               where k.message_id = m.id and k.user_id = cm.user_id
             )
         )
  from public.messages m
  join public.message_keys mk
    on mk.message_id = m.id and mk.user_id = (select auth.uid())
  where m.conversation_id = p_conversation
    and private.in_conversation(p_conversation)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.thread_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.thread_messages(uuid, timestamptz, integer) to authenticated, service_role;

drop function public.my_conversations();

-- `last_at` is when the last message reached the caller (its writing time
-- is `last_created_at`); `waiting`, how many of theirs wait for the other
-- member; `incoming_waiting`, how many of the other member's are on their
-- way to the caller and can still come.
create function public.my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  other_user_id uuid,
  other_name text,
  other_person_id uuid,
  other_photo_path text,
  other_photo_crop jsonb,
  other_key_version integer,
  last_id uuid,
  last_sender_id uuid,
  last_at timestamptz,
  last_ciphertext text,
  last_nonce text,
  last_signature text,
  last_sender_key_version integer,
  last_key_version integer,
  last_sealed_key text,
  last_read_at timestamptz,
  unread integer,
  can_send boolean,
  muted_until timestamptz,
  blocked text,
  last_created_at timestamptz,
  waiting integer,
  incoming_waiting integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.kind,
    o.user_id,
    coalesce(nullif(btrim(op.display_name), ''), 'Someone'),
    case when seen.ok then pe.id end,
    case when seen.ok then pe.photo_path end,
    case when seen.ok then pe.photo_crop end,
    (select max(k.version) from public.messaging_keys k where k.user_id = o.user_id),
    lm.id,
    lm.sender_id,
    lm.sealed_at,
    private.b64(lm.ciphertext),
    private.b64(lm.nonce),
    private.b64(lm.signature),
    lm.sender_key_version,
    lm.key_version,
    private.b64(lm.sealed_key),
    mine.last_read_at,
    (
      select count(*)::integer from public.messages m
      join public.message_keys k on k.message_id = m.id and k.user_id = mine.user_id
      where m.conversation_id = c.id
        and m.sender_id <> mine.user_id
        and k.sealed_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)
    ),
    send.ok,
    case when mine.muted_until > now() then mine.muted_until end,
    case
      when exists (
        select 1 from public.message_blocks b
        where b.blocker_id = mine.user_id and b.blocked_id = o.user_id
      ) then 'by_you'
      when exists (
        select 1 from public.message_blocks b
        where b.blocker_id = o.user_id and b.blocked_id = mine.user_id
      ) then 'by_them'
    end,
    lm.created_at,
    w.waiting,
    case when send.ok then w.incoming else 0 end
  from public.conversation_members mine
  join public.conversations c on c.id = mine.conversation_id
  left join lateral (
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = c.id and cm.user_id <> mine.user_id
    limit 1
  ) o on true
  left join public.profiles op on op.auth_user_id = o.user_id
  left join public.people pe on pe.id = op.self_person_id
  left join lateral (
    select pe.id is not null and private.can_read_person(pe.id) as ok
  ) seen on true
  left join lateral (
    select o.user_id is not null
      and private.share_a_tree(mine.user_id, o.user_id)
      and not private.blocked_between(mine.user_id, o.user_id) as ok
  ) send on true
  -- The last message sealed to the caller, by when it reached them.
  left join lateral (
    select m.id, m.sender_id, m.created_at, m.ciphertext, m.nonce, m.signature,
           m.sender_key_version, k.key_version, k.sealed_key, k.sealed_at
    from public.messages m
    join public.message_keys k on k.message_id = m.id and k.user_id = mine.user_id
    where m.conversation_id = c.id
    order by k.sealed_at desc, m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select
      count(*) filter (
        where m.sender_id = mine.user_id
          and o.user_id is not null
          and not exists (
            select 1 from public.message_keys k
            where k.message_id = m.id and k.user_id = o.user_id
          )
      )::integer as waiting,
      count(*) filter (
        where m.sender_id <> mine.user_id
          and not exists (
            select 1 from public.message_keys k
            where k.message_id = m.id and k.user_id = mine.user_id
          )
      )::integer as incoming
    from public.messages m
    where m.conversation_id = c.id
  ) w on true
  where mine.user_id = (select auth.uid())
    -- One opened and never written in stays out of both lists, and so does
    -- one with nothing sealed to the caller that can still come.
    and c.last_message_at is not null
    and (lm.id is not null or (send.ok and w.incoming > 0))
  order by coalesce(lm.sealed_at, c.last_message_at) desc;
$$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated, service_role;

-- What each reader hasn't read, by who wrote it, counting what's reached
-- them since they last read, by when it did.
create or replace function public.newsletter_unread_messages(p_users uuid[])
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
           max(k.sealed_at) as newest_at
    from public.conversation_members mine
    join public.messages m
      on m.conversation_id = mine.conversation_id
     and m.sender_id <> mine.user_id
    join public.message_keys k
      on k.message_id = m.id
     and k.user_id = mine.user_id
     and k.sealed_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)
    where mine.user_id = any (p_users)
      and (mine.muted_until is null or mine.muted_until <= now())
    group by mine.user_id, m.sender_id
  ) w
  where not private.blocked_between(w.user_id, w.sender_id)
  order by w.user_id, w.newest_at desc, w.sender_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Delivering what waited
-- ---------------------------------------------------------------------------

-- The caller's own messages in a conversation still waiting for the other
-- member, oldest first, with the caller's sealed key, for their device to
-- open and seal again to the other member's key.
create function public.waiting_messages(p_conversation uuid)
returns table (
  id uuid,
  created_at timestamptz,
  ciphertext text,
  nonce text,
  signature text,
  sender_key_version integer,
  key_version integer,
  sealed_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.created_at,
         private.b64(m.ciphertext), private.b64(m.nonce), private.b64(m.signature),
         m.sender_key_version, mk.key_version, private.b64(mk.sealed_key)
  from public.messages m
  join public.message_keys mk
    on mk.message_id = m.id and mk.user_id = (select auth.uid())
  where m.conversation_id = p_conversation
    and m.sender_id = (select auth.uid())
    and private.in_conversation(p_conversation)
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id <> m.sender_id
        and not exists (
          select 1 from public.message_keys k
          where k.message_id = m.id and k.user_id = cm.user_id
        )
    )
  order by m.created_at, m.id
  limit 100;
$$;

revoke all on function public.waiting_messages(uuid) from public, anon;
grant execute on function public.waiting_messages(uuid) to authenticated, service_role;

-- `p_keys`: `{message_id, user_id, key_version, sealed_key}` for up to 100
-- of the caller's own messages here, each for the other member at their
-- current key. Never once either has blocked the other, nor while they
-- share no tree. One already delivered (another of the sender's devices
-- got there first) is skipped. How many were delivered; the inbox trigger
-- sends each to the other member, and the sender's other devices hear
-- `delivered`.
create function public.deliver_messages(p_conversation uuid, p_keys jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_kind text;
  v_other uuid;
  v_version integer;
  v_count integer;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;

  select c.kind into v_kind
  from public.conversations c
  join public.conversation_members cm
    on cm.conversation_id = c.id and cm.user_id = v_me
  where c.id = p_conversation;
  if v_kind is distinct from 'direct' then
    raise exception 'NO_CONVERSATION' using errcode = '42501';
  end if;
  select cm.user_id into v_other
  from public.conversation_members cm
  where cm.conversation_id = p_conversation and cm.user_id <> v_me;
  if v_other is null then
    raise exception 'NO_CONVERSATION' using errcode = '42501';
  end if;

  if private.blocked_between(v_me, v_other) then
    raise exception 'BLOCKED' using errcode = '42501';
  end if;
  if not private.share_a_tree(v_me, v_other) then
    raise exception 'NO_SHARED_TREE'
      using errcode = '42501',
            hint = 'You can message people on a tree you''re on.';
  end if;

  select max(k.version) into v_version
  from public.messaging_keys k where k.user_id = v_other;
  if v_version is null then
    raise exception 'NO_KEY' using errcode = '22023';
  end if;

  if jsonb_typeof(p_keys) is distinct from 'array'
     or jsonb_array_length(p_keys) not between 1 and 100 then
    raise exception 'BAD_MESSAGE' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_keys) e
    left join public.messages m on m.id::text = lower(e ->> 'message_id')
    where m.id is null
       or m.conversation_id <> p_conversation
       or m.sender_id <> v_me
       or lower(e ->> 'user_id') is distinct from v_other::text
  ) then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_keys) e
    where e ->> 'key_version' is distinct from v_version::text
  ) then
    raise exception 'KEYS_CHANGED' using errcode = '40001';
  end if;

  begin
    insert into public.message_keys (message_id, user_id, key_version, sealed_key)
    select distinct on (m.id) m.id, v_other, v_version, private.unb64(e ->> 'sealed_key')
    from jsonb_array_elements(p_keys) e
    join public.messages m on m.id::text = lower(e ->> 'message_id')
    on conflict (message_id, user_id) do nothing;
    get diagnostics v_count = row_count;
  exception when check_violation or not_null_violation then
    raise exception 'BAD_MESSAGE' using errcode = '22023';
  end;

  if v_count > 0 then
    perform realtime.send(
      jsonb_build_object('conversation_id', p_conversation, 'user_id', v_other),
      'delivered',
      'inbox:' || v_me::text,
      true
    );
  end if;
  return v_count;
end;
$$;

revoke all on function public.deliver_messages(uuid, jsonb) from public, anon;
grant execute on function public.deliver_messages(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------

-- The inbox's `message` says when it reached them.
create or replace function private.message_key_to_inbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = new.message_id;
  perform realtime.send(
    jsonb_build_object(
      'id', m.id,
      'conversation_id', m.conversation_id,
      'sender_id', m.sender_id,
      'created_at', m.created_at,
      'ciphertext', private.b64(m.ciphertext),
      'nonce', private.b64(m.nonce),
      'signature', private.b64(m.signature),
      'sender_key_version', m.sender_key_version,
      'key_version', new.key_version,
      'sealed_key', private.b64(new.sealed_key),
      'sealed_at', new.sealed_at
    ),
    'message',
    'inbox:' || new.user_id::text,
    true
  );
  return null;
end;
$$;

-- A member's first key (or a new one): each sender with something waiting
-- for them that can still go hears `key`, so a device of theirs that's
-- online delivers it at once.
create function private.messaging_key_to_waiting_senders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender uuid;
begin
  for v_sender in
    select distinct m.sender_id
    from public.conversation_members mine
    join public.messages m
      on m.conversation_id = mine.conversation_id
     and m.sender_id <> new.user_id
    where mine.user_id = new.user_id
      and not exists (
        select 1 from public.message_keys k
        where k.message_id = m.id and k.user_id = new.user_id
      )
      and not private.blocked_between(new.user_id, m.sender_id)
      and private.share_a_tree(new.user_id, m.sender_id)
  loop
    perform realtime.send(
      jsonb_build_object('user_id', new.user_id, 'version', new.version),
      'key',
      'inbox:' || v_sender::text,
      true
    );
  end loop;
  return null;
end;
$$;

revoke all on function private.messaging_key_to_waiting_senders() from public, anon, authenticated;

create trigger messaging_keys_tell_waiting_senders
  after insert on public.messaging_keys
  for each row execute function private.messaging_key_to_waiting_senders();
