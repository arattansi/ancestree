-- Step 116: a written story tags the people it mentions, and shows on
-- their sheets too.
--
-- Aalim asked (2026-10-03): "remove current tags for written stories.
-- replace with tags for people mentioned in the story", and, asked whether
-- such a story should show on the sheets of the people it mentions, as a
-- photo shows in the album of everyone in it: "Show on their sheets too".
--
--   * `story_mentions (story, person, status)`: who a story mentions, each
--     approved on its own, as a photo's tags are (Step 88.5): by the person
--     themself once their entry is theirs, else whoever can edit it
--     (`private.can_approve_story`), and at once where the teller could.
--     The story's own person is never among them. Recordings keep their
--     storyteller and interviewer credits; which a story gets is the app's
--     choice, not a rule here.
--   * Someone mentioned is asked only once the story shows (approved): until
--     then they couldn't read it. `add_story` asks when it's approved at
--     once, `decide_story` when it's approved, `edit_story` when it shows.
--   * An approved story is read, and commented on, by whoever can see its
--     own person, as before, or anyone who can see someone it mentions with
--     their yes (`private.can_read_story`). Whoever answers for someone it's
--     waiting on reads it too. Its links still come only from those who
--     see its own person (`can_share_story` is unchanged).
--   * New words from its teller go back to whoever else said yes to being
--     mentioned in the old ones, as a photo's do (Step 114).
--   * A mention is removed by its teller (editing), or by whoever answers
--     for or edits the person mentioned, from their sheet. Deleting someone
--     deletes their mentions; a merge (claim, invite, placeholder) doesn't
--     carry them over, which is a known gap.
--
-- `add_story`, `edit_story`, `decide_story`, `entry_stories`,
-- `private.can_see_story_comments` and `private.placeholder_entry_guard`
-- are made again from 20261003120000, 20260929180000, 20261001210000,
-- 20260929200000 and 20261001170000, with only the lines this step needs.
-- `add_story` and `edit_story` each take one more argument, defaulted, and
-- their old versions go in the same go, so the deployed app's calls (which
-- name only the old arguments) find the new ones.

-- 1. Who a story mentions.
create table public.story_mentions (
  story_id uuid not null references public.stories (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (auth_user_id) on delete set null,
  primary key (story_id, person_id),
  constraint story_mentions_status_check check (status in ('pending', 'approved', 'declined'))
);

create index story_mentions_person_idx on public.story_mentions (person_id);
create index story_mentions_decided_by_idx on public.story_mentions (decided_by);

-- 2. Who may read what.

-- Someone the story mentions makes it readable to the viewer: they can see
-- them and they said yes, or they answer for them and it waits on them.
create function private.story_mention_reader(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.story_mentions m
    where m.story_id = p_story
      and (
        (m.status = 'approved' and private.can_see_stories(m.person_id))
        or (m.status = 'pending' and private.can_approve_story(m.person_id))
      )
  );
$$;

-- An approved story the viewer may read: its own person's, or someone's
-- it mentions with their yes. Its comments go with it.
create function private.can_read_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story
      and s.status = 'approved'
      and (
        private.can_see_stories(s.person_id)
        or exists (
          select 1 from public.story_mentions m
          where m.story_id = s.id
            and m.status = 'approved'
            and private.can_see_stories(m.person_id)
        )
      )
  );
$$;

-- A mention the viewer may see: its teller and whoever answers for the
-- story's own person see them all; a reader sees those with a yes; whoever
-- answers for someone mentioned sees theirs.
create function private.can_see_story_mention(p_story uuid, p_person uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
      or private.can_approve_story(s.person_id)
      or (p_status = 'approved' and private.can_read_story(s.id))
      or private.can_approve_story(p_person)
    from public.stories s
    where s.id = p_story
  ), false);
$$;

-- Its teller, or whoever answers for or edits the person mentioned.
create function private.can_remove_story_mention(p_story uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
      or private.can_approve_story(p_person)
      or private.can_edit_person(p_person)
    from public.stories s
    where s.id = p_story
  ), false);
$$;

revoke all on function private.story_mention_reader(uuid) from public, anon;
revoke all on function private.can_read_story(uuid) from public, anon;
revoke all on function private.can_see_story_mention(uuid, uuid, text) from public, anon;
revoke all on function private.can_remove_story_mention(uuid, uuid) from public, anon;
grant execute on function private.story_mention_reader(uuid) to authenticated, service_role;
grant execute on function private.can_read_story(uuid) to authenticated, service_role;
grant execute on function private.can_see_story_mention(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.can_remove_story_mention(uuid, uuid) to authenticated, service_role;

alter table public.story_mentions enable row level security;

-- Written only through `add_story`, `edit_story` and
-- `decide_story_mention`; removed by whoever may remove it.
revoke all on table public.story_mentions from anon, authenticated, public;
grant select, delete on table public.story_mentions to authenticated;
grant all on table public.story_mentions to service_role;

create policy story_mentions_select on public.story_mentions
  for select to authenticated
  using ((select private.can_see_story_mention(story_mentions.story_id, story_mentions.person_id, story_mentions.status)));

create policy story_mentions_delete on public.story_mentions
  for delete to authenticated
  using ((select private.can_remove_story_mention(story_mentions.story_id, story_mentions.person_id)));

-- A story is read where it's mentioned, as well as where its person is.
drop policy stories_select on public.stories;
create policy stories_select on public.stories
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or case status
      when 'approved' then (select private.can_see_stories(stories.person_id))
        or (select private.story_mention_reader(stories.id))
      when 'pending' then (select private.can_approve_story(stories.person_id))
      else false
    end
  );

-- An approved story's comments: whoever may read the story (Step 88.4),
-- now where it's mentioned too.
create or replace function private.can_see_story_comments(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_read_story(p_story);
$$;

-- Only a placeholder's parent mentions it, as they alone credit or tag it.
create or replace function private.placeholder_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.person_id is null or not private.is_placeholder(new.person_id) then
    return new;
  end if;
  if tg_table_name = 'claims' then
    if exists (
      select 1 from private.claim_vouches v
      where v.user_id = new.claimant_user_id and v.person_id = new.person_id
    ) then
      return new;
    end if;
  elsif tg_table_name = 'invites' then
    if (select auth.uid()) is null
       or private.can_invite_to_claim_on(new.tree_id, new.person_id) then
      return new;
    end if;
  elsif tg_table_name in ('stories', 'album_tags', 'story_credits', 'story_mentions') then
    if private.is_own_child(new.person_id) then
      return new;
    end if;
  end if;
  raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
    using errcode = '42501';
end;
$$;

create trigger story_mentions_placeholder_guard
  before insert on public.story_mentions
  for each row execute function private.placeholder_entry_guard();

-- 3. Mentioning, and asking.

-- Who the story mentions becomes `p_people`, less its own person: someone
-- new is approved at once where the viewer could approve it, else waits;
-- someone left out goes. Someone new is on `p_tree` in full. Returns those
-- newly waiting.
create function private.set_story_mentions(p_story uuid, p_people uuid[], p_tree uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_about uuid;
  v_people uuid[];
  v_new uuid[] := '{}';
  v_person uuid;
begin
  select person_id into v_about from public.stories where id = p_story;
  v_people := array(
    select distinct x from unnest(coalesce(p_people, '{}'::uuid[])) as x
    where x is not null and x <> v_about
  );
  if cardinality(v_people) > 20 then
    raise exception 'STORY: too many people' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_people) as x
    where not exists (
      select 1 from public.story_mentions m where m.story_id = p_story and m.person_id = x
    )
    and not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, x))
  ) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;

  delete from public.story_mentions m
  where m.story_id = p_story and not (m.person_id = any (v_people));

  foreach v_person in array v_people loop
    if not exists (
      select 1 from public.story_mentions m where m.story_id = p_story and m.person_id = v_person
    ) then
      if private.can_approve_story(v_person) then
        insert into public.story_mentions (story_id, person_id, status, decided_at, decided_by)
        values (p_story, v_person, 'approved', now(), v_uid);
      else
        insert into public.story_mentions (story_id, person_id) values (p_story, v_person);
        v_new := v_new || v_person;
      end if;
    end if;
  end loop;
  return v_new;
end;
$$;

-- Asks whoever answers for each of `p_people` still waiting to be
-- mentioned in the story, one notice a recipient, in the teller's name: the
-- person themself, on a tree of theirs that shows them (the one it was told
-- on, if they're there); or, for an entry nobody is behind, its owner, the
-- Roots of its home tree and the Branches there who tend it (Step 68), as a
-- photo's tags are asked (`private.ask_photo_approval`, Step 114).
create function private.ask_story_mentions(p_story uuid, p_people uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories%rowtype;
  v_name text;
  v_about text;
  v_ask record;
begin
  select * into v_story from public.stories where id = p_story;
  if not found then
    return;
  end if;
  v_name := coalesce(private.member_label(v_story.created_by), 'A relative');
  v_about := private.person_label(v_story.person_id);
  for v_ask in
    with waiting as (
      select m.person_id as x from public.story_mentions m
      where m.story_id = p_story and m.status = 'pending'
        and m.person_id = any (coalesce(p_people, '{}'::uuid[]))
    ),
    asks as (
      select w.x as person, private.story_owner(w.x) as recipient, true as is_self,
        (
          select pl.tree_id
          from public.tree_placements pl
          join public.tree_members m
            on m.tree_id = pl.tree_id and m.user_id = private.story_owner(w.x)
          where pl.person_id = w.x and pl.status = 'active' and pl.detail = 'full'
          order by (pl.tree_id = v_story.tree_id) desc, (pl.tree_id = private.home_tree(w.x)) desc
          limit 1
        ) as tree
      from waiting w
      where private.story_owner(w.x) is not null
      union all
      select w.x, r.user_id, false, private.home_tree(w.x)
      from waiting w
      cross join lateral (
        select pe.owner_user_id as user_id from public.people pe where pe.id = w.x
        union
        select m.user_id from public.tree_members m
        where m.tree_id = private.home_tree(w.x) and m.role = 'admin'
        union
        select b.user_id from private.tending_branches(w.x) as b(user_id)
      ) r
      where private.story_owner(w.x) is null
    )
    select a.recipient,
      (array_agg(a.person order by a.is_self desc, a.person))[1] as person,
      (array_agg(a.is_self order by a.is_self desc, a.person))[1] as is_self,
      (array_agg(a.tree order by a.is_self desc, a.person))[1] as tree,
      count(distinct a.person) as n
    from asks a
    where a.recipient is not null
    group by a.recipient
  loop
    perform private.notify(
      v_ask.recipient, v_story.created_by, 'story_to_approve', v_ask.person, null,
      v_name || ' mentioned '
        || case when v_ask.is_self then 'you' else private.person_label(v_ask.person) end
        || case
             when v_ask.n = 2 then ' and 1 other'
             when v_ask.n > 2 then ' and ' || (v_ask.n - 1) || ' others'
             else ''
           end
        || ' in a story about ' || v_about || ', waiting for your approval.',
      coalesce(v_ask.tree, private.home_tree(v_ask.person))
    );
  end loop;
end;
$$;

revoke all on function private.set_story_mentions(uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function private.ask_story_mentions(uuid, uuid[]) from public, anon, authenticated;

-- 4. Telling one takes who it mentions.
drop function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[]);

create function public.add_story(
  p_person uuid,
  p_tree uuid,
  p_title text,
  p_body text,
  p_audio_path text default null,
  p_audio_seconds integer default null,
  p_told_on date default null,
  p_told_precision text default null,
  p_storytellers uuid[] default '{}',
  p_interviewers uuid[] default '{}',
  -- Who a written story mentions (Step 116).
  p_mentions uuid[] default '{}'
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
  v_waiting uuid[];
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

  -- Whoever it mentions is asked once the story shows (Step 116).
  v_waiting := private.set_story_mentions(v_id, p_mentions, p_tree);
  if v_approved and cardinality(v_waiting) > 0 then
    perform private.ask_story_mentions(v_id, v_waiting);
  end if;

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

revoke all on function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[], uuid[]) to authenticated;

-- 5. So does editing it, from its teller.
drop function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer);

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
  p_audio_seconds integer default null,
  -- Who it mentions, from its teller (Step 116); left alone when null.
  p_mentions uuid[] default null
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
  v_waiting uuid[] := '{}';
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
  if (p_edit_text or p_edit_audio or p_mentions is not null)
     and v_story.created_by is distinct from v_uid then
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

  -- New words go back to whoever else said yes to being mentioned in the
  -- old ones (Step 116), as a photo's do (Step 114).
  if v_text_changed then
    with again as (
      update public.story_mentions m
      set status = 'pending', decided_at = null, decided_by = null
      where m.story_id = p_story
        and m.status = 'approved'
        and not private.can_approve_story(m.person_id)
      returning m.person_id
    )
    select coalesce(array_agg(person_id), '{}') into v_waiting from again;
  end if;
  if p_mentions is not null then
    v_waiting := v_waiting || private.set_story_mentions(p_story, p_mentions, p_tree);
  end if;
  -- Asked now if the story shows; otherwise once it's approved.
  if v_status = 'approved' and cardinality(v_waiting) > 0 then
    perform private.ask_story_mentions(p_story, v_waiting);
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

revoke all on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer, uuid[]) from public, anon;
grant execute on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer, uuid[]) to authenticated;

-- 6. Approving it asks whoever it mentions.
create or replace function public.decide_story(p_story uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_story public.stories%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_story from public.stories where id = p_story;
  if not found or v_story.status <> 'pending' then
    raise exception 'STORY: already decided' using errcode = '22023';
  end if;
  if not private.can_approve_story(v_story.person_id) then
    raise exception 'STORY: not yours to approve' using errcode = '42501';
  end if;

  update public.stories
  set status = case when p_approve then 'approved' else 'declined' end,
    decided_at = now(),
    decided_by = v_uid
  where id = p_story;

  perform private.notify(
    v_story.created_by, v_uid,
    case when p_approve then 'story_approved' else 'story_declined' end,
    v_story.person_id, null,
    'Your story about ' || private.person_label(v_story.person_id)
      || case when p_approve then ' was approved.' else ' wasn''t approved.' end,
    v_story.tree_id
  );

  -- Now it shows, whoever it mentions is asked (Step 116).
  if p_approve then
    perform private.ask_story_mentions(
      p_story,
      array(
        select m.person_id from public.story_mentions m
        where m.story_id = p_story and m.status = 'pending'
      )
    );
  end if;
end;
$$;

-- 7. Answering a mention: whoever answers for the person mentioned.
create function public.decide_story_mention(p_story uuid, p_person uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select m.status into v_status from public.story_mentions m
  where m.story_id = p_story and m.person_id = p_person;
  if not found or v_status <> 'pending' then
    raise exception 'STORY: already decided' using errcode = '22023';
  end if;
  if not private.can_approve_story(p_person) then
    raise exception 'STORY: not yours to approve' using errcode = '42501';
  end if;
  update public.story_mentions
  set status = case when p_approve then 'approved' else 'declined' end,
    decided_at = now(),
    decided_by = v_uid
  where story_id = p_story and person_id = p_person;
end;
$$;

revoke all on function public.decide_story_mention(uuid, uuid, boolean) from public, anon;
grant execute on function public.decide_story_mention(uuid, uuid, boolean) to authenticated;

-- 8. A sheet lists the stories that mention its person, and says who
-- each story mentions. Its columns change, so it's made again.
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
  can_edit_credits boolean,
  -- Step 116: who the story is about (another, when it's here because it
  -- mentions them), whoever it mentions, and this person's mention.
  about_id uuid,
  about_name text,
  mentions jsonb,
  mention_status text,
  can_decide_mention boolean,
  can_remove_mention boolean
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
    private.can_edit_story_credits(s.id),
    s.person_id,
    private.person_label(s.person_id),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', m.person_id, 'name', private.person_label(m.person_id), 'status', m.status)
          order by private.person_label(m.person_id)
        )
        from public.story_mentions m
        where m.story_id = s.id
      ),
      '[]'::jsonb
    ),
    mm.status,
    mm.status = 'pending' and private.can_approve_story(p_person),
    mm.status is not null
      and (private.can_approve_story(p_person) or private.can_edit_person(p_person))
  from public.stories s
  cross join lateral (select private.can_share_story(s.id) as can_share) x
  left join public.story_mentions mm on mm.story_id = s.id and mm.person_id = p_person
  where s.person_id = p_person
    -- A story it mentions them in, once it shows: approved there, or
    -- waiting on whoever answers for them, or for its teller to see.
    or (
      s.status = 'approved'
      and (
        mm.status = 'approved'
        or (
          mm.status = 'pending'
          and (private.can_approve_story(p_person) or s.created_by = (select auth.uid()))
        )
      )
    )
  order by s.created_at desc;
$$;

revoke all on function public.entry_stories(uuid) from public, anon;
grant execute on function public.entry_stories(uuid) to authenticated;
