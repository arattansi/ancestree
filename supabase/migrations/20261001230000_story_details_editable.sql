-- Step 99.6: a story's date told can be changed after it's told, with its
-- credits.
--
-- Aalim asked (2026-10-01): "let the date told be edited too".
-- `set_story_details` is `set_story_credits` (Step 99.5) and the date, saved
-- together from one dialog: the same people may (its teller, whoever can
-- edit the entry, or the person it's about; `private.can_edit_story_credits`
-- now covers the date too), the same checks on the credits, and the date
-- checked as `add_story` checks it. A null date clears it. No new approval.
--
-- Additive: the deployed app still calls `set_story_credits`, which stays
-- until this code is live; 20261001240000 then drops it.

create or replace function public.set_story_details(
  p_story uuid,
  p_tree uuid,
  p_storytellers uuid[],
  p_interviewers uuid[],
  -- Null, or left out, clears it.
  p_told_on date default null,
  p_told_precision text default null
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
  v_told date := p_told_on;
  v_precision text := case when p_told_on is null then null else coalesce(p_told_precision, 'day') end;
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

  update public.stories
  set told_on = v_told, told_on_precision = v_precision
  where id = p_story
    and (told_on, told_on_precision) is distinct from (v_told, v_precision);
end;
$$;

revoke all on function public.set_story_details(uuid, uuid, uuid[], uuid[], date, text) from public, anon;
grant execute on function public.set_story_details(uuid, uuid, uuid[], uuid[], date, text) to authenticated;
