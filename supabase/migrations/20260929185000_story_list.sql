-- Step 88.3: an entry's stories for its details, in one call. Those the
-- viewer may see (the table's own rules decide: this runs as them), newest
-- first, each with who told it and whether the viewer may approve it. A
-- story shows wherever its entry does, so its teller may be on a tree the
-- viewer isn't, which the member directory wouldn't name.
--
-- Additive, before the deploy that reads it.
create or replace function public.entry_stories(p_person uuid)
returns table (
  id uuid,
  title text,
  body text,
  audio_path text,
  audio_seconds integer,
  status text,
  created_at timestamptz,
  created_by uuid,
  told_by text,
  can_decide boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.title, s.body, s.audio_path, s.audio_seconds, s.status,
    s.created_at, s.created_by, private.member_label(s.created_by),
    s.status = 'pending' and private.can_approve_story(s.person_id)
  from public.stories s
  where s.person_id = p_person
  order by s.created_at desc;
$$;

revoke all on function public.entry_stories(uuid) from public, anon;
grant execute on function public.entry_stories(uuid) to authenticated;
