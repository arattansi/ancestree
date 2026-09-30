-- Step 88.4: an approved story can be shared by a public link, and every
-- story has its own comments.
--
-- Links (Aalim, 2026-09-29): anyone who can see an approved story may make
-- a link to it, which opens the story read-only with no account needed
-- (/shared/story/<token>, read with the service role: `shared_story`). The
-- person, whoever can edit the entry, or the story's teller may turn its
-- links off, and then only they may share it again. Each sharer has their
-- own link, since the page says who shared it. No link works for anyone
-- hidden from visitors, or once its sharer no longer sees the story.
--
-- Comments (Aalim): any member who can see an approved story may comment,
-- with no approval. A comment is deleted by whoever wrote it, the story's
-- teller or whoever can edit the entry. The teller and the person hear of
-- each one.
--
-- Additive: the deployed app ignores the new columns `entry_stories` gives.

-- 1. A story whose links were turned off: nobody but whoever turned them
-- off (or could have) shares it again.
alter table public.stories
  add column links_off boolean not null default false;

-- 2. The links.
create table public.story_links (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  -- 144 random bits, URL-safe: 24 characters to paste into a chat.
  token text not null unique
    default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  -- Who shared it, whom the page names; the link goes with their account.
  created_by uuid not null references public.profiles (auth_user_id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (auth_user_id) on delete set null,
  constraint story_links_token_check check (token ~ '^[A-Za-z0-9_-]{24}$')
);

-- One working link per sharer per story: sharing again hands theirs back.
create unique index story_links_one_each
  on public.story_links (story_id, created_by) where revoked_at is null;
create index story_links_created_by_idx on public.story_links (created_by);
create index story_links_revoked_by_idx on public.story_links (revoked_by);

alter table public.story_links enable row level security;

-- Made and turned off only through the functions below; a member reads
-- only their own (the sheet's Share copies it again), and the public page
-- reads with the service role.
revoke all on table public.story_links from anon, authenticated, public;
grant select on table public.story_links to authenticated;
grant all on table public.story_links to service_role;

create policy story_links_select on public.story_links
  for select to authenticated
  using (created_by = (select auth.uid()));

-- 3. The comments.
create table public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories (id) on delete cascade,
  -- Kept, as nobody's, when its author's account goes.
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint story_comments_body_check
    check (length(btrim(body)) between 1 and 2000)
);

create index story_comments_story_idx on public.story_comments (story_id, created_at);
create index story_comments_created_by_idx on public.story_comments (created_by);

alter table public.story_comments enable row level security;

-- Written only through `add_story_comment`; deleted through RLS.
revoke all on table public.story_comments from anon, authenticated, public;
grant select, delete on table public.story_comments to authenticated;
grant all on table public.story_comments to service_role;

-- 4. Who may do what.

-- A link to the story would work now, if `p_sharer` made it: the story is
-- approved and its links aren't off, the person isn't hidden from
-- visitors, and the sharer is on a tree that shows them in full.
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
    join public.people pe on pe.id = s.person_id
    where s.id = p_story
      and s.status = 'approved'
      and not s.links_off
      and not pe.hidden_from_visitors
      and exists (
        select 1
        from public.tree_placements pl
        join public.tree_members m on m.tree_id = pl.tree_id
        where pl.person_id = s.person_id
          and pl.status = 'active'
          and pl.detail = 'full'
          and m.user_id = p_sharer
      )
  );
$$;

-- Someone's link to it works.
create or replace function private.story_shared(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.story_links l
    where l.story_id = p_story
      and l.revoked_at is null
      and private.story_link_live(l.story_id, l.created_by)
  );
$$;

-- The person, whoever can edit the entry, or the story's teller.
create or replace function private.can_stop_story_links(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
      or private.story_owner(s.person_id) = (select auth.uid())
      or private.can_edit_person(s.person_id)
    from public.stories s
    where s.id = p_story
  ), false);
$$;

-- Anyone who can see the approved story, unless its person is hidden from
-- visitors, or its links were turned off and they couldn't have.
create or replace function private.can_share_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.status = 'approved'
      and private.can_see_stories(s.person_id)
      and not pe.hidden_from_visitors
      and (not s.links_off or private.can_stop_story_links(s.id))
    from public.stories s
    join public.people pe on pe.id = s.person_id
    where s.id = p_story
  ), false);
$$;

-- An approved story's comments: whoever may read the story.
create or replace function private.can_see_story_comments(p_story uuid)
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
      and private.can_see_stories(s.person_id)
  );
$$;

-- The story's teller, or whoever can edit the entry: they delete anyone's
-- comment on it.
create or replace function private.can_tend_story(p_story uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.created_by = (select auth.uid())
      or private.can_edit_person(s.person_id)
    from public.stories s
    where s.id = p_story
  ), false);
$$;

-- A tree of `p_user`'s that shows the person in full: `p_prefer` if it
-- does, else their home tree if it does. Where a notice sends them, and
-- where a story's member link opens.
create or replace function private.tree_showing(p_person uuid, p_user uuid, p_prefer uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pl.tree_id
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = p_user
  where pl.person_id = p_person
    and pl.status = 'active'
    and pl.detail = 'full'
  order by (pl.tree_id = p_prefer) is true desc,
    (pl.tree_id = private.home_tree(p_person)) is true desc,
    pl.tree_id
  limit 1;
$$;

revoke all on function private.story_link_live(uuid, uuid) from public, anon;
revoke all on function private.story_shared(uuid) from public, anon;
revoke all on function private.can_stop_story_links(uuid) from public, anon;
revoke all on function private.can_share_story(uuid) from public, anon;
revoke all on function private.can_see_story_comments(uuid) from public, anon;
revoke all on function private.can_tend_story(uuid) from public, anon;
revoke all on function private.tree_showing(uuid, uuid, uuid) from public, anon;
grant execute on function private.story_link_live(uuid, uuid) to authenticated, service_role;
grant execute on function private.story_shared(uuid) to authenticated, service_role;
grant execute on function private.can_stop_story_links(uuid) to authenticated, service_role;
grant execute on function private.can_share_story(uuid) to authenticated, service_role;
grant execute on function private.can_see_story_comments(uuid) to authenticated, service_role;
grant execute on function private.can_tend_story(uuid) to authenticated, service_role;
grant execute on function private.tree_showing(uuid, uuid, uuid) to authenticated, service_role;

create policy story_comments_select on public.story_comments
  for select to authenticated
  using ((select private.can_see_story_comments(story_comments.story_id)));

create policy story_comments_delete on public.story_comments
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.can_tend_story(story_comments.story_id))
  );

-- 5. Sharing: the viewer's own link to the story, made if they have none.
-- Shared by someone who could have turned its links off, the links are on
-- again.
create or replace function public.share_story(p_story uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.can_share_story(p_story) then
    raise exception 'STORY: can''t be shared' using errcode = '42501';
  end if;

  update public.stories set links_off = false where id = p_story and links_off;

  select l.token into v_token
  from public.story_links l
  where l.story_id = p_story and l.created_by = v_uid and l.revoked_at is null;
  if v_token is null then
    insert into public.story_links (story_id, created_by)
    values (p_story, v_uid)
    on conflict (story_id, created_by) where revoked_at is null do nothing
    returning token into v_token;
  end if;
  if v_token is null then
    -- Made by a press a moment before this one.
    select l.token into v_token
    from public.story_links l
    where l.story_id = p_story and l.created_by = v_uid and l.revoked_at is null;
  end if;
  return v_token;
end;
$$;

revoke all on function public.share_story(uuid) from public, anon;
grant execute on function public.share_story(uuid) to authenticated;

-- Every link to it stops working, and stays off until one of them shares
-- it again.
create or replace function public.stop_sharing_story(p_story uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.can_stop_story_links(p_story) then
    raise exception 'STORY: not yours to stop sharing' using errcode = '42501';
  end if;

  update public.story_links
  set revoked_at = now(), revoked_by = v_uid
  where story_id = p_story and revoked_at is null;
  update public.stories set links_off = true where id = p_story;
end;
$$;

revoke all on function public.stop_sharing_story(uuid) from public, anon;
grant execute on function public.stop_sharing_story(uuid) to authenticated;

-- The public page's read, for the service role alone: the story a working
-- link opens, the person's name and who shared it. Nothing for any other
-- token.
create or replace function public.shared_story(p_token text)
returns table (
  story_id uuid,
  person_name text,
  shared_by text,
  title text,
  body text,
  audio_path text,
  audio_seconds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, private.person_label(s.person_id),
    coalesce(private.member_label(l.created_by), 'A relative'),
    s.title, s.body, s.audio_path, s.audio_seconds
  from public.story_links l
  join public.stories s on s.id = l.story_id
  where l.token = p_token
    and l.revoked_at is null
    and private.story_link_live(l.story_id, l.created_by);
$$;

revoke all on function public.shared_story(text) from public, anon, authenticated;
grant execute on function public.shared_story(text) to service_role;

-- A member following a story's link through to its comments: the person
-- it's about, and a tree of theirs that shows them (`p_prefer`, the one
-- they're looking at, if it does). Nothing for a story they can't see.
create or replace function public.story_place(p_story uuid, p_prefer uuid default null)
returns table (person_id uuid, tree_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.person_id, private.tree_showing(s.person_id, (select auth.uid()), p_prefer)
  from public.stories s
  where s.id = p_story;
$$;

revoke all on function public.story_place(uuid, uuid) from public, anon;
grant execute on function public.story_place(uuid, uuid) to authenticated;

-- 6. Commenting. The story's teller hears of it, and so does its person
-- (claimed and living), each on a tree of theirs that shows the story.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placements_requested',
    'placement_accepted', 'placement_declined', 'placements_lapsed',
    'tree_request_approved', 'placed_on_join', 'joined_by_link',
    'change_suggested', 'suggestion_accepted', 'suggestion_declined',
    'story_to_approve', 'story_approved', 'story_declined',
    'story_commented'
  )
);

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
  v_owner uuid;
  v_name text;
  v_id uuid;
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
  v_owner := private.story_owner(v_story.person_id);

  perform private.notify(
    v_story.created_by, v_uid, 'story_commented', v_story.person_id, null,
    v_name || ' commented on your story about '
      || private.person_label(v_story.person_id) || '.',
    private.tree_showing(v_story.person_id, v_story.created_by, v_story.tree_id)
  );
  if v_owner is distinct from v_story.created_by then
    perform private.notify(
      v_owner, v_uid, 'story_commented', v_story.person_id, null,
      v_name || ' commented on a story about you.',
      private.tree_showing(v_story.person_id, v_owner, v_story.tree_id)
    );
  end if;

  return v_id;
end;
$$;

revoke all on function public.add_story_comment(uuid, text) from public, anon;
grant execute on function public.add_story_comment(uuid, text) to authenticated;

-- A story's comments the viewer may read (the table's own rules decide:
-- this runs as them), oldest first, each with who wrote it.
create or replace function public.list_story_comments(p_story uuid)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  created_by uuid,
  said_by text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.body, c.created_at, c.created_by, private.member_label(c.created_by)
  from public.story_comments c
  where c.story_id = p_story
  order by c.created_at, c.id;
$$;

revoke all on function public.list_story_comments(uuid) from public, anon;
grant execute on function public.list_story_comments(uuid) to authenticated;

-- 7. The sheet's list gains, for each story: how many comments it has,
-- whether a link to it works, whether the viewer may share it or turn its
-- links off, and the viewer's own working link. New columns, so the
-- function is made again.
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
  my_link text
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
    ) end
  from public.stories s
  cross join lateral (select private.can_share_story(s.id) as can_share) x
  where s.person_id = p_person
  order by s.created_at desc;
$$;

revoke all on function public.entry_stories(uuid) from public, anon;
grant execute on function public.entry_stories(uuid) to authenticated;

-- 8. The beta reviewers' dashboard counts comments on stories.
CREATE OR REPLACE FUNCTION public.engagement_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := private.utc_day(now());
  -- The last seven days, today included; the seven before them; the last 30.
  v_week_start date := v_today - 6;
  v_prev_start date := v_today - 13;
  v_month_start date := v_today - 29;
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'members', (select count(*) from public.profiles),
    'members_new', (
      select count(*) from public.profiles p
      where private.utc_day(p.created_at) >= v_week_start),
    'active_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_week_start),
    'active_prev_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_prev_start and a.day < v_week_start),
    'active_30', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_month_start),
    'entries', (select count(*) from public.people),
    'entries_new', (
      select count(*) from public.people p
      where private.utc_day(p.created_at) >= v_week_start),

    -- Twelve weeks, oldest first.
    'weeks', (
      select jsonb_agg(jsonb_build_object(
          'end', w.last_day,
          'active', (
            select count(distinct a.user_id) from private.active_days a
            where a.day between w.last_day - 6 and w.last_day),
          'joined', (
            select count(*) from public.profiles p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day),
          'entries', (
            select count(*) from public.people p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day))
        order by w.last_day)
      from (select v_today - 7 * g as last_day from generate_series(0, 11) g) w),

    -- How many members have done each thing at least once.
    'progress', jsonb_build_object(
      'own_entry', (
        select count(*) from public.profiles p where p.self_person_id is not null),
      'added_relative', (
        select count(distinct e.created_by)
        from public.people e
        join public.profiles p on p.auth_user_id = e.created_by
        where e.id is distinct from p.self_person_id),
      'invited', (
        select count(distinct s.user_id)
        from (
          -- An invite sent by email, or a request for access let in.
          select q.reviewed_by as user_id from public.invite_requests q
          where q.status = 'approved'
          union all
          -- Any link still out: family, founder, or an older bare one.
          select i.created_by from public.invites i
        ) s
        join public.profiles p on p.auth_user_id = s.user_id),
      'came_back', (
        select count(*) from (
          select a.user_id from private.active_days a
          group by a.user_id
          having count(*) >= 2) s)),

    -- What was done, by kind: in the last seven days, the seven before,
    -- and ever. A kind nothing has happened to is left out.
    'activity', (
      select coalesce(jsonb_object_agg(k.kind, k.counts), '{}'::jsonb)
      from (
        select e.kind, jsonb_build_object(
            'last_7', count(*) filter (where e.day >= v_week_start),
            'prev_7', count(*) filter (
              where e.day >= v_prev_start and e.day < v_week_start),
            'total', count(*)) as counts
        from (
          select 'entries' as kind, private.utc_day(p.created_at) as day
          from public.people p
          union all select 'connections', private.utc_day(r.created_at)
          from public.relationships r
          union all select 'photos', private.utc_day(o.created_at)
          from storage.objects o where o.bucket_id = 'photos'
          union all select 'documents', private.utc_day(d.created_at)
          from public.documents d
          union all select 'stories', private.utc_day(s.created_at)
          from public.stories s
          union all select 'story_comments', private.utc_day(c.created_at)
          from public.story_comments c
          union all select 'comments', private.utc_day(c.created_at)
          from public.pet_comments c
          union all select 'companions', private.utc_day(p.created_at)
          from public.pets p
          union all select 'claims', private.utc_day(c.created_at)
          from public.claims c
          union all select 'invites', private.utc_day(coalesce(q.reviewed_at, q.created_at))
          from public.invite_requests q where q.status = 'approved'
          union all select 'joins', private.utc_day(m.created_at)
          from public.tree_members m
          union all select 'access_requests', private.utc_day(q.created_at)
          from public.invite_requests q where q.source is distinct from 'direct'
          union all select 'tree_requests', private.utc_day(q.created_at)
          from public.tree_requests q
          union all select 'relayed_asks', private.utc_day(r.created_at)
          from public.invite_relays r
        ) e
        group by e.kind
      ) k),

    -- Each tree, oldest first. Its members' days count wherever they
    -- spent them; its entries are what it shows, from other trees too.
    'trees', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'founded', private.utc_day(t.created_at),
          'members', (
            select count(*) from public.tree_members m where m.tree_id = t.id),
          'active_7', (
            select count(distinct m.user_id)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id and a.day >= v_week_start),
          'entries', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'),
          'added_7', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'
              and private.utc_day(pl.created_at) >= v_week_start),
          'last_active', (
            select max(a.day)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id))
        order by t.created_at), '[]'::jsonb)
      from public.trees t)
  );
end;
$function$;
