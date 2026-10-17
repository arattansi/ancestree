-- Step 180 — The weekly newsletter names who you have unread messages from
--
-- Aalim (2026-10-16): "for notifications, add a section to the weekly
-- newsletter to show who the person has unread messages from". Messages
-- are end to end (Step 174.6), so this reads only who wrote and when, never
-- a word of what: the database holds only ciphertext. Phase 0's "no email
-- when a message waits" (177.2) still stands for single messages; this is
-- a section of the weekly newsletter only.
--
-- `newsletter_unread_messages`: for each of `p_users`, everyone who has
-- written to them since they last read that conversation (`last_read_at`),
-- how many messages, and when the newest came. Left out: a conversation
-- they've muted (Step 177.4), and anyone blocked either way round
-- (Step 177.3). A deleted message is gone (177.5), so it isn't counted.
-- Service role only, as `newsletter_due` is.

create function public.newsletter_unread_messages(p_users uuid[])
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
     and m.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)
    where mine.user_id = any (p_users)
      and (mine.muted_until is null or mine.muted_until <= now())
    group by mine.user_id, m.sender_id
  ) w
  where not private.blocked_between(w.user_id, w.sender_id)
  order by w.user_id, w.newest_at desc, w.sender_id;
$$;

revoke all on function public.newsletter_unread_messages(uuid[]) from public, anon, authenticated;
grant execute on function public.newsletter_unread_messages(uuid[]) to service_role;
