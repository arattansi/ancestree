-- The library: a post's own title and description for search engines and
-- link previews (`meta_title`, `meta_description`), each empty until it's
-- written, when the page falls back to the post's title and its first
-- words. `create_blog_post` and `update_blog_post` take them, and
-- `blog_post` answers them for the post's page.

alter table public.blog_posts
  add column meta_title text not null default '',
  add column meta_description text not null default '',
  add constraint blog_posts_meta_title_check
    check (char_length(meta_title) <= 70),
  add constraint blog_posts_meta_description_check
    check (char_length(meta_description) <= 160);

drop function public.create_blog_post(text, text, text, jsonb);
drop function public.update_blog_post(uuid, text, text, text, jsonb);
drop function public.blog_post(text);

create or replace function public.create_blog_post(
  p_title text,
  p_body text default '',
  p_kind text default 'person',
  p_people jsonb default '[]'::jsonb,
  p_meta_title text default '',
  p_meta_description text default ''
)
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
  insert into public.blog_posts (slug, title, body, kind, people, meta_title, meta_description, created_by)
  values (
    private.blog_slug_for(v_title, null),
    v_title,
    coalesce(p_body, ''),
    coalesce(p_kind, 'person'),
    private.blog_people(p_people),
    btrim(coalesce(p_meta_title, '')),
    btrim(coalesce(p_meta_description, '')),
    (select auth.uid())
  )
  returning * into v_post;
  return v_post;
end;
$$;

create or replace function public.update_blog_post(
  p_id uuid,
  p_title text,
  p_body text,
  p_kind text default 'person',
  p_people jsonb default '[]'::jsonb,
  p_meta_title text default '',
  p_meta_description text default ''
)
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
      kind = coalesce(p_kind, 'person'),
      people = private.blog_people(p_people),
      meta_title = btrim(coalesce(p_meta_title, '')),
      meta_description = btrim(coalesce(p_meta_description, '')),
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

create or replace function public.blog_post(p_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  body text,
  kind text,
  cover_path text,
  people jsonb,
  meta_title text,
  meta_description text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.body, p.kind, p.cover_path, p.people,
         p.meta_title, p.meta_description, p.published_at, p.updated_at
  from public.blog_posts p
  where p.slug = p_slug
    and (p.published_at is not null or private.is_beta_reviewer());
$$;

revoke all on function public.create_blog_post(text, text, text, jsonb, text, text) from public, anon;
revoke all on function public.update_blog_post(uuid, text, text, text, jsonb, text, text) from public, anon;
revoke all on function public.blog_post(text) from public;

grant execute on function public.create_blog_post(text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.update_blog_post(uuid, text, text, text, jsonb, text, text) to authenticated;
grant execute on function public.blog_post(text) to anon, authenticated;
