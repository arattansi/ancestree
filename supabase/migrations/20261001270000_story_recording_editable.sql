-- Step 99.8: a story's recording can be replaced or removed after it's
-- told.
--
-- Aalim asked (2026-10-01): "let the recording be edited too".
-- `edit_story` (Step 99.7) takes the recording as well, from its teller
-- alone: a new one they've uploaded to the person's folder (checked as
-- `add_story` checks it), or none. A story keeps words or a recording. A new
-- recording, like new words, from someone who couldn't approve it waits for
-- approval again. The recording it no longer has comes back as
-- `removed_audio`, for the app to remove from storage with the service role
-- (its story no longer points at it, which is what let anyone read it).
--
-- Made again with three more arguments, all defaulted, and the nine-argument
-- version dropped in the same go, so the deployed app's calls (which name
-- only those nine) find this one.

drop function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text);

create function public.edit_story(
  p_story uuid,
  p_tree uuid,
  p_storytellers uuid[],
  p_interviewers uuid[],
  -- Null, or left out, clears it.
  p_told_on date default null,
  p_told_precision text default null,
  -- Its teller's new title and text; left alone unless `p_edit_text`.
  p_edit_text boolean default false,
  p_title text default null,
  p_body text default null,
  -- Its teller's new recording (one they've just uploaded to the person's
  -- folder), or null for none; left alone unless `p_edit_audio`.
  p_edit_audio boolean default false,
  p_audio_path text default null,
  p_audio_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_story public.stories%rowtype;
  v_tellers uuid[] := array(
    select distinct x from unnest(coalesce(p_storytellers, '{}'::uuid[])) as x where x is not null
  );
  v_askers uuid[] := array(
    select distinct x from unnest(coalesce(p_interviewers, '{}'::uuid[])) as x where x is not null
  );
  v_told date := p_told_on;
  v_precision text := case when p_told_on is null then null else coalesce(p_told_precision, 'day') end;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_path text := nullif(btrim(coalesce(p_audio_path, '')), '');
  v_status text;
  v_text_changed boolean := false;
  v_audio_changed boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_story from public.stories where id = p_story;
  if not found then
    raise exception 'STORY: not a story you can see' using errcode = '42501';
  end if;
  v_status := v_story.status;
  if not private.can_edit_story_credits(p_story) then
    raise exception 'STORY: not yours to credit' using errcode = '42501';
  end if;
  if (p_edit_text or p_edit_audio) and v_story.created_by is distinct from v_uid then
    raise exception 'STORY: not yours to edit' using errcode = '42501';
  end if;
  if cardinality(v_tellers) > 10 or cardinality(v_askers) > 10 then
    raise exception 'STORY: too many people' using errcode = '22023';
  end if;
  if v_told is not null then
    if v_precision not in ('day', 'month', 'year') then
      raise exception 'STORY: not a date told' using errcode = '22023';
    end if;
    -- Kept on the first day of as much of it as is known, as `add_story` does.
    v_told := case v_precision
      when 'year' then date_trunc('year', v_told)::date
      when 'month' then date_trunc('month', v_told)::date
      else v_told
    end;
    -- A day ahead: somewhere, it's already tomorrow.
    if v_told > current_date + 1 then
      raise exception 'STORY: told after today' using errcode = '22023';
    end if;
  end if;
  if not p_edit_text then
    v_title := v_story.title;
    v_body := v_story.body;
  end if;
  if not p_edit_audio then
    v_path := v_story.audio_path;
  end if;
  v_text_changed := (v_title, v_body) is distinct from (v_story.title, v_story.body);
  v_audio_changed := v_path is distinct from v_story.audio_path;
  if v_body is null and v_path is null then
    raise exception 'STORY: nothing to tell' using errcode = '22023';
  end if;
  if length(v_title) > 120 or length(v_body) > 20000 then
    raise exception 'STORY: longer than a story may be' using errcode = '22001';
  end if;
  -- A new recording is one its teller uploaded to the person's folder.
  if v_audio_changed and v_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'stories'
      and o.name = v_path
      and o.owner_id = v_uid::text
      and (storage.foldername(o.name))[1] = v_story.person_id::text
  ) then
    raise exception 'STORY: that recording didn''t arrive' using errcode = '22023';
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

  -- New words or a new recording: from someone who couldn't approve them,
  -- they wait again.
  if v_text_changed or v_audio_changed then
    if not private.can_approve_story(v_story.person_id) and v_story.status <> 'pending' then
      v_status := 'pending';
    end if;
    update public.stories
    set title = v_title,
        body = v_body,
        audio_path = v_path,
        audio_seconds = case
          when not v_audio_changed then audio_seconds
          when v_path is not null and p_audio_seconds >= 0 then p_audio_seconds
        end,
        status = v_status,
        decided_at = case when v_status = 'pending' then null else decided_at end,
        decided_by = case when v_status = 'pending' then null else decided_by end
    where id = p_story;
    if v_status = 'pending' and v_story.status <> 'pending' then
      perform private.ask_story_approval(p_story, p_tree);
    end if;
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

  update public.stories
  set told_on = v_told, told_on_precision = v_precision
  where id = p_story
    and (told_on, told_on_precision) is distinct from (v_told, v_precision);

  -- The recording it no longer has, for the app to remove from storage.
  return jsonb_build_object(
    'status', v_status,
    'removed_audio', case when v_audio_changed then v_story.audio_path end
  );
end;
$$;

revoke all on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer) from public, anon;
grant execute on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer) to authenticated;
