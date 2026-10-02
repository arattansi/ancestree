-- Step 99.9: a comment on a story can be edited by whoever wrote it.
--
-- Aalim asked (2026-10-01): "let the comments on a story be edited too".
-- Its author alone changes their words, while they can still see the
-- story's comments (an approved story theirs to read), with the same checks
-- as when they wrote it; comments need no approval, so nothing waits and
-- nobody is told. An edited comment says so (`edited_at`, its latest edit).
--
-- Additive: a new column and function; the comment list gains a column, so
-- it's made again (from 20260929200000).

alter table public.story_comments add column edited_at timestamptz;

create or replace function public.edit_story_comment(p_comment uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_comment public.story_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_comment from public.story_comments where id = p_comment;
  if not found or v_comment.created_by is distinct from v_uid then
    raise exception 'STORY: not your comment' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'STORY: nothing to say' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    raise exception 'STORY: longer than a comment may be' using errcode = '22001';
  end if;
  if not private.can_see_story_comments(v_comment.story_id) then
    raise exception 'STORY: not a story you can see' using errcode = '42501';
  end if;

  update public.story_comments
  set body = v_body, edited_at = now()
  where id = p_comment and body is distinct from v_body;
end;
$$;

revoke all on function public.edit_story_comment(uuid, text) from public, anon;
grant execute on function public.edit_story_comment(uuid, text) to authenticated;

drop function public.list_story_comments(uuid);

create function public.list_story_comments(p_story uuid)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  created_by uuid,
  said_by text,
  edited_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.body, c.created_at, c.created_by, private.member_label(c.created_by),
    c.edited_at
  from public.story_comments c
  where c.story_id = p_story
  order by c.created_at, c.id;
$$;

revoke all on function public.list_story_comments(uuid) from public, anon;
grant execute on function public.list_story_comments(uuid) to authenticated;
