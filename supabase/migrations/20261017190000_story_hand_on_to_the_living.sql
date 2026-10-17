-- Step 183: a story hands on only to someone whose entry is still there.
--
-- Deleting a tree deletes its entries one after another in one statement,
-- and each one's `people_hand_on_stories` ran before the entries deleted
-- just before it had taken their places in stories with them (those go at
-- the end of the statement). A story about two people on the tree was
-- handed from the second to the first, already gone, and the delete failed
-- on `stories_person_id_fkey`. Whoever's entry has gone in the same
-- statement is passed over now, so a story about nobody left goes with the
-- tree. Made again from 20261017180000.

create or replace function private.next_story_subject(p_story uuid, p_except uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.person_id
  from public.story_subjects a
  where a.story_id = p_story
    and a.person_id <> p_except
    and exists (select 1 from public.people pe where pe.id = a.person_id)
  order by (a.status = 'approved') desc, (a.status = 'pending') desc, a.created_at, a.person_id
  limit 1;
$$;
