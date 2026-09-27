-- Step 57.3 — Who else has the tree open, and where their pointer is
--
-- Aalim asked (2026-09-26) for live cursors on the tree page, as in Figma or
-- Lucid: the members who have the same tree open see each other's faces in
-- the corner and each other's pointers on the canvas.
--
-- Nothing is stored. The page joins a private Supabase Realtime channel named
-- `tree:<tree id>`, says it is there (Presence) and sends where its pointer is
-- (Broadcast); Realtime relays both and keeps neither. What this migration
-- adds is who may join: Realtime asks `realtime.messages`' policies when a
-- page joins a private channel, and these let in only the tree's members.
-- Share links and visitors from other trees never join (the page doesn't
-- try, and they aren't members).
--
-- 1. `private.topic_tree(text)` — the tree id a channel's topic names, or
--    null for any other topic.
-- 2. Read and write policies on `realtime.messages` for Broadcast and
--    Presence on `tree:<id>`, for that tree's members only.

-- ---------------------------------------------------------------------------
-- 1. The tree a topic names
-- ---------------------------------------------------------------------------

-- `tree:` and a uuid, nothing before or after; anything else is null, so a
-- malformed topic never reaches the uuid cast (which would raise).
create or replace function private.topic_tree(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^tree:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substr(p_topic, 6)::uuid
  end;
$$;

revoke all on function private.topic_tree(text) from anon, public;
grant execute on function private.topic_tree(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Members only on `tree:<id>`
-- ---------------------------------------------------------------------------

create policy "tree members receive the tree's presence and pointers"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select private.is_tree_member(private.topic_tree((select realtime.topic()))))
);

create policy "tree members send the tree's presence and pointers"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select private.is_tree_member(private.topic_tree((select realtime.topic()))))
);
