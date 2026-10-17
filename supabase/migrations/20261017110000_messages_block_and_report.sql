-- Step 177.3 — Block a member, report a message
--
-- Part of Phase 0 of the Notion "Ancestree × Messaging — Product Scope";
-- Aalim (2026-10-16): block and report in Phase 0, before groups. Nothing
-- here reads a message: the database still holds only ciphertext, and a
-- report carries only the words the reporter's own device read and chose
-- to send.
--
-- Block. `message_blocks` (who blocked whom), written by `block_member` and
-- `unblock_member`, listed by `my_blocks`. Either way round, a blocked pair
-- can't start a conversation (`open_direct_conversation`) or write in one
-- (`send_message`: `BLOCKED`), and neither is offered to the other in New
-- Message (`message_contacts`). What they wrote stays readable to both;
-- `my_conversations` says who blocked whom (`blocked`: `by_you` /
-- `by_them`) and can no longer send.
--
-- Report. `message_reports`: the message's words as the reporter's device
-- read them (the server can't check them), a reason if given, and the
-- trees the two shared. Seen by the reporter, the beta reviewers, and the
-- Roots of those trees, but never the member reported; `report_message`
-- tells those Roots (`message_reported`), `resolve_message_report` closes
-- one and tells the reporter (`message_report_resolved`). Deleting the
-- message leaves its report; deleting either account (which deletes the
-- conversation) takes it.
--
-- Re-created: `open_direct_conversation` from `20261016150000`,
-- `send_message` and `message_contacts` from `20261016160000` (live bodies
-- md5-checked against those files first), `my_conversations` from
-- `20261017100000`.

-- ---------------------------------------------------------------------------
-- 1. Blocks
-- ---------------------------------------------------------------------------

create table public.message_blocks (
  blocker_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  blocked_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint message_blocks_not_self check (blocker_id <> blocked_id)
);

create index message_blocks_blocked_id_idx on public.message_blocks (blocked_id);

alter table public.message_blocks enable row level security;
revoke all on table public.message_blocks from anon, authenticated;

create function private.blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function private.blocked_between(uuid, uuid) from public, anon, authenticated;
grant execute on function private.blocked_between(uuid, uuid) to service_role;

-- Someone the caller shares a tree or a conversation with. Their other
-- tabs hear it on their own inbox.
create function public.block_member(p_user uuid)
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
  if p_user is null or p_user = v_me then
    raise exception 'NOT_SOMEONE_ELSE' using errcode = '22023';
  end if;
  if not private.can_see_messaging_key(p_user) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  insert into public.message_blocks (blocker_id, blocked_id)
  values (v_me, p_user)
  on conflict do nothing;
  perform realtime.send(
    jsonb_build_object('user_id', p_user, 'blocked', true),
    'blocks',
    'inbox:' || v_me::text,
    true
  );
end;
$$;

revoke all on function public.block_member(uuid) from public, anon;
grant execute on function public.block_member(uuid) to authenticated, service_role;

create function public.unblock_member(p_user uuid)
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
  delete from public.message_blocks b
  where b.blocker_id = v_me and b.blocked_id = p_user;
  perform realtime.send(
    jsonb_build_object('user_id', p_user, 'blocked', false),
    'blocks',
    'inbox:' || v_me::text,
    true
  );
end;
$$;

revoke all on function public.unblock_member(uuid) from public, anon;
grant execute on function public.unblock_member(uuid) to authenticated, service_role;

-- Whom the caller has blocked, newest first.
create function public.my_blocks()
returns table (user_id uuid, name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, coalesce(nullif(btrim(p.display_name), ''), 'Someone'), b.created_at
  from public.message_blocks b
  left join public.profiles p on p.auth_user_id = b.blocked_id
  where b.blocker_id = (select auth.uid())
  order by b.created_at desc;
$$;

revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Opening, sending and the lists, re-created with blocks
-- ---------------------------------------------------------------------------

create or replace function public.open_direct_conversation(p_with uuid)
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

  -- Not with someone either of you has blocked (Step 177.3).
  if private.blocked_between(v_me, p_with) then
    raise exception 'BLOCKED' using errcode = '42501';
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

create or replace function public.message_contacts()
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
    -- Nobody either of you has blocked (Step 177.3).
    and not private.blocked_between(me.user_id, them.user_id)
  group by p.auth_user_id, p.display_name, seen.ok, pe.id, pe.photo_path, pe.photo_crop
  order by 2;
$$;

revoke all on function public.message_contacts() from public, anon;
grant execute on function public.message_contacts() to authenticated, service_role;

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
  muted_until timestamptz,
  blocked text
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
    o.user_id is not null
      and private.share_a_tree(mine.user_id, o.user_id)
      and not private.blocked_between(mine.user_id, o.user_id),
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
    end
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

-- ---------------------------------------------------------------------------
-- 3. Reports
-- ---------------------------------------------------------------------------

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  -- The message, until its sender deletes it; the report keeps its words.
  message_id uuid references public.messages (id) on delete set null,
  -- Goes with the conversation, so with either member's account.
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  reporter_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  sender_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  -- The words as the reporter's device read them: the server can't check.
  body text not null check (char_length(body) between 1 and 4000),
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  sent_at timestamptz not null,
  -- The trees the two shared when it was reported: their Roots see it.
  tree_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (auth_user_id) on delete set null,
  constraint message_reports_resolved check ((status = 'open') = (resolved_at is null))
);

-- One report of a message from each reporter.
create unique index message_reports_once
  on public.message_reports (message_id, reporter_id)
  where message_id is not null;
create index message_reports_conversation_id_idx on public.message_reports (conversation_id);
create index message_reports_reporter_id_idx on public.message_reports (reporter_id);
create index message_reports_sender_id_idx on public.message_reports (sender_id);
create index message_reports_resolved_by_idx on public.message_reports (resolved_by);
create index message_reports_tree_ids_idx on public.message_reports using gin (tree_ids);

alter table public.message_reports enable row level security;
revoke all on table public.message_reports from anon, authenticated;
grant select on table public.message_reports to authenticated;

-- Who may see one and close it: the beta reviewers, and a Root of a tree
-- the two shared who isn't the member reported.
create function private.can_moderate_message_report(p_sender uuid, p_trees uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_beta_reviewer()
    or (
      p_sender is distinct from (select auth.uid())
      and exists (select 1 from unnest(p_trees) t (id) where private.is_root_of(t.id))
    );
$$;

-- The policy calls it, so members must be able to.
revoke all on function private.can_moderate_message_report(uuid, uuid[]) from public, anon;
grant execute on function private.can_moderate_message_report(uuid, uuid[]) to authenticated, service_role;

create policy message_reports_select on public.message_reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or private.can_moderate_message_report(sender_id, tree_ids)
  );

-- From a member of the conversation, of the other member's message, with
-- the words their device read. At most 20 a day.
create function public.report_message(p_message uuid, p_body text, p_reason text default null)
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
  if v_message.id is null or not private.in_conversation(v_message.conversation_id) then
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

revoke all on function public.report_message(uuid, text, text) from public, anon;
grant execute on function public.report_message(uuid, text, text) to authenticated, service_role;

create function public.resolve_message_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_report public.message_reports;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  select * into v_report from public.message_reports r where r.id = p_report;
  if v_report.id is null
     or not private.can_moderate_message_report(v_report.sender_id, v_report.tree_ids) then
    raise exception 'NOT_YOURS' using errcode = '42501';
  end if;
  if v_report.status <> 'open' then
    raise exception 'ALREADY_RESOLVED' using errcode = '22023';
  end if;

  update public.message_reports r
     set status = 'resolved', resolved_at = now(), resolved_by = v_me
   where r.id = p_report;

  perform private.notify(
    v_report.reporter_id, v_me, 'message_report_resolved', null, null,
    'Your report of a message from '
      || coalesce(private.member_label(v_report.sender_id), 'a relative')
      || ' was looked at.',
    v_report.tree_ids[1]
  );
end;
$$;

revoke all on function public.resolve_message_report(uuid) from public, anon;
grant execute on function public.resolve_message_report(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. The notices
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
    'message_report_resolved'
  ));
