-- Step 113: a written story may be ten times longer.
--
-- Aalim asked (2026-10-03) why stories had a character limit. The 20,000
-- was my own default from Step 88.3, about 3,500 words: too short for a
-- full life story. Now 200,000 characters, about 35,000 words. A cap stays
-- because the text goes to the server in one request (Next caps a server
-- action at 1 MB, which 200,000 characters always fit) and the sheet loads
-- a person's stories whole.
--
-- The check on `stories.body` and its two writers, `add_story` (from
-- 20261001160000) and `edit_story` (from 20261001270000), are made again
-- with only that number changed. Their grants stay.

alter table public.stories drop constraint stories_body_check;
alter table public.stories add constraint stories_body_check
  check (body is null or length(btrim(body)) between 1 and 200000);

create or replace function public.add_story(
  p_person uuid,
  p_tree uuid,
  p_title text,
  p_body text,
  p_audio_path text default null,
  p_audio_seconds integer default null,
  p_told_on date default null,
  p_told_precision text default null,
  p_storytellers uuid[] default '{}',
  p_interviewers uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_path text := nullif(btrim(coalesce(p_audio_path, '')), '');
  v_tellers uuid[] := array(
    select distinct x from unnest(coalesce(p_storytellers, '{}'::uuid[])) as x where x is not null
  );
  v_askers uuid[] := array(
    select distinct x from unnest(coalesce(p_interviewers, '{}'::uuid[])) as x where x is not null
  );
  v_told date := p_told_on;
  v_precision text := case when p_told_on is null then null else coalesce(p_told_precision, 'day') end;
  v_approved boolean;
  v_home uuid;
  v_owner uuid;
  v_self uuid;
  v_tree uuid;
  v_name text;
  v_label text;
  v_id uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_body is null and v_path is null then
    raise exception 'STORY: nothing to tell' using errcode = '22023';
  end if;
  if length(v_title) > 120 or length(v_body) > 200000 then
    raise exception 'STORY: longer than a story may be' using errcode = '22001';
  end if;
  if cardinality(v_tellers) > 10 or cardinality(v_askers) > 10 then
    raise exception 'STORY: too many people' using errcode = '22023';
  end if;
  if v_told is not null then
    if v_precision not in ('day', 'month', 'year') then
      raise exception 'STORY: not a date told' using errcode = '22023';
    end if;
    -- Kept on the first day of as much of it as is known.
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
  if not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, p_person)) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(v_tellers || v_askers) as x
    where not private.is_placed_in_full(p_tree, x)
  ) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;
  if v_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'stories'
      and o.name = v_path
      and o.owner_id = v_uid::text
      and (storage.foldername(o.name))[1] = p_person::text
  ) then
    raise exception 'STORY: that recording didn''t arrive' using errcode = '22023';
  end if;

  v_approved := private.can_approve_story(p_person);
  insert into public.stories
    (person_id, tree_id, created_by, title, body, audio_path, audio_seconds,
     told_on, told_on_precision, status, decided_at, decided_by)
  values (
    p_person, p_tree, v_uid, v_title, v_body, v_path,
    case when p_audio_seconds >= 0 then p_audio_seconds end,
    v_told, v_precision,
    case when v_approved then 'approved' else 'pending' end,
    case when v_approved then now() end,
    case when v_approved then v_uid end
  )
  returning id into v_id;

  insert into public.story_credits (story_id, person_id, role)
  select v_id, x, 'storyteller' from unnest(v_tellers) as x
  union all
  select v_id, x, 'interviewer' from unnest(v_askers) as x;

  if not v_approved then
    v_name := coalesce(private.member_label(v_uid), 'A relative');
    v_self := private.story_owner(p_person);
    select tree_id, owner_user_id into v_home, v_owner
    from public.people where id = p_person;

    if v_self is not null then
      -- Asked of the person themself, on a tree of theirs that shows them:
      -- this one if they're on it.
      select pl.tree_id into v_tree
      from public.tree_placements pl
      join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_self
      where pl.person_id = p_person and pl.status = 'active' and pl.detail = 'full'
      order by (pl.tree_id = p_tree) desc, (pl.tree_id = v_home) desc
      limit 1;
      perform private.notify(
        v_self, v_uid, 'story_to_approve', p_person, null,
        v_name || ' added a story about you, waiting for your approval.',
        coalesce(v_tree, v_home)
      );
    else
      -- Asked of whoever can edit it: its owner, the Roots of its home tree
      -- and the Branches there who tend it, as a suggested change is (Step 68).
      v_label := private.person_label(p_person);
      for v_recipient in
        select v_owner
        union
        select m.user_id from public.tree_members m
        where m.tree_id = v_home and m.role = 'admin'
        union
        select b.user_id from private.tending_branches(p_person) as b(user_id)
      loop
        perform private.notify(
          v_recipient, v_uid, 'story_to_approve', p_person, null,
          v_name || ' added a story about ' || v_label || ', waiting for your approval.',
          v_home
        );
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'status', case when v_approved then 'approved' else 'pending' end
  );
end;
$$;

create or replace function public.edit_story(
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
  if length(v_title) > 120 or length(v_body) > 200000 then
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
