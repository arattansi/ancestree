-- Step 174.2 — Direct messages
--
-- Aalim asked (2026-10-16) for a messenger, for direct messages only, as a
-- pop-up at the bottom right of the window; channels and group messages are
-- scoped for later (Notion: "ancestree × Messaging — Product Scope"), and the
-- tables leave room for them (`conversations.kind`).
--
-- Two members may write to each other while they share a tree. A
-- conversation stays readable once they don't (one left, or was removed),
-- but nothing more can be sent in it until they share one again. A direct
-- conversation goes with either member's account, every message in it.
--
-- Tables (members read their own conversations; nobody writes them but the
-- functions below):
--   conversations          one a pair for now (`direct_key`), and when the
--                          last message came.
--   conversation_members   who is in one, and up to when they've read it.
--   messages               what was said, 1 to 4,000 characters.
--
-- Functions:
--   private.in_conversation(uuid)       the caller is in it (the policies).
--   private.share_a_tree(uuid, uuid)    two accounts are on a tree together.
--   public.open_direct_conversation(uuid)  the conversation with someone,
--                          made the first time, only while you share a tree.
--   public.send_message(uuid, text)     a message, trimmed; refused once you
--                          share no tree, and past 30 a minute.
--   public.mark_conversation_read(uuid, timestamptz)  read up to a message.
--   public.my_conversations()           the caller's, newest first, with
--                          who's on the other side, the last message, how
--                          many are unread, and whether they can still write.
--   public.message_contacts()           everyone the caller can write to.
--
-- Realtime: each new message goes to every member's own private channel,
-- `inbox:<user id>` (`realtime.send` from a trigger), and a read goes to the
-- reader's own, so their other tabs clear it; a policy on `realtime.messages`
-- lets each member hear only their own inbox. The suspended-account policy
-- there (20261002100000) applies as well.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- 'direct' only for now; groups and channels come later (see the scope).
  kind text not null default 'direct' check (kind in ('direct')),
  -- A direct conversation's two members, the lower id first: one a pair.
  direct_key text unique,
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_direct_has_key
    check (kind <> 'direct' or direct_key is not null)
);

create table public.conversation_members (
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  user_id uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- The newest message they've seen; null until they've read any.
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_id_idx
  on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations (id) on delete cascade,
  sender_id uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- Read only, and only by members; every write goes through a function.
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.conversation_members from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_members to authenticated;
grant select on table public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------

create function private.in_conversation(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation
      and cm.user_id = (select auth.uid())
  );
$$;

-- The policies call it, so members must be able to.
revoke all on function private.in_conversation(uuid) from public, anon;
grant execute on function private.in_conversation(uuid) to authenticated, service_role;

create function private.share_a_tree(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_members a
    join public.tree_members b on b.tree_id = a.tree_id
    where a.user_id = p_a and b.user_id = p_b
  );
$$;

revoke all on function private.share_a_tree(uuid, uuid) from public, anon, authenticated;
grant execute on function private.share_a_tree(uuid, uuid) to service_role;

create policy conversations_select on public.conversations
  for select to authenticated
  using (private.in_conversation(id));

create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (private.in_conversation(conversation_id));

create policy messages_select on public.messages
  for select to authenticated
  using (private.in_conversation(conversation_id));

-- ---------------------------------------------------------------------------
-- 3. Opening, sending, reading
-- ---------------------------------------------------------------------------

create function public.open_direct_conversation(p_with uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_key text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  if p_with is null or p_with = v_me then
    raise exception 'NOT_SOMEONE_ELSE' using errcode = '22023';
  end if;

  v_key := least(v_me, p_with)::text || ':' || greatest(v_me, p_with)::text;

  -- One you've had: readable whether or not you still share a tree.
  select c.id into v_id from public.conversations c where c.direct_key = v_key;
  if v_id is not null then
    return v_id;
  end if;

  if not private.share_a_tree(v_me, p_with) then
    raise exception 'NO_SHARED_TREE'
      using errcode = '42501',
            hint = 'You can message people on a tree you''re on.';
  end if;

  insert into public.conversations (kind, direct_key, created_by)
  values ('direct', v_key, v_me)
  on conflict (direct_key) do nothing
  returning id into v_id;

  -- They opened it at the same moment: theirs is the one.
  if v_id is null then
    select c.id into v_id from public.conversations c where c.direct_key = v_key;
    return v_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, v_me), (v_id, p_with);
  return v_id;
end;
$$;

revoke all on function public.open_direct_conversation(uuid) from public, anon;
grant execute on function public.open_direct_conversation(uuid) to authenticated, service_role;

create function public.send_message(p_conversation uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_body text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_kind text;
  v_row public.messages;
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

  if char_length(v_body) = 0 then
    raise exception 'EMPTY_MESSAGE' using errcode = '22023';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'MESSAGE_TOO_LONG' using errcode = '22023';
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

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation, v_me, v_body)
  returning * into v_row;

  update public.conversations c
     set last_message_at = greatest(coalesce(c.last_message_at, v_row.created_at), v_row.created_at)
   where c.id = p_conversation;

  -- What you've written you've read.
  update public.conversation_members cm
     set last_read_at = greatest(coalesce(cm.last_read_at, v_row.created_at), v_row.created_at)
   where cm.conversation_id = p_conversation and cm.user_id = v_me;

  return v_row;
end;
$$;

revoke all on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated, service_role;

-- Up to the newest message the reader has seen (never past now), so one
-- that lands while they read stays unread.
create function public.mark_conversation_read(p_conversation uuid, p_up_to timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_up_to timestamptz := least(coalesce(p_up_to, now()), now());
  v_at timestamptz;
begin
  update public.conversation_members cm
     set last_read_at = v_up_to
   where cm.conversation_id = p_conversation
     and cm.user_id = v_me
     and (cm.last_read_at is null or cm.last_read_at < v_up_to)
  returning cm.last_read_at into v_at;

  if v_at is not null then
    perform realtime.send(
      jsonb_build_object('conversation_id', p_conversation, 'last_read_at', v_at),
      'read',
      'inbox:' || v_me::text,
      true
    );
  end if;
  return v_at;
end;
$$;

revoke all on function public.mark_conversation_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_conversation_read(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Lists
-- ---------------------------------------------------------------------------

-- The other member's face only where the caller may read their entry.
create function public.my_conversations()
returns table (
  conversation_id uuid,
  kind text,
  other_user_id uuid,
  other_name text,
  other_person_id uuid,
  other_photo_path text,
  other_photo_crop jsonb,
  last_body text,
  last_sender_id uuid,
  last_at timestamptz,
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
    lm.body,
    lm.sender_id,
    lm.created_at,
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
    select m.body, m.sender_id, m.created_at from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where mine.user_id = (select auth.uid())
    -- One opened and never written in stays out of both lists.
    and c.last_message_at is not null
  order by c.last_message_at desc;
$$;

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated, service_role;

-- Everyone on a tree with the caller, but not suspended accounts.
create function public.message_contacts()
returns table (
  user_id uuid,
  name text,
  person_id uuid,
  photo_path text,
  photo_crop jsonb,
  tree_names text[]
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
    array_agg(distinct t.name order by t.name)
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
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- Each new message to every member's inbox, the sender's too (their other
-- tabs). `realtime.send` only warns if it fails, so a message is never lost
-- for want of a broadcast: the list is read again when the pop-up opens.
create function private.message_to_inboxes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_payload jsonb := jsonb_build_object(
    'id', new.id,
    'conversation_id', new.conversation_id,
    'sender_id', new.sender_id,
    'body', new.body,
    'created_at', new.created_at
  );
begin
  for v_member in
    select cm.user_id from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
  loop
    perform realtime.send(v_payload, 'message', 'inbox:' || v_member::text, true);
  end loop;
  return null;
end;
$$;

revoke all on function private.message_to_inboxes() from public, anon, authenticated;

create trigger messages_to_inboxes
  after insert on public.messages
  for each row execute function private.message_to_inboxes();

-- A direct conversation goes with either member's account, all of it.
create function private.direct_conversation_member_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.conversations c
  where c.id = old.conversation_id and c.kind = 'direct';
  return null;
end;
$$;

revoke all on function private.direct_conversation_member_gone() from public, anon, authenticated;

create trigger conversation_members_gone
  after delete on public.conversation_members
  for each row execute function private.direct_conversation_member_gone();

-- ---------------------------------------------------------------------------
-- 6. Each member hears only their own inbox
-- ---------------------------------------------------------------------------

create policy "members receive their own inbox"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'inbox:' || (select auth.uid())::text
);
