-- Step 135: the library. A post is a spotlight on people who have passed:
-- one person, a couple or a family (`kind`), with a cover photo
-- (`cover_path`, in the public `library` bucket) and the people profiled
-- (`people`: first name, last name, maiden name, place of birth, which
-- picks each one's leaf on /library). `announced_at` says the subscribers
-- were emailed about it, so publishing again sends nothing twice.
--
-- Readers subscribe by email (`library_subscribers`): a row with a secret
-- token, confirmed by a link, unsubscribed by one. Service role only: the
-- server writes it, and nothing is answered to a visitor about an address.

alter table public.blog_posts
  add column kind text not null default 'person',
  add column cover_path text,
  add column people jsonb not null default '[]'::jsonb,
  add column announced_at timestamptz,
  add constraint blog_posts_kind_check
    check (kind in ('person', 'couple', 'family')),
  add constraint blog_posts_people_check
    check (jsonb_typeof(people) = 'array' and jsonb_array_length(people) <= 12);

create table public.library_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- The secret in the confirm and unsubscribe links.
  token uuid not null default gen_random_uuid() unique,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_subscribers_email_check
    check (char_length(email) between 3 and 254)
);

create unique index library_subscribers_email_key
  on public.library_subscribers (lower(email));

alter table public.library_subscribers enable row level security;
revoke all on public.library_subscribers from anon, authenticated;

-- Cover photos: public, since the posts are.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The people profiled, as the server hands them: an array of objects with
-- text `first`, `last`, `maiden` and `place`, each trimmed; anything else
-- is refused.
create or replace function private.blog_people(p_people jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_person jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if p_people is null then
    return v_out;
  end if;
  if jsonb_typeof(p_people) <> 'array' then
    raise exception 'BAD_PEOPLE' using errcode = '22023';
  end if;
  for v_person in select * from jsonb_array_elements(p_people) loop
    if jsonb_typeof(v_person) <> 'object' then
      raise exception 'BAD_PEOPLE' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_object(
      'first', left(btrim(coalesce(v_person->>'first', '')), 80),
      'last', left(btrim(coalesce(v_person->>'last', '')), 80),
      'maiden', left(btrim(coalesce(v_person->>'maiden', '')), 80),
      'place', left(btrim(coalesce(v_person->>'place', '')), 120)
    );
  end loop;
  return v_out;
end;
$$;

revoke all on function private.blog_people(jsonb) from public, anon, authenticated;

drop function public.create_blog_post(text, text);
drop function public.update_blog_post(uuid, text, text);
drop function public.published_blog_posts();
drop function public.blog_post(text);

create or replace function public.create_blog_post(
  p_title text,
  p_body text default '',
  p_kind text default 'person',
  p_people jsonb default '[]'::jsonb
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
  insert into public.blog_posts (slug, title, body, kind, people, created_by)
  values (
    private.blog_slug_for(v_title, null),
    v_title,
    coalesce(p_body, ''),
    coalesce(p_kind, 'person'),
    private.blog_people(p_people),
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
  p_people jsonb default '[]'::jsonb
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

-- A post's cover photo set (or taken off, with null), answering the path
-- it replaced, for the caller to remove that file.
create or replace function public.set_blog_post_cover(p_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  select cover_path into v_old from public.blog_posts where id = p_id for update;
  if not found then
    raise exception 'NO_POST' using errcode = 'P0002';
  end if;
  update public.blog_posts
  set cover_path = nullif(btrim(p_path), ''), updated_at = now()
  where id = p_id;
  return v_old;
end;
$$;

create or replace function public.published_blog_posts()
returns table (
  id uuid,
  slug text,
  title text,
  body text,
  kind text,
  cover_path text,
  people jsonb,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.body, p.kind, p.cover_path, p.people, p.published_at, p.updated_at
  from public.blog_posts p
  where p.published_at is not null
  order by p.published_at desc;
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
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.title, p.body, p.kind, p.cover_path, p.people, p.published_at, p.updated_at
  from public.blog_posts p
  where p.slug = p_slug
    and (p.published_at is not null or private.is_beta_reviewer());
$$;

revoke all on function public.create_blog_post(text, text, text, jsonb) from public, anon;
revoke all on function public.update_blog_post(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.set_blog_post_cover(uuid, text) from public, anon;
revoke all on function public.published_blog_posts() from public;
revoke all on function public.blog_post(text) from public;

grant execute on function public.create_blog_post(text, text, text, jsonb) to authenticated;
grant execute on function public.update_blog_post(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.set_blog_post_cover(uuid, text) to authenticated;
grant execute on function public.published_blog_posts() to anon, authenticated;
grant execute on function public.blog_post(text) to anon, authenticated;
