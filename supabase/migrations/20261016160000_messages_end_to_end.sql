-- Step 174.6 — Messages end to end
--
-- Aalim (2026-10-16): "Build end-to-end encryption for direct messages now,
-- as scoped in §3.5, before Step 174 goes to production." Only the people
-- in a conversation can read it; this database, its backups and Realtime
-- hold ciphertext. The encrypting and decrypting happen on members'
-- devices (`lib/e2e/crypto.ts`); what's here keeps keys and ciphertext and
-- checks who may send what to whom.
--
-- Step 174's messages held their text in `messages.body`. None were ever
-- written (Step 174's code hadn't reached production), so the column goes
-- outright; the migration refuses to run if any message exists.
--
-- Keys. Each member has one messaging key, versioned: an X25519 public key
-- to seal to and an Ed25519 one to check signatures with. Its secret halves
-- never leave members' devices except encrypted, to another of their
-- devices (a link, `messaging_key_transfers`, ten minutes, read once) or to
-- a backup only their recovery phrase opens (`messaging_key_backups`).
--
-- Tables (no direct reads or writes; every one through a function below,
-- which hands bytes over as base64):
--   messaging_keys            published keys, by member and version.
--   message_keys              a message's key, sealed to one member.
--   messaging_key_transfers   a keyring on its way to a member's new device.
--   messaging_key_backups     a keyring under a member's recovery phrase.
--   messages                  `body` gives way to `ciphertext`, `nonce`,
--                             `signature`, `sender_key_version`, `format`.
--
-- Functions:
--   my_messaging_key()                 the caller's current version, and
--                                      whether a backup is kept.
--   publish_messaging_key(...)         the first key, or a new one (reset,
--                                      which drops the backup).
--   messaging_keys_of(uuid[])          every version of members the caller
--                                      may see (on a tree with them, or in
--                                      a conversation with them).
--   conversation_keys(uuid)            each member's current key, to seal to.
--   send_message(...)                  re-created: ciphertext, a sealed key
--                                      for every member at their current
--                                      version, the sender's signature.
--   thread_messages(uuid, ts, int)     a page of a thread with the caller's
--                                      own sealed keys.
--   my_conversations()                 re-created: the last message
--                                      encrypted, the other member's key
--                                      version.
--   message_contacts()                 re-created: each contact's key
--                                      version (null: can't be written to
--                                      until they next open the messenger).
--   put_key_transfer / take_key_transfer, put_key_backup / get_key_backup.
--
-- Realtime: the trigger moves from `messages` to `message_keys`, so each
-- member's inbox gets the message with their own sealed key.

do $guard$
begin
  if exists (select 1 from public.messages) then
    raise exception 'messages exist: they would lose their text';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 1. Base64 in and out
-- ---------------------------------------------------------------------------

create function private.b64(p bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(encode(p, 'base64'), E'\n', '');
$$;

create function private.unb64(p text)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
begin
  return decode(p, 'base64');
exception when others then
  return null;
end;
$$;

revoke all on function private.b64(bytea) from public, anon;
revoke all on function private.unb64(text) from public, anon;
grant execute on function private.b64(bytea) to authenticated, service_role;
grant execute on function private.unb64(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

create table public.messaging_keys (
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  version integer not null check (version >= 1),
  box_public bytea not null check (octet_length(box_public) = 32),
  sign_public bytea not null check (octet_length(sign_public) = 32),
  created_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table public.message_keys (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  key_version integer not null,
  -- An ephemeral X25519 key, a nonce, and the 32-byte key with its tag.
  sealed_key bytea not null check (octet_length(sealed_key) = 104),
  primary key (message_id, user_id)
);

create index message_keys_user_id_idx on public.message_keys (user_id);

create table public.messaging_key_transfers (
  id uuid primary key,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  blob bytea not null check (octet_length(blob) between 40 and 65536),
  created_at timestamptz not null default now()
);

create index messaging_key_transfers_user_id_idx
  on public.messaging_key_transfers (user_id);

create table public.messaging_key_backups (
  user_id uuid primary key references public.profiles (auth_user_id) on delete cascade,
  key_version integer not null,
  blob bytea not null check (octet_length(blob) between 40 and 65536),
  updated_at timestamptz not null default now()
);

alter table public.messaging_keys enable row level security;
alter table public.message_keys enable row level security;
alter table public.messaging_key_transfers enable row level security;
alter table public.messaging_key_backups enable row level security;

revoke all on table public.messaging_keys from anon, authenticated;
revoke all on table public.message_keys from anon, authenticated;
revoke all on table public.messaging_key_transfers from anon, authenticated;
revoke all on table public.messaging_key_backups from anon, authenticated;

-- Messages hold ciphertext. 4,000 characters is at most 16,000 bytes of
-- UTF-8, and the tag adds 16.
alter table public.messages drop column body;
alter table public.messages
  add column ciphertext bytea not null
    check (octet_length(ciphertext) between 17 and 16016),
  add column nonce bytea not null check (octet_length(nonce) = 24),
  add column signature bytea not null check (octet_length(signature) = 64),
  add column sender_key_version integer not null,
  add column format smallint not null default 1 check (format = 1);

-- Read through `thread_messages` now, as base64.
revoke select on table public.messages from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Keys
-- ---------------------------------------------------------------------------

-- Whose keys the caller may see: their own, anyone on a tree with them,
-- anyone in a conversation with them.
create function private.can_see_messaging_key(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = (select auth.uid())
    or private.share_a_tree((select auth.uid()), p_user)
    or exists (
      select 1
      from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.user_id = (select auth.uid()) and b.user_id = p_user
    );
$$;

revoke all on function private.can_see_messaging_key(uuid) from public, anon, authenticated;
grant execute on function private.can_see_messaging_key(uuid) to service_role;

create function public.my_messaging_key()
returns table (version integer, backup_version integer, backup_updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select max(k.version) from public.messaging_keys k where k.user_id = (select auth.uid())),
    b.key_version,
    b.updated_at
  from (select 1) one
  left join public.messaging_key_backups b on b.user_id = (select auth.uid());
$$;

revoke all on function public.my_messaging_key() from public, anon;
grant execute on function public.my_messaging_key() to authenticated, service_role;

-- The first key; or, with `p_reset`, a new version, for a member who has
-- lost every device that held theirs. A reset drops the backup, which
-- holds the old key, and is held to five a day.
create function public.publish_messaging_key(
  p_box_public text,
  p_sign_public text,
  p_reset boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_box bytea := private.unb64(p_box_public);
  v_sign bytea := private.unb64(p_sign_public);
  v_current integer;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  if octet_length(v_box) is distinct from 32 or octet_length(v_sign) is distinct from 32 then
    raise exception 'BAD_KEY' using errcode = '22023';
  end if;

  perform 1 from public.profiles p where p.auth_user_id = v_me for update;
  select max(k.version) into v_current from public.messaging_keys k where k.user_id = v_me;

  if v_current is not null and not coalesce(p_reset, false) then
    raise exception 'KEY_EXISTS' using errcode = '23505';
  end if;
  if (
    select count(*) from public.messaging_keys k
    where k.user_id = v_me and k.created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'SLOW_DOWN' using errcode = '54000';
  end if;

  insert into public.messaging_keys (user_id, version, box_public, sign_public)
  values (v_me, coalesce(v_current, 0) + 1, v_box, v_sign);

  if v_current is not null then
    delete from public.messaging_key_backups b where b.user_id = v_me;
  end if;
  return coalesce(v_current, 0) + 1;
end;
$$;

revoke all on function public.publish_messaging_key(text, text, boolean) from public, anon;
grant execute on function public.publish_messaging_key(text, text, boolean) to authenticated, service_role;

create function public.messaging_keys_of(p_users uuid[])
returns table (user_id uuid, version integer, box_public text, sign_public text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.user_id, k.version, private.b64(k.box_public), private.b64(k.sign_public), k.created_at
  from public.messaging_keys k
  where k.user_id = any (p_users)
    and cardinality(p_users) <= 200
    and private.can_see_messaging_key(k.user_id)
  order by k.user_id, k.version;
$$;

revoke all on function public.messaging_keys_of(uuid[]) from public, anon;
grant execute on function public.messaging_keys_of(uuid[]) to authenticated, service_role;

-- Each member's current key, for a member of the conversation; a member
-- with none comes back with nulls.
create function public.conversation_keys(p_conversation uuid)
returns table (user_id uuid, version integer, box_public text, sign_public text)
language sql
stable
security definer
set search_path = ''
as $$
  select cm.user_id, k.version, private.b64(k.box_public), private.b64(k.sign_public)
  from public.conversation_members cm
  left join lateral (
    select k.version, k.box_public, k.sign_public from public.messaging_keys k
    where k.user_id = cm.user_id
    order by k.version desc
    limit 1
  ) k on true
  where cm.conversation_id = p_conversation
    and private.in_conversation(p_conversation);
$$;

revoke all on function public.conversation_keys(uuid) from public, anon;
grant execute on function public.conversation_keys(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Sending and reading
-- ---------------------------------------------------------------------------

drop function public.send_message(uuid, text);

-- `p_keys`: one `{user_id, key_version, sealed_key}` for every member, at
-- their current version; anything else is `KEYS_CHANGED`, and the device
-- reads the keys again and seals afresh. The id comes from the device,
-- which encrypted the message bound to it.
create function public.send_message(
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

  -- Every member has a key, and the device sealed to each one's current
  -- version, its own included.
  if exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and not exists (select 1 from public.messaging_keys k where k.user_id = cm.user_id)
  ) then
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
  from public.conversation_members cm where cm.conversation_id = p_conversation;
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

revoke all on function public.send_message(uuid, uuid, text, text, text, integer, jsonb) from public, anon;
grant execute on function public.send_message(uuid, uuid, text, text, text, integer, jsonb) to authenticated, service_role;

-- A page of a thread, newest first, before `p_before` when given, with the
-- caller's own sealed key for each.
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
  sealed_key text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.sender_id, m.created_at,
         private.b64(m.ciphertext), private.b64(m.nonce), private.b64(m.signature),
         m.sender_key_version, mk.key_version, private.b64(mk.sealed_key)
  from public.messages m
  left join public.message_keys mk
    on mk.message_id = m.id and mk.user_id = (select auth.uid())
  where m.conversation_id = p_conversation
    and private.in_conversation(p_conversation)
    and (p_before is null or m.created_at < p_before)
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.thread_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.thread_messages(uuid, timestamptz, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Lists, re-created for ciphertext
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
  can_send boolean
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
    o.user_id is not null and private.share_a_tree(mine.user_id, o.user_id)
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

drop function public.message_contacts();

-- Everyone on a tree with the caller, but not suspended accounts, with
-- their key's version: null until they next open the messenger.
create function public.message_contacts()
returns table (
  user_id uuid,
  name text,
  person_id uuid,
  photo_path text,
  photo_crop jsonb,
  tree_names text[],
  key_version integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.auth_user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Someone'),
    case when seen.ok then pe.id end,
    case when seen.ok then pe.photo_path end,
    case when seen.ok then pe.photo_crop end,
    array_agg(distinct t.name order by t.name),
    (select max(k.version) from public.messaging_keys k where k.user_id = p.auth_user_id)
  from public.tree_members me
  join public.tree_members them
    on them.tree_id = me.tree_id and them.user_id <> me.user_id
  join public.trees t on t.id = me.tree_id
  join public.profiles p on p.auth_user_id = them.user_id
  left join public.people pe on pe.id = p.self_person_id
  left join lateral (
    select pe.id is not null and private.can_read_person(pe.id) as ok
  ) seen on true
  where me.user_id = (select auth.uid())
    and not exists (
      select 1 from auth.users u
      where u.id = them.user_id and u.banned_until > now()
    )
  group by p.auth_user_id, p.display_name, seen.ok, pe.id, pe.photo_path, pe.photo_crop
  order by 2;
$$;

revoke all on function public.message_contacts() from public, anon;
grant execute on function public.message_contacts() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. A keyring to a member's own new device, and their backup
-- ---------------------------------------------------------------------------

-- Encrypted on the device under a key that never reaches here (it travels
-- in the link's fragment); kept ten minutes, read once, at most three
-- waiting.
create function public.put_key_transfer(p_id uuid, p_blob text)
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
  delete from public.messaging_key_transfers t
  where t.user_id = v_me and t.created_at < now() - interval '10 minutes';
  if (select count(*) from public.messaging_key_transfers t where t.user_id = v_me) >= 3 then
    raise exception 'SLOW_DOWN' using errcode = '54000';
  end if;
  begin
    insert into public.messaging_key_transfers (id, user_id, blob)
    values (p_id, v_me, private.unb64(p_blob));
  exception when check_violation or not_null_violation or unique_violation then
    raise exception 'BAD_TRANSFER' using errcode = '22023';
  end;
end;
$$;

revoke all on function public.put_key_transfer(uuid, text) from public, anon;
grant execute on function public.put_key_transfer(uuid, text) to authenticated, service_role;

create function public.take_key_transfer(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blob bytea;
begin
  delete from public.messaging_key_transfers t
  where t.id = p_id
    and t.user_id = (select auth.uid())
    and t.created_at >= now() - interval '10 minutes'
  returning t.blob into v_blob;
  if v_blob is null then
    raise exception 'LINK_EXPIRED' using errcode = '22023';
  end if;
  return private.b64(v_blob);
end;
$$;

revoke all on function public.take_key_transfer(uuid) from public, anon;
grant execute on function public.take_key_transfer(uuid) to authenticated, service_role;

create function public.put_key_backup(p_blob text, p_key_version integer)
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
  if p_key_version is distinct from (
    select max(k.version) from public.messaging_keys k where k.user_id = v_me
  ) then
    raise exception 'KEYS_CHANGED' using errcode = '40001';
  end if;
  begin
    insert into public.messaging_key_backups (user_id, key_version, blob)
    values (v_me, p_key_version, private.unb64(p_blob))
    on conflict (user_id) do update
      set key_version = excluded.key_version, blob = excluded.blob, updated_at = now();
  exception when check_violation or not_null_violation then
    raise exception 'BAD_BACKUP' using errcode = '22023';
  end;
end;
$$;

revoke all on function public.put_key_backup(text, integer) from public, anon;
grant execute on function public.put_key_backup(text, integer) to authenticated, service_role;

create function public.get_key_backup()
returns table (blob text, key_version integer)
language sql
stable
security definer
set search_path = ''
as $$
  select private.b64(b.blob), b.key_version
  from public.messaging_key_backups b
  where b.user_id = (select auth.uid());
$$;

revoke all on function public.get_key_backup() from public, anon;
grant execute on function public.get_key_backup() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Realtime: each member's inbox gets the message with their own key
-- ---------------------------------------------------------------------------

drop trigger messages_to_inboxes on public.messages;
drop function private.message_to_inboxes();

create function private.message_key_to_inbox()
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
      'sealed_key', private.b64(new.sealed_key)
    ),
    'message',
    'inbox:' || new.user_id::text,
    true
  );
  return null;
end;
$$;

revoke all on function private.message_key_to_inbox() from public, anon, authenticated;

create trigger message_keys_to_inbox
  after insert on public.message_keys
  for each row execute function private.message_key_to_inbox();
