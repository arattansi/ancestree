-- Step 177.4–177.5 — Mute a conversation, delete your own message
--
-- Part of Phase 0 of the Notion "Ancestree × Messaging — Product Scope", on
-- top of the end-to-end encrypted direct messages of Step 174.6. Nothing
-- here reads a message: the database still holds only ciphertext.
--
--   177.4 Mute: `conversation_members.muted_until` (`infinity` until
--         unmuted), set by `mute_conversation`; a muted conversation is
--         left out of the launcher's badge (the device counts it).
--   177.5 Delete your own message: `delete_message` deletes its ciphertext
--         and, by cascade, every sealed key, and tells each member's inbox
--         (`deleted`), so their other devices drop it.
--
-- `my_conversations` is re-created from `20261016160000_messages_end_to_end`
-- with `muted_until`.

-- ---------------------------------------------------------------------------
-- 1. Mute
-- ---------------------------------------------------------------------------

alter table public.conversation_members add column muted_until timestamptz;

-- Until `p_until` (`infinity` for good); null, or a time gone, unmutes.
-- The reader's other tabs hear it on their inbox.
create function public.mute_conversation(p_conversation uuid, p_until timestamptz default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_until timestamptz := case when p_until > now() then p_until end;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  update public.conversation_members cm
     set muted_until = v_until
   where cm.conversation_id = p_conversation and cm.user_id = v_me;
  if not found then
    raise exception 'NO_CONVERSATION' using errcode = '42501';
  end if;
  perform realtime.send(
    jsonb_build_object('conversation_id', p_conversation, 'muted_until', v_until),
    'muted',
    'inbox:' || v_me::text,
    true
  );
  return v_until;
end;
$$;

revoke all on function public.mute_conversation(uuid, timestamptz) from public, anon;
grant execute on function public.mute_conversation(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Delete your own message
-- ---------------------------------------------------------------------------

-- Its sealed keys go with it (`message_keys` cascades). The conversation's
-- last message is the one before; with none left it drops out of the lists,
-- as one never written in does.
create function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_conversation uuid;
  v_member uuid;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
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

revoke all on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The list, re-created with what's new
-- ---------------------------------------------------------------------------

drop function public.my_conversations();

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
  muted_until timestamptz
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
    lm.created_at,
    private.b64(lm.ciphertext),
    private.b64(lm.nonce),
    private.b64(lm.signature),
    lm.sender_key_version,
    mk.key_version,
    private.b64(mk.sealed_key),
    mine.last_read_at,
    (
      select count(*)::integer from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> mine.user_id
        and m.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)
    ),
    o.user_id is not null and private.share_a_tree(mine.user_id, o.user_id),
    case when mine.muted_until > now() then mine.muted_until end
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
    select m.id, m.sender_id, m.created_at, m.ciphertext, m.nonce, m.signature,
           m.sender_key_version
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  left join public.message_keys mk
    on mk.message_id = lm.id and mk.user_id = mine.user_id
  where mine.user_id = (select auth.uid())
    -- One opened and never written in stays out of both lists.
    and c.last_message_at is not null
  order by c.last_message_at desc;
$$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated, service_role;
