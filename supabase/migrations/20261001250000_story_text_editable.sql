-- Step 99.7: a story's text can be edited after it's told.
--
-- Aalim asked (2026-10-01): "let the story text be edited too".
-- `edit_story` is `set_story_details` (Steps 99.5, 99.6) and, from its
-- teller alone, its title and its text, all saved together from one dialog.
-- Whoever approves a story said yes to its words, so new words from someone
-- who couldn't approve them wait again: an approved story goes back to
-- waiting (it's hidden from the family and its links pause until it's
-- approved again), a declined one is asked again (as "edit and resend",
-- Step 71), and its approver hears, as when it was first told. Someone who
-- may approve it keeps it as it was. Credits and the date need no new yes.
-- Comments, links and the recording stay.
--
-- Additive: the deployed app still calls `set_story_details`, which stays
-- until this code is live; 20261001260000 then drops it.

-- Ask whoever approves a story about a person to look at it: the person
-- themself, on a tree of theirs that shows them (`p_tree` if it does); or,
-- for an entry nobody is behind, its owner, the Roots of its home tree and
-- the Branches there who tend it, as `add_story` asks (Step 88.3).
create or replace function private.ask_story_approval(p_story uuid, p_tree uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_name text;
  v_self uuid;
  v_home uuid;
  v_owner uuid;
  v_tree uuid;
  v_label text;
  v_recipient uuid;
begin
  select person_id into v_person from public.stories where id = p_story;
  if v_person is null then
    return;
  end if;
  v_name := coalesce(private.member_label(v_uid), 'A relative');
  v_self := private.story_owner(v_person);
  select tree_id, owner_user_id into v_home, v_owner
  from public.people where id = v_person;

  if v_self is not null then
    select pl.tree_id into v_tree
    from public.tree_placements pl
    join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_self
    where pl.person_id = v_person and pl.status = 'active' and pl.detail = 'full'
    order by (pl.tree_id = p_tree) desc, (pl.tree_id = v_home) desc
    limit 1;
    perform private.notify(
      v_self, v_uid, 'story_to_approve', v_person, null,
      v_name || ' edited a story about you, waiting for your approval.',
      coalesce(v_tree, v_home)
    );
  else
    v_label := private.person_label(v_person);
    for v_recipient in
      select v_owner
      union
      select m.user_id from public.tree_members m
      where m.tree_id = v_home and m.role = 'admin'
      union
      select b.user_id from private.tending_branches(v_person) as b(user_id)
    loop
      perform private.notify(
        v_recipient, v_uid, 'story_to_approve', v_person, null,
        v_name || ' edited a story about ' || v_label || ', waiting for your approval.',
        v_home
      );
    end loop;
  end if;
end;
$$;

revoke all on function private.ask_story_approval(uuid, uuid) from public, anon;
grant execute on function private.ask_story_approval(uuid, uuid) to authenticated, service_role;

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
  p_body text default null
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
  v_status text;
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
  if p_edit_text and v_story.created_by is distinct from v_uid then
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
  if p_edit_text then
    if v_body is null and v_story.audio_path is null then
      raise exception 'STORY: nothing to tell' using errcode = '22023';
    end if;
    if length(v_title) > 120 or length(v_body) > 20000 then
      raise exception 'STORY: longer than a story may be' using errcode = '22001';
    end if;
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

  -- New words: from someone who couldn't approve them, they wait again.
  if p_edit_text
     and (v_title, v_body) is distinct from (v_story.title, v_story.body) then
    if not private.can_approve_story(v_story.person_id) and v_story.status <> 'pending' then
      v_status := 'pending';
    end if;
    update public.stories
    set title = v_title,
        body = v_body,
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

  return jsonb_build_object('status', v_status);
end;
$$;

revoke all on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text) from public, anon;
grant execute on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text) to authenticated;
