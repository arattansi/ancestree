-- Step 134: the blog. Posts live at /blog (headed "stories-of-our-wise")
-- and /blog/<slug>, written in Markdown by a beta reviewer on the admin
-- page's blog tab: saved as a draft, edited, published and unpublished,
-- deleted. A draft is only a reviewer's to see (they open its address to
-- preview it); a published post is anyone's to read, signed out too.
--
-- The table has RLS on and no policies, so it's reached only through the
-- functions below: the reviewers' (`list_blog_posts`, `create_blog_post`,
-- `update_blog_post`, `set_blog_post_published`, `delete_blog_post`) and
-- the readers' (`published_blog_posts`, `blog_post`).

create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  -- The post's address: made from its title while it's a draft, and kept
  -- once published, so a shared link goes on working.
  slug text not null unique,
  title text not null,
  -- Markdown, as a story's text is.
  body text not null default '',
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint blog_posts_body_check
    check (char_length(body) <= 200000),
  constraint blog_posts_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from anon, authenticated;

-- A post's slug from its title, as a tree's is from its name: a title that
-- slugs to nothing is 'post', and one another post has taken gets a random
-- suffix. `p_id` is the post itself, whose own slug doesn't count as taken.
create or replace function private.blog_slug_for(p_title text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := coalesce(private.slugify(p_title), 'post');
begin
  if exists (
    select 1 from public.blog_posts p
    where p.slug = v_slug and (p_id is null or p.id <> p_id)
  ) then
    v_slug := v_slug || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4);
  end if;
  return v_slug;
end;
$$;

revoke all on function private.blog_slug_for(text, uuid) from public, anon, authenticated;

-- The reviewers' list: drafts first, then the published, each newest first.
create or replace function public.list_blog_posts()
returns setof public.blog_posts
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
    select * from public.blog_posts p
    order by (p.published_at is not null), coalesce(p.published_at, p.updated_at) desc;
end;
$$;

-- A new draft.
create or replace function public.create_blog_post(p_title text, p_body text default '')
returns public.blog_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(p_title);
  v_post public.blog_posts;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  insert into public.blog_posts (slug, title, body, created_by)
  values (
    private.blog_slug_for(v_title, null),
    v_title,
    coalesce(p_body, ''),
    (select auth.uid())
  )
  returning * into v_post;
  return v_post;
end;
$$;

-- A post's title and text, draft or published. A draft's slug follows its
-- title; a published post keeps the slug it was published under.
create or replace function public.update_blog_post(p_id uuid, p_title text, p_body text)
returns public.blog_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(p_title);
  v_post public.blog_posts;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  update public.blog_posts p
  set title = v_title,
      body = coalesce(p_body, ''),
      slug = case
        when p.published_at is null then private.blog_slug_for(v_title, p.id)
        else p.slug
      end,
      updated_at = now()
  where p.id = p_id
  returning * into v_post;
  if v_post.id is null then
    raise exception 'NO_POST' using errcode = 'P0002';
  end if;
  return v_post;
end;
$$;

-- Publish a draft (dated now; a post published before keeps its date), or
-- take a published post back to a draft.
create or replace function public.set_blog_post_published(p_id uuid, p_published boolean)
returns public.blog_posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.blog_posts;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  update public.blog_posts p
  set published_at = case when p_published then coalesce(p.published_at, now()) else null end,
      updated_at = now()
  where p.id = p_id
  returning * into v_post;
  if v_post.id is null then
    raise exception 'NO_POST' using errcode = 'P0002';
  end if;
  return v_post;
end;
$$;

create or replace function public.delete_blog_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  delete from public.blog_posts where id = p_id;
  if not found then
    raise exception 'NO_POST' using errcode = 'P0002';
  end if;
end;
$$;

-- What a reader sees of a post: not who wrote it.
create or replace function public.published_blog_posts()
returns table (
  id uuid,
  slug text,
  title text,
  body text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.body, p.published_at, p.updated_at
  from public.blog_posts p
  where p.published_at is not null
  order by p.published_at desc;
$$;

-- One post by its address: a published one for anyone; a draft only for a
-- reviewer, who opens it to preview it. Nothing otherwise.
create or replace function public.blog_post(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  body text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.body, p.published_at, p.updated_at
  from public.blog_posts p
  where p.slug = p_slug
    and (p.published_at is not null or private.is_beta_reviewer());
$$;

revoke all on function public.list_blog_posts() from public, anon;
revoke all on function public.create_blog_post(text, text) from public, anon;
revoke all on function public.update_blog_post(uuid, text, text) from public, anon;
revoke all on function public.set_blog_post_published(uuid, boolean) from public, anon;
revoke all on function public.delete_blog_post(uuid) from public, anon;
revoke all on function public.published_blog_posts() from public;
revoke all on function public.blog_post(text) from public;

grant execute on function public.list_blog_posts() to authenticated;
grant execute on function public.create_blog_post(text, text) to authenticated;
grant execute on function public.update_blog_post(uuid, text, text) to authenticated;
grant execute on function public.set_blog_post_published(uuid, boolean) to authenticated;
grant execute on function public.delete_blog_post(uuid) to authenticated;
grant execute on function public.published_blog_posts() to anon, authenticated;
grant execute on function public.blog_post(text) to anon, authenticated;
