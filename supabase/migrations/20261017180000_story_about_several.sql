-- Step 183: a story about several people, on each of their sheets.
--
-- Aalim asked (2026-10-17): "for stories, i want to adapt the attribution
-- such that a story can be about multiple people and so they can show up in
-- each individual node", and, asked how that sits beside the people a
-- written story mentions (Step 116), chose to fold mentions into it: one
-- "About" list, on written stories and recordings alike, and everyone in it
-- has the story on their sheet as their own, as a photo shows in the album
-- of everyone in it (Step 88.5).
--
--   * `story_mentions` becomes `story_subjects`: everyone a story is about,
--     the person it was first told about too, each with their own answer.
--     Each is answered as a story always was (`private.can_approve_story`:
--     the person themself once their entry is theirs, else whoever can
--     edit it), and at once where the teller could. Nobody is asked to wait
--     for anyone else's yes: each yes shows it on that person's sheet.
--   * `stories.status` follows them: approved once anyone said yes, waiting
--     while anyone's still asked, else declined. What reads it as "it
--     shows somewhere" (links, comments, the newsletter's catch-up) stays
--     right.
--   * `stories.person_id` is now only whom it was first told about: its
--     recording's folder, and where a link with no sheet in mind opens it.
--     If they leave it, or their entry is deleted, the next it's about
--     takes their place, those who said yes first; it goes with its last.
--   * A story is read by whoever sees someone it's about who said yes, or
--     answers for someone it waits on. Its links work while everyone who
--     said yes may be shown to visitors, from a sharer on a tree that shows
--     one of them. Anyone it's about, or who edits them, may stop them.
--   * Someone leaves a story (`remove_story_subject`) at their own word,
--     their editors', or its teller's, while it's about someone else too;
--     the last one's way out is deleting it. Deleting a story is its
--     teller's, or someone's who could edit everyone it's about.
--   * New words go back to everyone else who'd said yes to the old ones, or
--     no, as the story's own person's did (Step 99.7).
--   * Merging an entry into another (a claim, an invite, a placeholder)
--     carries its place in a story over, which mentions didn't.
--
-- `add_story` and `edit_story` take `p_about`, everyone it's about; their
-- `p_mentions` stays for the phone builds already out (148.5), and means
-- everyone else it's about. `decide_story` takes whose yes it is
-- (`p_person`, its first person when left out). `decide_story_mention`
-- stays, as `decide_story`, until the web that calls it is gone; a later
-- migration drops it.
--
-- `add_story`, `edit_story`, `decide_story`, `entry_stories`,
-- `add_story_comment`, `shared_story`, `story_place`, the link and credit
-- helpers, `private.placeholder_entry_guard`, `private.can_delete_person`,
-- `private.is_own_placeholder`, `public.claim_person` and
-- `private.merge_invited_entry` are made again from their live bodies
-- (2026-10-17), with only the lines this step needs.

-- 1. Everyone a story is about.
alter table public.story_mentions rename to story_subjects;
alter table public.story_subjects rename constraint story_mentions_pkey to story_subjects_pkey;
alter table public.story_subjects rename constraint story_mentions_status_check to story_subjects_status_check;
alter table public.story_subjects rename constraint story_mentions_story_id_fkey to story_subjects_story_id_fkey;
alter table public.story_subjects rename constraint story_mentions_person_id_fkey to story_subjects_person_id_fkey;
alter table public.story_subjects rename constraint story_mentions_decided_by_fkey to story_subjects_decided_by_fkey;
alter index public.story_mentions_person_idx rename to story_subjects_person_idx;
alter index public.story_mentions_decided_by_idx rename to story_subjects_decided_by_idx;
alter trigger story_mentions_placeholder_guard on public.story_subjects
  rename to story_subjects_placeholder_guard;
alter table public.story_subjects
  add constraint story_subjects_decided check ((status = 'pending') = (decided_at is null));

-- Whom each story was told about, with the answer it has.
alter table public.story_subjects disable trigger story_subjects_placeholder_guard;
insert into public.story_subjects (story_id, person_id, status, created_at, decided_at, decided_by)
select s.id, s.person_id, s.status, s.created_at, s.decided_at, s.decided_by
from public.stories s
on conflict (story_id, person_id) do nothing;
alter table public.story_subjects enable trigger story_subjects_placeholder_guard;

-- 2. A story shows once anyone it's about said yes.
create function private.story_follows_its_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story uuid := coalesce(new.story_id, old.story_id);
  v_status text;
  v_at timestamptz;
  v_by uuid;
begin
  select
    case
      when bool_or(a.status = 'approved') then 'approved'
      when bool_or(a.status = 'pending') then 'pending'
      else 'declined'
    end
  into v_status
  from public.story_subjects a
  where a.story_id = v_story
  having count(*) > 0;
  -- Nobody left: the story is going too.
  if v_status is null then
    return null;
  end if;
  if v_status <> 'pending' then
    select a.decided_at, a.decided_by into v_at, v_by
    from public.story_subjects a
    where a.story_id = v_story and a.status = v_status
    order by a.decided_at, a.person_id
    limit 1;
  end if;
  update public.stories s
  set status = v_status, decided_at = v_at, decided_by = v_by
  where s.id = v_story
    and (s.status, s.decided_at, s.decided_by) is distinct from (v_status, v_at, v_by);
  return null;
end;
$$;

create trigger story_subjects_status
  after insert or update or delete on public.story_subjects
  for each row execute function private.story_follows_its_people();

-- 3. Whom it's first about, when that one goes.

-- Who takes a story's first place from `p_except`: those who said yes,
-- then those asked, longest about it first.
create function private.next_story_subject(p_story uuid, p_except uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.person_id
  from public.story_subjects a
  where a.story_id = p_story and a.person_id <> p_except
  order by (a.status = 'approved') desc, (a.status = 'pending') desc, a.created_at, a.person_id
  limit 1;
$$;

-- `p_person` leaves the story; if it was first about them, the next one
-- takes their place. Its last can't leave: the story goes instead.
create function private.unseat_story_subject(p_story uuid, p_person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next uuid;
begin
  if exists (select 1 from public.stories s where s.id = p_story and s.person_id = p_person) then
    v_next := private.next_story_subject(p_story, p_person);
    if v_next is null then
      raise exception 'STORY: it''s only about them' using errcode = '22023';
    end if;
    update public.stories set person_id = v_next where id = p_story;
  end if;
  delete from public.story_subjects a where a.story_id = p_story and a.person_id = p_person;
end;
$$;

-- An entry's deletion takes only the stories about nobody else.
create function private.people_hand_on_stories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stories s
  set person_id = private.next_story_subject(s.id, old.id)
  where s.person_id = old.id
    and private.next_story_subject(s.id, old.id) is not null;
  return old;
end;
$$;

create trigger people_hand_on_stories
  before delete on public.people
  for each row execute function private.people_hand_on_stories();

revoke all on function private.story_follows_its_people() from public, anon, authenticated;
revoke all on function private.next_story_subject(uuid, uuid) from public, anon, authenticated;
revoke all on function private.unseat_story_subject(uuid, uuid) from public, anon, authenticated;
revoke all on function private.people_hand_on_stories() from public, anon, authenticated;

-- 4. Who may read what.
drop policy stories_select on public.stories;
drop policy stories_delete on public.stories;
drop policy story_mentions_select on public.story_subjects;
drop policy story_mentions_delete on public.story_subjects;
drop function private.story_mention_reader(uuid);
drop function private.can_see_story_mention(uuid, uuid, text);
drop function private.can_remove_story_mention(uuid, uuid);

-- A story the viewer may read: someone it's about who said yes is theirs to
-- see, or someone it waits on is theirs to answer for.
create function private.story_reader(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.story_subjects a
    where a.story_id = p_story
      and (
        (a.status = 'approved' and private.can_see_stories(a.person_id))
        or (a.status = 'pending' and private.can_approve_story(a.person_id))
      )
  );
$$;

-- A story that shows to the viewer: someone it's about said yes, and they
-- see them. Its comments go with it.
create or replace function private.can_read_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.story_subjects a
    where a.story_id = p_story
      and a.status = 'approved'
      and private.can_see_stories(a.person_id)
  );
$$;

-- Whom a story is about, as the viewer may see it: its teller sees them
-- all; whoever answers for someone sees theirs; a reader sees those who
-- said yes.
create function private.can_see_story_subject(p_story uuid, p_person uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false)
    or private.can_approve_story(p_person)
    or (p_status = 'approved' and private.story_reader(p_story));
$$;

-- Who may take someone off a story: its teller, or whoever answers for or
-- edits them.
create function private.can_remove_story_subject(p_story uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false)
    or private.can_approve_story(p_person)
    or private.can_edit_person(p_person);
$$;

-- Who may delete a story: its teller, or someone who could edit everyone
-- it's about, so it leaves nobody else's sheet.
create function private.can_delete_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false)
    or (
      exists (select 1 from public.story_subjects a where a.story_id = p_story)
      and not exists (
        select 1 from public.story_subjects a
        where a.story_id = p_story and not private.can_edit_person(a.person_id)
      )
    );
$$;

-- Someone who said yes to it is hidden from visitors (Step 88.4).
create function private.story_hidden_from_visitors(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.story_subjects a
    join public.people pe on pe.id = a.person_id
    where a.story_id = p_story and a.status = 'approved' and pe.hidden_from_visitors
  );
$$;

-- "Amina Khan", "Amina Khan and Hassan Khan", "Amina Khan and 2 others":
-- whom it's about who said yes (or everyone, while nobody has), first
-- whom it was first told about.
create function private.story_about_label(p_story uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with shown as (
    select a.person_id,
      (a.person_id = s.person_id) as first
    from public.story_subjects a
    join public.stories s on s.id = a.story_id
    where a.story_id = p_story
      and (
        a.status = 'approved'
        or not exists (
          select 1 from public.story_subjects o
          where o.story_id = p_story and o.status = 'approved'
        )
      )
  ),
  named as (
    select private.person_label(person_id) as name,
      row_number() over (order by first desc, private.person_label(person_id), person_id) as n,
      count(*) over () as total
    from shown
  )
  select case
    when max(total) = 1 then max(name) filter (where n = 1)
    when max(total) = 2 then max(name) filter (where n = 1) || ' and ' || max(name) filter (where n = 2)
    else max(name) filter (where n = 1) || ' and ' || (max(total) - 1) || ' others'
  end
  from named;
$$;

revoke all on function private.story_reader(uuid) from public, anon;
revoke all on function private.can_see_story_subject(uuid, uuid, text) from public, anon;
revoke all on function private.can_remove_story_subject(uuid, uuid) from public, anon;
revoke all on function private.can_delete_story(uuid) from public, anon;
revoke all on function private.story_hidden_from_visitors(uuid) from public, anon;
revoke all on function private.story_about_label(uuid) from public, anon;
grant execute on function private.story_reader(uuid) to authenticated, service_role;
grant execute on function private.can_see_story_subject(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.can_remove_story_subject(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_delete_story(uuid) to authenticated, service_role;
grant execute on function private.story_hidden_from_visitors(uuid) to authenticated, service_role;
grant execute on function private.story_about_label(uuid) to authenticated, service_role;

create policy stories_select on public.stories
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.story_reader(stories.id))
  );

create policy stories_delete on public.stories
  for delete to authenticated
  using ((select private.can_delete_story(stories.id)));

-- Written only through `add_story`, `edit_story`, `decide_story` and
-- `remove_story_subject`.
revoke all on table public.story_subjects from anon, authenticated, public;
grant select on table public.story_subjects to authenticated;
grant all on table public.story_subjects to service_role;

create policy story_subjects_select on public.story_subjects
  for select to authenticated
  using ((select private.can_see_story_subject(story_subjects.story_id, story_subjects.person_id, story_subjects.status)));

-- 5. Links, comments and credits follow everyone it's about.

-- The viewer may share it: it shows to them, nobody who said yes to it is
-- hidden from visitors, and its links aren't off, unless they could have
-- turned them off.
create or replace function private.can_share_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_read_story(s.id)
      and not private.story_hidden_from_visitors(s.id)
      and (not s.links_off or private.can_stop_story_links(s.id))
    from public.stories s
    where s.id = p_story
  ), false);
$$;

-- A link works while the story shows, its links aren't off, nobody who
-- said yes to it is hidden from visitors, and its sharer is on a tree that
-- shows one of them in full.
create or replace function private.story_link_live(p_story uuid, p_sharer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stories s
    where s.id = p_story
      and s.status = 'approved'
      and not s.links_off
      and not private.story_hidden_from_visitors(s.id)
      and exists (
        select 1
        from public.story_subjects a
        join public.tree_placements pl on pl.person_id = a.person_id
        join public.tree_members m on m.tree_id = pl.tree_id
        where a.story_id = s.id
          and a.status = 'approved'
          and pl.status = 'active'
          and pl.detail = 'full'
          and m.user_id = p_sharer
      )
  );
$$;

-- Its teller, anyone it's about, or whoever edits one of them.
create or replace function private.can_stop_story_links(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false)
    or exists (
      select 1 from public.story_subjects a
      where a.story_id = p_story
        and (
          private.story_owner(a.person_id) = (select auth.uid())
          or private.can_edit_person(a.person_id)
        )
    );
$$;

-- Its teller, or whoever edits someone it's about who didn't say no.
create or replace function private.can_tend_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false)
    or exists (
      select 1 from public.story_subjects a
      where a.story_id = p_story
        and a.status <> 'declined'
        and private.can_edit_person(a.person_id)
    );
$$;

-- Its teller, or someone it's about who didn't say no, or whoever edits
-- one of them.
create or replace function private.can_edit_story_credits(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
    from public.stories s
    where s.id = p_story
  ), false)
    or exists (
      select 1 from public.story_subjects a
      where a.story_id = p_story
        and a.status <> 'declined'
        and (
          private.can_edit_person(a.person_id)
          or private.story_owner(a.person_id) = (select auth.uid())
        )
    );
$$;

-- 6. Saying whom it's about, and asking.
drop function private.set_story_mentions(uuid, uuid[], uuid);
drop function private.ask_story_mentions(uuid, uuid[]);
drop function private.ask_story_approval(uuid, uuid);

-- Whom the story is about becomes `p_people`: someone new is approved at
-- once where the viewer could approve it, else waits; someone left out
-- goes, the first handing on to the next. Someone new is on `p_tree` in
-- full. Returns those newly waiting.
create function private.set_story_subjects(p_story uuid, p_people uuid[], p_tree uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_people uuid[] := array(
    select distinct x from unnest(coalesce(p_people, '{}'::uuid[])) as x where x is not null
  );
  v_new uuid[] := '{}';
  v_person uuid;
begin
  if cardinality(v_people) = 0 then
    raise exception 'STORY: about nobody' using errcode = '22023';
  end if;
  if cardinality(v_people) > 20 then
    raise exception 'STORY: too many people' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_people) as x
    where not exists (
      select 1 from public.story_subjects a where a.story_id = p_story and a.person_id = x
    )
    and not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, x))
  ) then
    raise exception 'STORY: not on your tree' using errcode = '42501';
  end if;

  foreach v_person in array v_people loop
    if not exists (
      select 1 from public.story_subjects a where a.story_id = p_story and a.person_id = v_person
    ) then
      if private.can_approve_story(v_person) then
        insert into public.story_subjects (story_id, person_id, status, decided_at, decided_by)
        values (p_story, v_person, 'approved', now(), v_uid);
      else
        insert into public.story_subjects (story_id, person_id) values (p_story, v_person);
        v_new := v_new || v_person;
      end if;
    end if;
  end loop;

  for v_person in
    select a.person_id from public.story_subjects a
    where a.story_id = p_story and not (a.person_id = any (v_people))
  loop
    perform private.unseat_story_subject(p_story, v_person);
  end loop;
  return v_new;
end;
$$;

-- Asks whoever answers for each of `p_people` still waiting on the story,
-- one notice a recipient, in the viewer's name: the person themself, on a
-- tree of theirs that shows them (`p_tree`, if they're there); or, for an
-- entry nobody is behind, its owner, the Roots of its home tree and the
-- Branches there who tend it (Step 68), as a photo's tags are asked
-- (`private.ask_photo_approval`, Step 114). `p_edited`: new words, asked
-- again.
create function private.ask_story_subjects(p_story uuid, p_people uuid[], p_edited boolean, p_tree uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_story public.stories%rowtype;
  v_name text;
  v_ask record;
begin
  select * into v_story from public.stories where id = p_story;
  if not found or cardinality(coalesce(p_people, '{}'::uuid[])) = 0 then
    return;
  end if;
  v_name := coalesce(private.member_label(v_uid), 'A relative');
  for v_ask in
    with waiting as (
      select a.person_id as x from public.story_subjects a
      where a.story_id = p_story and a.status = 'pending'
        and a.person_id = any (p_people)
    ),
    asks as (
      select w.x as person, private.story_owner(w.x) as recipient, true as is_self,
        (
          select pl.tree_id
          from public.tree_placements pl
          join public.tree_members m
            on m.tree_id = pl.tree_id and m.user_id = private.story_owner(w.x)
          where pl.person_id = w.x and pl.status = 'active' and pl.detail = 'full'
          order by (pl.tree_id = coalesce(p_tree, v_story.tree_id)) desc,
            (pl.tree_id = private.home_tree(w.x)) desc
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
      v_ask.recipient, v_uid, 'story_to_approve', v_ask.person, null,
      v_name || case when p_edited then ' edited' else ' added' end || ' a story about '
        || case when v_ask.is_self then 'you' else private.person_label(v_ask.person) end
        || case
             when v_ask.n = 2 then ' and 1 other'
             when v_ask.n > 2 then ' and ' || (v_ask.n - 1) || ' others'
             else ''
           end
        || ', waiting for your approval.',
      coalesce(v_ask.tree, private.home_tree(v_ask.person))
    );
  end loop;
end;
$$;

revoke all on function private.set_story_subjects(uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function private.ask_story_subjects(uuid, uuid[], boolean, uuid) from public, anon, authenticated;

-- 7. Telling one says everyone it's about.
drop function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[], uuid[]);

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
  -- Everyone else it's about: the phone builds already out (148.5).
  p_mentions uuid[] default '{}',
  -- Everyone else it's about (Step 183); `p_person` is the first.
  p_about uuid[] default '{}'
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
  v_about uuid[] := array[p_person] || coalesce(p_about, '{}'::uuid[]) || coalesce(p_mentions, '{}'::uuid[]);
  v_told date := p_told_on;
  v_precision text := case when p_told_on is null then null else coalesce(p_told_precision, 'day') end;
  v_id uuid;
  v_waiting uuid[];
  v_status text;
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
  -- Its recording is in the folder of someone it's about.
  if v_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'stories'
      and o.name = v_path
      and o.owner_id = v_uid::text
      and (storage.foldername(o.name))[1] = any (array(select x::text from unnest(v_about) as x))
  ) then
    raise exception 'STORY: that recording didn''t arrive' using errcode = '22023';
  end if;

  -- Waiting until someone it's about says yes (`story_subjects_status`).
  insert into public.stories
    (person_id, tree_id, created_by, title, body, audio_path, audio_seconds,
     told_on, told_on_precision, status)
  values (
    p_person, p_tree, v_uid, v_title, v_body, v_path,
    case when p_audio_seconds >= 0 then p_audio_seconds end,
    v_told, v_precision, 'pending'
  )
  returning id into v_id;

  insert into public.story_credits (story_id, person_id, role)
  select v_id, x, 'storyteller' from unnest(v_tellers) as x
  union all
  select v_id, x, 'interviewer' from unnest(v_askers) as x;

  v_waiting := private.set_story_subjects(v_id, v_about, p_tree);
  perform private.ask_story_subjects(v_id, v_waiting, false, p_tree);

  select status into v_status from public.stories where id = v_id;
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

revoke all on function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.add_story(uuid, uuid, text, text, text, integer, date, text, uuid[], uuid[], uuid[], uuid[]) to authenticated;

-- 8. So does editing it, from its teller.
drop function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer, uuid[]);

create function public.edit_story(
  p_story uuid,
  p_tree uuid,
  p_storytellers uuid[],
  p_interviewers uuid[],
  p_told_on date default null,
  p_told_precision text default null,
  p_edit_text boolean default false,
  p_title text default null,
  p_body text default null,
  p_edit_audio boolean default false,
  p_audio_path text default null,
  p_audio_seconds integer default null,
  -- Everyone else it's about, its first person kept: the phone builds
  -- already out (148.5). Null leaves them be.
  p_mentions uuid[] default null,
  -- Everyone it's about (Step 183). Null leaves them be.
  p_about uuid[] default null
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
  v_about uuid[];
  v_text_changed boolean := false;
  v_audio_changed boolean := false;
  v_again uuid[] := '{}';
  v_new uuid[] := '{}';
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_story from public.stories where id = p_story;
  if not found then
    raise exception 'STORY: not a story you can see' using errcode = '42501';
  end if;
  if not private.can_edit_story_credits(p_story) then
    raise exception 'STORY: not yours to credit' using errcode = '42501';
  end if;
  if (p_edit_text or p_edit_audio or p_mentions is not null or p_about is not null)
     and v_story.created_by is distinct from v_uid then
    raise exception 'STORY: not yours to edit' using errcode = '42501';
  end if;
  v_about := case
    when p_about is not null then p_about
    when p_mentions is not null then array[v_story.person_id] || p_mentions
  end;
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
  -- A new recording is one its teller uploaded to the folder of someone
  -- it's about.
  if v_audio_changed and v_path is not null and not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'stories'
      and o.name = v_path
      and o.owner_id = v_uid::text
      and (
        (storage.foldername(o.name))[1] = any (array(select x::text from unnest(coalesce(v_about, '{}'::uuid[])) as x))
        or exists (
          select 1 from public.story_subjects a
          where a.story_id = p_story and a.person_id::text = (storage.foldername(o.name))[1]
        )
      )
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

  if v_text_changed or v_audio_changed then
    update public.stories
    set title = v_title,
        body = v_body,
        audio_path = v_path,
        audio_seconds = case
          when not v_audio_changed then audio_seconds
          when v_path is not null and p_audio_seconds >= 0 then p_audio_seconds
        end
    where id = p_story;
    -- New words or a new recording go back to whoever else answered the
    -- old ones, as a photo's do (Step 114).
    with again as (
      update public.story_subjects a
      set status = 'pending', decided_at = null, decided_by = null
      where a.story_id = p_story
        and a.status <> 'pending'
        and not private.can_approve_story(a.person_id)
      returning a.person_id
    )
    select coalesce(array_agg(person_id), '{}') into v_again from again;
  end if;
  if v_about is not null then
    v_new := private.set_story_subjects(p_story, v_about, p_tree);
  end if;
  perform private.ask_story_subjects(p_story, v_again, true, p_tree);
  perform private.ask_story_subjects(
    p_story, array(select x from unnest(v_new) as x where not (x = any (v_again))), false, p_tree
  );

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

  select status into v_status from public.stories where id = p_story;
  -- The recording it no longer has, for the app to remove from storage.
  return jsonb_build_object(
    'status', v_status,
    'removed_audio', case when v_audio_changed then v_story.audio_path end
  );
end;
$$;

revoke all on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer, uuid[], uuid[]) from public, anon;
grant execute on function public.edit_story(uuid, uuid, uuid[], uuid[], date, text, boolean, text, text, boolean, text, integer, uuid[], uuid[]) to authenticated;

-- 9. Each answers for their own, and may leave.
drop function public.decide_story(uuid, boolean);

-- `p_person`'s answer to the story, from whoever answers for them; its
-- first person's when left out. The teller hears either way.
create function public.decide_story(p_story uuid, p_approve boolean, p_person uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_story public.stories%rowtype;
  v_person uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_story from public.stories where id = p_story;
  v_person := coalesce(p_person, v_story.person_id);
  select a.status into v_status from public.story_subjects a
  where a.story_id = p_story and a.person_id = v_person;
  if v_status is distinct from 'pending' then
    raise exception 'STORY: already decided' using errcode = '22023';
  end if;
  if not private.can_approve_story(v_person) then
    raise exception 'STORY: not yours to approve' using errcode = '42501';
  end if;

  update public.story_subjects
  set status = case when p_approve then 'approved' else 'declined' end,
    decided_at = now(),
    decided_by = v_uid
  where story_id = p_story and person_id = v_person;

  perform private.notify(
    v_story.created_by, v_uid,
    case when p_approve then 'story_approved' else 'story_declined' end,
    v_person, null,
    'Your story about ' || private.person_label(v_person)
      || case when p_approve then ' was approved.' else ' wasn''t approved.' end,
    v_story.tree_id
  );
end;
$$;

revoke all on function public.decide_story(uuid, boolean, uuid) from public, anon;
grant execute on function public.decide_story(uuid, boolean, uuid) to authenticated;

-- The web deployed before this step answers a mention through this.
create or replace function public.decide_story_mention(p_story uuid, p_person uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.decide_story(p_story, p_approve, p_person);
end;
$$;

-- Take `p_person` off the story, and off their sheet: its teller, or
-- whoever answers for or edits them, while it's about someone else too.
create function public.remove_story_subject(p_story uuid, p_person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.story_subjects a where a.story_id = p_story and a.person_id = p_person
  ) then
    raise exception 'STORY: not about them' using errcode = '22023';
  end if;
  if not private.can_remove_story_subject(p_story, p_person) then
    raise exception 'STORY: not yours to remove' using errcode = '42501';
  end if;
  perform private.unseat_story_subject(p_story, p_person);
end;
$$;

revoke all on function public.remove_story_subject(uuid, uuid) from public, anon;
grant execute on function public.remove_story_subject(uuid, uuid) to authenticated;

-- 10. A sheet lists the stories about its person, as theirs.
drop function public.entry_stories(uuid);

create function public.entry_stories(p_person uuid)
returns table (
  id uuid,
  title text,
  body text,
  audio_path text,
  audio_seconds integer,
  -- This person's answer.
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
  -- Everyone it's about the viewer may see, this person first, then whom
  -- it was first told about, with their answers.
  about jsonb,
  -- The viewer may take it off this person's sheet, leaving it on others'.
  can_remove boolean,
  -- The viewer may delete it, from everyone's.
  can_delete boolean
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.title, s.body, s.audio_path, s.audio_seconds, a.status,
    s.created_at, s.created_by, private.member_label(s.created_by),
    a.status = 'pending' and private.can_approve_story(p_person),
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
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', o.person_id, 'name', private.person_label(o.person_id), 'status', o.status)
          order by (o.person_id = p_person) desc, (o.person_id = s.person_id) desc,
            private.person_label(o.person_id), o.person_id
        )
        from public.story_subjects o
        where o.story_id = s.id
      ),
      '[]'::jsonb
    ),
    private.can_remove_story_subject(s.id, p_person)
      and exists (
        select 1 from public.story_subjects o
        where o.story_id = s.id and o.person_id <> p_person
      ),
    private.can_delete_story(s.id)
  from public.story_subjects a
  join public.stories s on s.id = a.story_id
  cross join lateral (select private.can_share_story(s.id) as can_share) x
  where a.person_id = p_person
    -- On their sheet once they said yes; waiting, to whoever answers for
    -- them; and every answer to its teller.
    and (
      a.status = 'approved'
      or s.created_by = (select auth.uid())
      or (a.status = 'pending' and private.can_approve_story(p_person))
    )
  order by s.created_at desc;
$$;

revoke all on function public.entry_stories(uuid) from public, anon;
grant execute on function public.entry_stories(uuid) to authenticated;

-- 11. A link names everyone who said yes.
drop function public.shared_story(text);

create function public.shared_story(p_token text)
returns table (
  story_id uuid,
  -- "Amina Khan and Hassan Khan" (`private.story_about_label`).
  person_name text,
  shared_by text,
  title text,
  body text,
  audio_path text,
  audio_seconds integer,
  told_on date,
  told_on_precision text,
  credits jsonb,
  -- Everyone it's about who said yes, whom it was first told about first.
  about jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, private.story_about_label(s.id),
    coalesce(private.member_label(l.created_by), 'A relative'),
    s.title, s.body, s.audio_path, s.audio_seconds,
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
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', a.person_id, 'name', private.person_label(a.person_id))
          order by (a.person_id = s.person_id) desc, private.person_label(a.person_id), a.person_id
        )
        from public.story_subjects a
        where a.story_id = s.id and a.status = 'approved'
      ),
      '[]'::jsonb
    )
  from public.story_links l
  join public.stories s on s.id = l.story_id
  where l.token = p_token
    and l.revoked_at is null
    and private.story_link_live(l.story_id, l.created_by);
$$;

revoke all on function public.shared_story(text) from public, anon, authenticated;
grant execute on function public.shared_story(text) to service_role;

-- Where a story opens with no sheet in mind (`/stories/[id]`): someone it's
-- about the viewer sees who said yes, whom it was first told about first.
create or replace function public.story_place(p_story uuid, p_prefer uuid default null)
returns table (person_id uuid, tree_id uuid)
language sql
stable
set search_path = ''
as $$
  select a.person_id, private.tree_showing(a.person_id, (select auth.uid()), p_prefer)
  from public.stories s
  join public.story_subjects a on a.story_id = s.id
  where s.id = p_story
  order by (a.status = 'approved' and private.can_see_stories(a.person_id)) desc,
    (a.person_id = s.person_id) desc, a.created_at, a.person_id
  limit 1;
$$;

-- 12. A comment is told to the teller, and to everyone it's about who
-- said yes, as themself.
create or replace function public.add_story_comment(p_story uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_story public.stories%rowtype;
  v_name text;
  v_id uuid;
  v_about record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'STORY: nothing to say' using errcode = '22023';
  end if;
  if length(v_body) > 2000 then
    raise exception 'STORY: longer than a comment may be' using errcode = '22001';
  end if;
  if not private.can_see_story_comments(p_story) then
    raise exception 'STORY: not a story you can see' using errcode = '42501';
  end if;

  insert into public.story_comments (story_id, created_by, body)
  values (p_story, v_uid, v_body)
  returning id into v_id;

  select * into v_story from public.stories where id = p_story;
  v_name := coalesce(private.member_label(v_uid), 'A relative');

  perform private.notify(
    v_story.created_by, v_uid, 'story_commented', v_story.person_id, null,
    v_name || ' commented on your story about '
      || private.story_about_label(p_story) || '.',
    private.tree_showing(v_story.person_id, v_story.created_by, v_story.tree_id)
  );
  for v_about in
    select a.person_id, private.story_owner(a.person_id) as owner
    from public.story_subjects a
    where a.story_id = p_story
      and a.status = 'approved'
      and private.story_owner(a.person_id) is not null
      and private.story_owner(a.person_id) is distinct from v_story.created_by
  loop
    perform private.notify(
      v_about.owner, v_uid, 'story_commented', v_about.person_id, null,
      v_name || ' commented on a story about you.',
      private.tree_showing(v_about.person_id, v_about.owner, v_story.tree_id)
    );
  end loop;

  return v_id;
end;
$$;

-- 13. Placeholders, deleting entries and merging them.
-- Only a placeholder's parent tells a story about it, as they alone credit
-- or tag it.
CREATE OR REPLACE FUNCTION private.placeholder_entry_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  elsif tg_table_name in ('stories', 'album_tags', 'story_credits', 'story_subjects') then
    if private.is_own_child(new.person_id) then
      return new;
    end if;
  end if;
  raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
    using errcode = '42501';
end;
$function$;

-- A Leaf or Branch deletes their own entry only while no story someone
-- else told is about it.
CREATE OR REPLACE FUNCTION private.can_delete_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    -- A placeholder child's parent (Step 98.2), until the child has
    -- claimed it: then it's the child's own entry (Step 98.3).
    or (
      private.is_placeholder(p_person_id)
      and private.is_own_child(p_person_id)
      and not private.person_is_someones_own(p_person_id)
    )
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      -- Nor is a story someone else told about them (Step 183: anyone it's
      -- about, not only whom it was first told about).
      and not exists (
        select 1 from public.story_subjects a
        join public.stories s on s.id = a.story_id
        where a.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.album_tags t
        join public.album_photos p on p.id = t.photo_id
        where t.person_id = p_person_id and p.created_by is distinct from (select auth.uid())
      )
      -- Nor credited them in a story of theirs (Step 99): deleting the entry
      -- would take the credit out of someone else's story.
      and not exists (
        select 1 from public.story_credits sc
        join public.stories s on s.id = sc.story_id
        where sc.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$function$;

-- Nor is someone else's story about it.
CREATE OR REPLACE FUNCTION private.is_own_placeholder(p_person uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user is not null
    and exists (
      select 1 from public.people pe
      where pe.id = p_person and pe.created_by = p_user and pe.owner_user_id = p_user
    )
    and not exists (
      select 1 from public.relationships r
      where (r.from_person = p_person or r.to_person = p_person)
        and r.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.story_subjects a
      join public.stories s on s.id = a.story_id
      where a.person_id = p_person and s.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.album_tags t
      join public.album_photos p on p.id = t.photo_id
      where t.person_id = p_person and p.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.pet_companions pc
      join public.pets pt on pt.id = pc.pet_id
      where pc.person_id = p_person
        and (pc.created_by is distinct from p_user or pt.created_by is distinct from p_user)
    )
    and not exists (
      select 1 from public.bloodline_anchors a
      where a.person_id = p_person and a.created_by is distinct from p_user
    )
    -- Placed on a tree by someone else, e.g. a Root bringing it over.
    and not exists (
      select 1 from public.tree_placements pl
      where pl.person_id = p_person and pl.placed_by is distinct from p_user
    )
    and not exists (
      select 1 from public.entry_revisions v
      where v.person_id = p_person and v.editor_user_id is distinct from p_user
    )
    and not exists (
      select 1 from public.claims c
      where c.person_id = p_person and c.claimant_user_id is distinct from p_user
    );
$function$;

-- A claim carries the stand-in's place in each story over.
CREATE OR REPLACE FUNCTION public.claim_person(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_creator uuid;
  v_died boolean;
  v_recent int;
  v_name_ok boolean;
  v_claim_id uuid;
  v_tree uuid;
  -- The placeholder's photo file and where it goes (Step 43).
  v_photo_from text;
  v_photo_to text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if v_self is null then
    raise exception 'Add your own entry before claiming another' using errcode = '42501';
  end if;
  if p_person_id = v_self then
    raise exception 'That is already your entry';
  end if;

  -- Claiming merges the member's own entry into this one and deletes it
  -- (below), which is only safe for a placeholder they made for themselves.
  -- An entry a relative made and they claimed, or one others have built on,
  -- is them on the tree: merging it would move their family onto whoever
  -- this is and delete them (Step 36).
  if not private.is_own_placeholder(v_self, v_uid) then
    raise exception 'Only a placeholder you added for yourself can be merged into another entry'
      using errcode = '42501';
  end if;

  select created_by, is_deceased or date_of_death is not null
    into v_creator, v_died
  from public.people where id = p_person_id;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;

  -- Both entries must sit on one tree the claimant belongs to.
  select pl.tree_id into v_tree
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
  where pl.person_id = p_person_id and pl.status = 'active'
    and private.is_placed(pl.tree_id, v_self)
  -- One that shows the whole entry first, if any does.
  order by pl.detail desc
  limit 1;
  if v_tree is null then
    raise exception 'That entry is on a different tree';
  end if;

  -- Someone who has died is nobody's own entry (Step 36).
  if v_died then
    raise exception 'That entry is marked as having died' using errcode = '42501';
  end if;

  if private.person_is_claimed(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles where self_person_id = p_person_id) then
    raise exception 'That entry already belongs to a member' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  select
    lower(btrim(pe.last_name)) = lower(btrim(s.last_name))
    and (
      (nullif(btrim(s.first_name), '') is not null
       and lower(btrim(s.first_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
      or
      (nullif(btrim(s.preferred_name), '') is not null
       and lower(btrim(s.preferred_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false) and not private.person_invited_to_claim(p_person_id) then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  -- Move the placeholder's lines onto the claimed entry, dropping any that
  -- would double up or point at itself.
  delete from public.relationships r
  where (r.from_person = v_self or r.to_person = v_self)
    and (
      (case when r.from_person = v_self then p_person_id else r.from_person end)
        = (case when r.to_person = v_self then p_person_id else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = v_self then p_person_id else from_person end,
      to_person = case when to_person = v_self then p_person_id else to_person end
  where from_person = v_self or to_person = v_self;

  update public.stories set person_id = p_person_id where person_id = v_self;
  -- Its place in the stories it's in (Step 183), but for those the claimed
  -- entry is in already.
  delete from public.story_subjects a
  where a.person_id = v_self
    and exists (
      select 1 from public.story_subjects o
      where o.story_id = a.story_id and o.person_id = p_person_id
    );
  update public.story_subjects set person_id = p_person_id where person_id = v_self;
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = v_self
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_person_id
    );
  update public.story_credits set person_id = p_person_id where person_id = v_self;
  -- The photos it's in (Step 88.5), but for those the claimed entry is in
  -- already.
  delete from public.album_tags t
  where t.person_id = v_self
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_person_id
    );
  update public.album_tags set person_id = p_person_id where person_id = v_self;
  update public.entry_reports set person_id = p_person_id where person_id = v_self;
  -- The placeholder's placements come along where the claimed entry has none.
  insert into public.tree_placements (tree_id, person_id, status, placed_by, responded_at)
  select pl.tree_id, p_person_id, pl.status, pl.placed_by, pl.responded_at
  from public.tree_placements pl
  where pl.person_id = v_self
  on conflict (tree_id, person_id) do nothing;
  -- A basic card of the claimed entry, on a tree their placeholder was on,
  -- shows in full from here: claiming it there is their yes (Step 83).
  perform private.claimed_shows_in_full(
    p_person_id,
    array(
      select pl.tree_id from public.tree_placements pl
      where pl.person_id = v_self and pl.status = 'active'
    ),
    v_uid
  );
  -- So do its companions, on every tree the claimed entry is on (a pet's
  -- people must be on its tree), staying their pet's first person where the
  -- placeholder was; deleting it would otherwise unlink them, and delete a
  -- pet it was the only person of.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_person_id, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = v_self and private.is_placed(pt.tree_id, p_person_id)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_person_id
  where pt.primary_person_id = v_self
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_person_id
    );
  -- And a bloodline it anchors: a founder's own entry anchors their tree's.
  update public.bloodline_anchors a
  set person_id = p_person_id
  where a.person_id = v_self
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_person_id
    );
  -- Its photo, where the claimed entry has none, framed as it was. Storage
  -- lets someone read a photo only if they can see the entry its path names
  -- (`<tree>/<entry>/<file>`), and the placeholder is about to go, so the
  -- claimed entry names the same file under its own id, and `claimPerson`
  -- moves the file there (Step 43). A photo kept anywhere but the
  -- placeholder's own folder stays behind.
  select stub.photo_path,
         split_part(stub.photo_path, '/', 1) || '/' || p_person_id::text || '/'
           || split_part(stub.photo_path, '/', 3)
    into v_photo_from, v_photo_to
  from public.people stub, public.people tgt
  where stub.id = v_self and tgt.id = p_person_id
    and tgt.photo_path is null
    and stub.photo_path ~ ('^[^/]+/' || v_self::text || '/[^/]+$');
  if v_photo_to is not null then
    update public.people tgt
    set photo_path = v_photo_to, photo_crop = stub.photo_crop
    from public.people stub
    where tgt.id = p_person_id and stub.id = v_self;
  end if;

  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;
  update public.people set owner_user_id = v_uid where id = p_person_id;

  delete from public.people where id = v_self;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person_id, v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative. If this looks wrong, you can dispute it.',
    -- In an inbox whoever added the entry has (Step 83).
    case
      when exists (
        select 1 from public.tree_members m
        where m.tree_id = v_tree and m.user_id = v_creator
      ) then v_tree
      else private.home_tree(p_person_id)
    end
  );

  -- `photo_from` and `photo_to` are the move `claimPerson` makes, or null.
  return jsonb_build_object(
    'claim_id', v_claim_id,
    'person_id', p_person_id,
    'photo_from', v_photo_from,
    'photo_to', v_photo_to
  );
end;
$function$;

-- So does an invite's or a placeholder's merge.
CREATE OR REPLACE FUNCTION private.merge_invited_entry(p_invited uuid, p_own uuid, p_tree uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_invited public.people;
  v_own public.people;
  v_hold boolean;
begin
  select * into v_invited from public.people where id = p_invited;
  select * into v_own from public.people where id = p_own;
  if v_invited.id is null or v_own.id is null or p_invited = p_own
     or not exists (
       select 1 from public.profiles pr
       where pr.auth_user_id = v_uid and pr.self_person_id = p_own
     ) then
    return false;
  end if;

  -- Someone who has died is nobody's own entry (Steps 36 and 37).
  if v_invited.is_deceased or v_invited.date_of_death is not null
     or v_own.is_deceased or v_own.date_of_death is not null then
    return false;
  end if;

  -- A placeholder child (Step 98.3) folds into the child's own entry like
  -- any stand-in, but theirs takes its number too: one record, kept a
  -- placeholder to everyone (its details held back) until their parent
  -- shows it.
  v_hold := v_invited.placeholder_number is not null;

  -- A stand-in its maker added and nobody else has built on, spoken for by
  -- nobody, shown on this tree alone: folding it in loses nobody's work and
  -- moves nothing onto a tree they didn't agree to.
  if not private.person_is_claimable(p_invited)
     or not private.is_own_placeholder(p_invited, v_invited.created_by)
     or not private.is_placed(p_tree, p_invited)
     or exists (
       select 1 from public.tree_placements pl
       where pl.person_id = p_invited and pl.tree_id <> p_tree
     ) then
    return false;
  end if;

  -- Plainly someone else: a relative of theirs (a parent with the same name),
  -- or born more than a year apart.
  if exists (
       select 1 from public.relationships r
       where (r.from_person = p_invited and r.to_person = p_own)
          or (r.from_person = p_own and r.to_person = p_invited)
     )
     or abs(extract(year from v_invited.date_of_birth) - extract(year from v_own.date_of_birth)) > 1 then
    return false;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  if v_hold then
    insert into private.withheld_details as w (person_id, details)
    values (
      p_own,
      coalesce((select x.details from private.withheld_details x where x.person_id = p_invited), '{}'::jsonb)
        || coalesce((select x.details from private.withheld_details x where x.person_id = p_own), '{}'::jsonb)
        || private.entry_details(p_own)
    )
    on conflict (person_id) do update set details = excluded.details;
    update public.people set
      first_name = null, middle_name = null, preferred_name = null,
      maiden_name = null, last_name = '', date_of_birth = null,
      date_of_birth_circa = false, birth_month = null, birth_day = null,
      city_of_birth = null, country_of_birth = '', place_id_birth = null,
      place_id_residence = null, place_of_residence = null,
      sex = null, lineage_type = null, email = null, photo_path = null,
      photo_crop = null, placeholder_number = v_invited.placeholder_number
    where id = p_own;
  end if;

  -- Theirs sits where the invited entry sat on this canvas, unless it's
  -- there already. A placement a Root asked for and they hadn't answered
  -- becomes active, keeping that Root as `placed_by` (as Step 30.9 does).
  if not private.is_placed_in_full(p_tree, p_own) then
    insert into public.tree_placements as tp
      (tree_id, person_id, status, placed_by, responded_at, pos_x, pos_y, pos_dx, pos_dy)
    select p_tree, p_own, 'active', v_uid, now(), pl.pos_x, pl.pos_y, pl.pos_dx, pl.pos_dy
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_invited
    on conflict (tree_id, person_id) do update
      set status = 'active', responded_at = now(),
          approval = case when tp.approval = 'none' then 'none' else 'approved' end,
          answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end,
          pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          pos_dx = excluded.pos_dx, pos_dy = excluded.pos_dy;
  end if;

  -- Its lines move onto theirs, dropping any that would double up or point
  -- at itself (as `claim_person` does).
  delete from public.relationships r
  where (r.from_person = p_invited or r.to_person = p_invited)
    and (
      (case when r.from_person = p_invited then p_own else r.from_person end)
        = (case when r.to_person = p_invited then p_own else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = p_invited then p_own else from_person end,
      to_person = case when to_person = p_invited then p_own else to_person end
  where from_person = p_invited or to_person = p_invited;

  update public.stories set person_id = p_own where person_id = p_invited;
  -- Its place in the stories it's in (Step 183), but for those the other
  -- entry is in already.
  delete from public.story_subjects a
  where a.person_id = p_invited
    and exists (
      select 1 from public.story_subjects o
      where o.story_id = a.story_id and o.person_id = p_own
    );
  update public.story_subjects set person_id = p_own where person_id = p_invited;
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = p_invited
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_own
    );
  update public.story_credits set person_id = p_own where person_id = p_invited;
  -- The photos it's in (Step 88.5), but for those theirs is in already.
  delete from public.album_tags t
  where t.person_id = p_invited
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_own
    );
  update public.album_tags set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;

  -- Its companions, staying their pet's first person where it was.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_own, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = p_invited and private.is_placed(pt.tree_id, p_own)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_own
  where pt.primary_person_id = p_invited
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_own
    );

  -- And a bloodline it anchors.
  update public.bloodline_anchors a
  set person_id = p_own
  where a.person_id = p_invited
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_own
    );

  delete from public.people where id = p_invited;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return true;
end;
$function$;
