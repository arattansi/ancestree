-- Step 157: the library's readers like a post, and send in a story.
--
-- A like is a reader's on a published post, once each (`blog_post_likes`):
-- the reader is a random id the server keeps in a cookie, signed in or
-- not. Service role only.
--
-- A story sent in (`library_submissions`) is the draft form's fields with
-- the sender's email, who agreed it may be edited to fit the library. Its
-- `token` is the secret in the copy emailed back, whose page asks for a
-- change (`library_change_requests`). Both are written by the server with
-- the service role (`submit_library_story`, `ask_library_change`, which
-- hold the caps) and triaged by the beta reviewers on the admin page's
-- blog tab through the reviewer functions below. A photo sent with a
-- story waits in the private `library-submissions` bucket until a
-- reviewer makes the story a draft, which copies it in as the cover.

create table public.blog_post_likes (
  post_id uuid not null references public.blog_posts (id) on delete cascade,
  reader uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, reader)
);

alter table public.blog_post_likes enable row level security;
revoke all on public.blog_post_likes from anon, authenticated;

create table public.library_submissions (
  id uuid primary key default gen_random_uuid(),
  -- The secret in the copy's link.
  token uuid not null default gen_random_uuid() unique,
  email text not null,
  title text not null,
  body text not null,
  kind text not null default 'person',
  people jsonb not null default '[]'::jsonb,
  -- In the private `library-submissions` bucket.
  photo_path text,
  -- They agreed it may be edited to fit the library; there's no sending
  -- without it.
  agreed_to_edits_at timestamptz not null default now(),
  -- new: waiting; drafted: a reviewer made it a post (`post_id`);
  -- closed: set aside.
  status text not null default 'new',
  post_id uuid references public.blog_posts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_submissions_email_check
    check (char_length(email) between 3 and 254),
  constraint library_submissions_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint library_submissions_body_check
    check (char_length(btrim(body)) between 1 and 20000),
  constraint library_submissions_kind_check
    check (kind in ('person', 'couple', 'family')),
  constraint library_submissions_people_check
    check (jsonb_typeof(people) = 'array' and jsonb_array_length(people) <= 12),
  constraint library_submissions_status_check
    check (status in ('new', 'drafted', 'closed'))
);

create index library_submissions_email_idx
  on public.library_submissions (lower(email), created_at desc);
create index library_submissions_created_idx
  on public.library_submissions (created_at desc);
create index library_submissions_post_idx
  on public.library_submissions (post_id) where post_id is not null;

alter table public.library_submissions enable row level security;
revoke all on public.library_submissions from anon, authenticated;

create table public.library_change_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.library_submissions (id) on delete cascade,
  message text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint library_change_requests_message_check
    check (char_length(btrim(message)) between 1 and 2000)
);

create index library_change_requests_submission_idx
  on public.library_change_requests (submission_id, created_at);

alter table public.library_change_requests enable row level security;
revoke all on public.library_change_requests from anon, authenticated;

-- Photos sent in: private until a reviewer copies one into `library`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-submissions', 'library-submissions', false, 3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- A post's likes, and whether `p_reader` is one of them. Service role.
create or replace function public.blog_post_like_count(p_post_id uuid, p_reader uuid)
returns table (likes integer, liked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::integer,
    coalesce(bool_or(l.reader = p_reader), false)
  from public.blog_post_likes l
  where l.post_id = p_post_id;
$$;

-- `p_reader` likes a published post, or no longer does; answers its likes
-- after. A draft, or no post at all, is refused. Service role.
create or replace function public.set_blog_post_like(
  p_post_id uuid,
  p_reader uuid,
  p_liked boolean
)
returns table (likes integer, liked boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.blog_posts p
    where p.id = p_post_id and p.published_at is not null
  ) then
    raise exception 'NO_POST' using errcode = 'P0002';
  end if;
  if p_liked then
    insert into public.blog_post_likes (post_id, reader)
    values (p_post_id, p_reader)
    on conflict do nothing;
  else
    delete from public.blog_post_likes l
    where l.post_id = p_post_id and l.reader = p_reader;
  end if;
  return query select * from public.blog_post_like_count(p_post_id, p_reader);
end;
$$;

-- A story sent in, from the library's form: three a day from one address,
-- fifty a day from everyone, since each sends a copy to the address typed.
-- Taken one at a time, so two at once can't both slip under. Service role.
create or replace function public.submit_library_story(
  p_email text,
  p_title text,
  p_body text,
  p_kind text,
  p_people jsonb,
  p_photo_path text
)
returns public.library_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row public.library_submissions;
begin
  perform pg_advisory_xact_lock(hashtext('library_submissions'));
  if (
    select count(*) from public.library_submissions s
    where lower(s.email) = v_email and s.created_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'TOO_MANY_FROM_ADDRESS' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.library_submissions s
    where s.created_at > now() - interval '1 day'
  ) >= 50 then
    raise exception 'TOO_MANY_TODAY' using errcode = 'P0001';
  end if;
  insert into public.library_submissions (email, title, body, kind, people, photo_path)
  values (
    v_email,
    btrim(p_title),
    btrim(p_body),
    coalesce(p_kind, 'person'),
    private.blog_people(p_people),
    nullif(btrim(p_photo_path), '')
  )
  returning * into v_row;
  return v_row;
end;
$$;

-- A change asked for from the copy's page: ten waiting at most on one
-- story. Service role.
create or replace function public.ask_library_change(p_token uuid, p_message text)
returns public.library_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission uuid;
  v_row public.library_change_requests;
begin
  select s.id into v_submission
  from public.library_submissions s
  where s.token = p_token
  for update;
  if v_submission is null then
    raise exception 'NO_SUBMISSION' using errcode = 'P0002';
  end if;
  if (
    select count(*) from public.library_change_requests c
    where c.submission_id = v_submission and c.resolved_at is null
  ) >= 10 then
    raise exception 'TOO_MANY_CHANGES' using errcode = 'P0001';
  end if;
  insert into public.library_change_requests (submission_id, message)
  values (v_submission, btrim(p_message))
  returning * into v_row;
  update public.library_submissions set updated_at = now() where id = v_submission;
  return v_row;
end;
$$;

-- The reviewers' triage list: what's waiting first (a new story, or one
-- with a change asked for), then the rest, each newest first; every story
-- with its changes asked for, oldest first, and its post, if it has one.
create or replace function public.list_library_submissions()
returns table (
  id uuid,
  email text,
  title text,
  body text,
  kind text,
  people jsonb,
  photo_path text,
  status text,
  post_id uuid,
  post_slug text,
  post_published_at timestamptz,
  created_at timestamptz,
  change_requests jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  return query
  select
    s.id, s.email, s.title, s.body, s.kind, s.people, s.photo_path, s.status,
    s.post_id, p.slug, p.published_at, s.created_at,
    coalesce(c.requests, '[]'::jsonb)
  from public.library_submissions s
  left join public.blog_posts p on p.id = s.post_id
  left join lateral (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'message', r.message,
          'resolvedAt', r.resolved_at,
          'createdAt', r.created_at
        )
        order by r.created_at
      ) as requests,
      bool_or(r.resolved_at is null) as waiting
    from public.library_change_requests r
    where r.submission_id = s.id
  ) c on true
  order by
    (s.status = 'new' or coalesce(c.waiting, false)) desc,
    s.created_at desc;
end;
$$;

-- How many want a reviewer: new stories, and changes asked for and not
-- yet seen to. Answers 0 to anyone else, for the admin page's tab.
create or replace function public.library_triage_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.is_beta_reviewer() then (
    (select count(*) from public.library_submissions s where s.status = 'new')
    + (select count(*) from public.library_change_requests r where r.resolved_at is null)
  )::integer else 0 end;
$$;

-- Reviewer: a story sent in made a draft post, with its title, text, kind
-- and people (the cover is copied in by the server after). Refused once
-- it has a post; a post since deleted lets it be drafted again.
create or replace function public.draft_library_submission(p_id uuid)
returns public.blog_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_submission public.library_submissions;
  v_post public.blog_posts;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  select * into v_submission
  from public.library_submissions s
  where s.id = p_id
  for update;
  if v_submission.id is null then
    raise exception 'NO_SUBMISSION' using errcode = 'P0002';
  end if;
  if v_submission.post_id is not null then
    raise exception 'ALREADY_DRAFTED' using errcode = 'P0001';
  end if;
  insert into public.blog_posts (slug, title, body, kind, people, created_by)
  values (
    private.blog_slug_for(v_submission.title, null),
    v_submission.title,
    v_submission.body,
    v_submission.kind,
    v_submission.people,
    (select auth.uid())
  )
  returning * into v_post;
  update public.library_submissions
  set status = 'drafted', post_id = v_post.id, updated_at = now()
  where id = p_id;
  return v_post;
end;
$$;

-- Reviewer: a story set aside ('closed') or back to waiting ('new').
create or replace function public.set_library_submission_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  if p_status not in ('new', 'closed') then
    raise exception 'BAD_STATUS' using errcode = '22023';
  end if;
  update public.library_submissions
  set status = p_status, updated_at = now()
  where id = p_id;
  if not found then
    raise exception 'NO_SUBMISSION' using errcode = 'P0002';
  end if;
end;
$$;

-- Reviewer: a change asked for seen to, or not yet.
create or replace function public.resolve_library_change(p_id uuid, p_resolved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  update public.library_change_requests
  set resolved_at = case when p_resolved then coalesce(resolved_at, now()) end
  where id = p_id;
  if not found then
    raise exception 'NO_CHANGE' using errcode = 'P0002';
  end if;
end;
$$;

-- Reviewer: a story sent in deleted, with its changes asked for; answers
-- its photo's path, for the server to remove the file. A post made from
-- it stays.
create or replace function public.delete_library_submission(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_photo text;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  delete from public.library_submissions
  where id = p_id
  returning photo_path into v_photo;
  if not found then
    raise exception 'NO_SUBMISSION' using errcode = 'P0002';
  end if;
  return v_photo;
end;
$$;

revoke all on function public.blog_post_like_count(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_blog_post_like(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.submit_library_story(text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.ask_library_change(uuid, text) from public, anon, authenticated;
grant execute on function public.blog_post_like_count(uuid, uuid) to service_role;
grant execute on function public.set_blog_post_like(uuid, uuid, boolean) to service_role;
grant execute on function public.submit_library_story(text, text, text, text, jsonb, text) to service_role;
grant execute on function public.ask_library_change(uuid, text) to service_role;

revoke all on function public.list_library_submissions() from public, anon;
revoke all on function public.library_triage_count() from public, anon;
revoke all on function public.draft_library_submission(uuid) from public, anon;
revoke all on function public.set_library_submission_status(uuid, text) from public, anon;
revoke all on function public.resolve_library_change(uuid, boolean) from public, anon;
revoke all on function public.delete_library_submission(uuid) from public, anon;
grant execute on function public.list_library_submissions() to authenticated;
grant execute on function public.library_triage_count() to authenticated;
grant execute on function public.draft_library_submission(uuid) to authenticated;
grant execute on function public.set_library_submission_status(uuid, text) to authenticated;
grant execute on function public.resolve_library_change(uuid, boolean) to authenticated;
grant execute on function public.delete_library_submission(uuid) to authenticated;
