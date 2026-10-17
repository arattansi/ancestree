-- Step 182, after review — Waiting messages, hardened
--
-- An independent review of `20261017140000_messages_wait_for_a_key` and its
-- clients found, besides what the clients fix (a waiting message's sender
-- copy is now bound to whom it waits for, so nothing else can be sealed on),
-- four things for here:
--
-- 1. `send_message` counted members' keys without holding their rows, so a
--    key published at that moment could miss the message: it waited though
--    they had a key, and their `key` event had already gone. It holds the
--    members' rows now (`for key share`, against `publish_messaging_key`'s
--    `for update`), so a key made meanwhile is either sealed to or told of.
-- 2. `deliver_messages` could read a version a reset was replacing; it
--    holds the other member's row the same way.
-- 3. `delete_message` told every member, so someone a message still waited
--    for learned something was written and withdrawn; now only the members
--    who held it are told.
-- 4. `report_message` let a member report a message not sealed to them;
--    now only one that was.
--
-- Re-created: `send_message` and `deliver_messages` from `20261017140000`,
-- `delete_message` from `20261017100000`, `report_message` from
-- `20261017110000` (live bodies md5-checked against those files first).

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

  -- Hold the members' rows, as `publish_messaging_key` does while it adds
  -- a key: one made meanwhile is either seen below (and sealed to, after
  -- `KEYS_CHANGED`) or made after this message, whose sender it then tells.
  perform 1 from public.profiles p
  where p.auth_user_id in (
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = p_conversation
  )
  order by p.auth_user_id
  for key share;

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

create or replace function public.deliver_messages(p_conversation uuid, p_keys jsonb)
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

  -- Their row, as a reset holds it, so the version read is the one sealed to.
  perform 1 from public.profiles p where p.auth_user_id = v_other for key share;
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

create or replace function public.report_message(p_message uuid, p_body text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_message public.messages;
  v_trees uuid[];
  v_id uuid;
  v_root record;
  v_text text;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  select * into v_message from public.messages m where m.id = p_message;
  -- Only one sealed to the reporter: a message still waiting for them
  -- (Step 182) isn't theirs to report.
  if v_message.id is null
     or not private.in_conversation(v_message.conversation_id)
     or not exists (
       select 1 from public.message_keys k
       where k.message_id = v_message.id and k.user_id = v_me
     ) then
    raise exception 'NO_MESSAGE' using errcode = '42501';
  end if;
  if v_message.sender_id = v_me then
    raise exception 'YOUR_OWN' using errcode = '22023';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'EMPTY_REPORT' using errcode = '22023';
  end if;
  if char_length(v_body) > 4000 or char_length(v_reason) > 1000 then
    raise exception 'TOO_LONG' using errcode = '22023';
  end if;
  if (
    select count(*) from public.message_reports r
    where r.reporter_id = v_me and r.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'SLOW_DOWN' using errcode = '54000';
  end if;

  select coalesce(array_agg(a.tree_id order by a.tree_id), '{}') into v_trees
  from public.tree_members a
  join public.tree_members b on b.tree_id = a.tree_id
  where a.user_id = v_me and b.user_id = v_message.sender_id;

  begin
    insert into public.message_reports
      (message_id, conversation_id, reporter_id, sender_id, body, reason, sent_at, tree_ids)
    values
      (v_message.id, v_message.conversation_id, v_me, v_message.sender_id,
       v_body, v_reason, v_message.created_at, v_trees)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'ALREADY_REPORTED' using errcode = '23505';
  end;

  -- Told: each Root of those trees, but not the member reported (nor the
  -- reporter, if they're a Root themselves).
  v_text := coalesce(private.member_label(v_me), 'A relative')
    || ' reported a message from '
    || coalesce(private.member_label(v_message.sender_id), 'a relative') || '.';
  for v_root in
    select distinct on (m.user_id) m.user_id, m.tree_id
    from public.tree_members m
    where m.tree_id = any (v_trees) and m.role = 'admin'
      and m.user_id <> v_message.sender_id
    order by m.user_id, m.tree_id
  loop
    perform private.notify(v_root.user_id, v_me, 'message_reported', null, null, v_text, v_root.tree_id);
  end loop;
  return v_id;
end;
$$;
