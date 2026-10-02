-- Step 99.5: a story's credits can be edited after it's told.
--
-- Aalim asked (2026-10-01): "let credits be edited after a story is told".
-- Who may: its teller, whoever can edit the entry, or the person it's
-- about (`private.story_owner`), the same people who tend and answer it.
-- `set_story_credits` replaces the storytellers and the interviewers in one
-- go. Someone newly credited must be on the tree it's edited from, in full,
-- as `add_story` asks; someone already credited may stay, wherever they
-- are. A placeholder child is still credited by their parent alone (98.3's
-- guard on `story_credits` inserts). No new approval: who told it and who
-- asked doesn't change what it says.
--
-- Additive: a new function, and the sheet's list gains `can_edit_credits`.

create or replace function private.can_edit_story_credits(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
      or private.can_edit_person(s.person_id)
      or private.story_owner(s.person_id) = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false);
$$;

revoke all on function private.can_edit_story_credits(uuid) from public, anon;
grant execute on function private.can_edit_story_credits(uuid) to authenticated, service_role;

create or replace function public.set_story_credits(
  p_story uuid,
  p_tree uuid,
  p_storytellers uuid[],
  p_interviewers uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tellers uuid[] := array(
    select distinct x from unnest(coalesce(p_storytellers, '{}'::uuid[])) as x where x is not null
  );
  v_askers uuid[] := array(
    select distinct x from unnest(coalesce(p_interviewers, '{}'::uuid[])) as x where x is not null
  );
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stories where id = p_story) then
    raise exception 'STORY: not a story you can see' using errcode = '42501';
  end if;
  if not private.can_edit_story_credits(p_story) then
    raise exception 'STORY: not yours to credit' using errcode = '42501';
  end if;
  if cardinality(v_tellers) > 10 or cardinality(v_askers) > 10 then
    raise exception 'STORY: too many people' using errcode = '22023';
  end if;
  -- Someone newly credited is on the tree it's edited from, in full.
  if exists (
    select 1
    from (
      select x, 'storyteller' as role from unnest(v_tellers) as x
      union all
      select x, 'interviewer' from unnest(v_askers) as x
    ) n
    where not exists (
      select 1 from public.story_credits c
      where c.story_id = p_story and c.person_id = n.x and c.role = n.role
    )
    and not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, n.x))
  ) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;

  delete from public.story_credits c
  where c.story_id = p_story
    and not (
      (c.role = 'storyteller' and c.person_id = any (v_tellers))
      or (c.role = 'interviewer' and c.person_id = any (v_askers))
    );

  insert into public.story_credits (story_id, person_id, role)
  select p_story, x, 'storyteller' from unnest(v_tellers) as x
  union all
  select p_story, x, 'interviewer' from unnest(v_askers) as x
  on conflict (story_id, person_id, role) do nothing;
end;
$$;

revoke all on function public.set_story_credits(uuid, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.set_story_credits(uuid, uuid, uuid[], uuid[]) to authenticated;

-- The sheet's list says who may edit a story's credits. A new column, so
-- the function is made again (from 20261001160000).
drop function public.entry_stories(uuid);

create function public.entry_stories(p_person uuid)
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
  can_decide boolean,
  comment_count integer,
  shared boolean,
  can_share boolean,
  can_stop_sharing boolean,
  my_link text,
  told_on date,
  told_on_precision text,
  credits jsonb,
  can_edit_credits boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.title, s.body, s.audio_path, s.audio_seconds, s.status,
    s.created_at, s.created_by, private.member_label(s.created_by),
    s.status = 'pending' and private.can_approve_story(s.person_id),
    (select count(*)::integer from public.story_comments c where c.story_id = s.id),
    s.status = 'approved' and private.story_shared(s.id),
    x.can_share,
    s.status = 'approved' and private.can_stop_story_links(s.id),
    case when x.can_share then (
      select l.token from public.story_links l
      where l.story_id = s.id
        and l.created_by = (select auth.uid())
        and l.revoked_at is null
    ) end,
    s.told_on, s.told_on_precision,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', c.person_id, 'name', private.person_label(c.person_id), 'role', c.role)
          order by c.role desc, private.person_label(c.person_id)
        )
        from public.story_credits c
        where c.story_id = s.id
      ),
      '[]'::jsonb
    ),
    private.can_edit_story_credits(s.id)
  from public.stories s
  cross join lateral (select private.can_share_story(s.id) as can_share) x
  where s.person_id = p_person
  order by s.created_at desc;
$$;

revoke all on function public.entry_stories(uuid) from public, anon;
grant execute on function public.entry_stories(uuid) to authenticated;
