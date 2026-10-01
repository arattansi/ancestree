-- Step 95 — The weekly newsletter
--
-- Every member gets an email on Sunday: who was added to their trees, the
-- stories and album photos approved, and the birthdays and anniversaries
-- coming up, all limited to their own family (My Family Tree's rule, Step
-- 94). The app composes it (`lib/newsletter.ts`); a weekly Vercel Cron job
-- calls `/api/cron/newsletter`, which asks this database who is due and
-- marks each one done before it sends. Aalim chose that scheduler on
-- 2026-10-01; pg_cron stays off.
--
-- On for everyone unless they turn it off: from the switch in settings, or
-- signed out from the link in each email, which carries the member's own
-- unsubscribe token. The setting lives in a table of its own rather than on
-- `profiles`, which relatives on a tree can read: nobody else learns who
-- turned it off, and nobody else ever sees a token.
--
-- Additive only: a new table and three new functions, nothing live changed.

-- ---------------------------------------------------------------------------
-- 1. Who gets it
-- ---------------------------------------------------------------------------
create table public.newsletter_settings (
  user_id uuid primary key
    references public.profiles (auth_user_id) on delete cascade,
  -- On unless they turn it off. A member with no row yet is on.
  subscribed boolean not null default true,
  -- In the email's unsubscribe link, which works signed out.
  token uuid not null default gen_random_uuid() unique,
  -- When the last weekly issue was made for them: sent, or a quiet week
  -- with nothing to send. One a week, however often the job is called.
  last_issue_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.newsletter_settings is
  'Step 95: the weekly newsletter, per member. Members read their own `subscribed`; everything else is the service role''s.';

alter table public.newsletter_settings enable row level security;

-- New public tables get every privilege by default; a member gets only
-- their own row's switch, and only to read (writes go through
-- `set_newsletter`).
revoke all on table public.newsletter_settings from anon, authenticated;
grant select (user_id, subscribed) on table public.newsletter_settings to authenticated;

create policy newsletter_settings_select on public.newsletter_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. The switch in settings
-- ---------------------------------------------------------------------------
create or replace function public.set_newsletter(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_on is null then
    raise exception 'On or off' using errcode = '22004';
  end if;

  insert into public.newsletter_settings (user_id, subscribed)
  values (v_user, p_on)
  on conflict (user_id) do update
    set subscribed = excluded.subscribed,
        updated_at = now();
end;
$$;

revoke all on function public.set_newsletter(boolean) from public, anon;
grant execute on function public.set_newsletter(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who is due this week (service role only)
-- ---------------------------------------------------------------------------
-- Everyone on at least one tree with it on, who hasn't had an issue in the
-- last six days: their address, their own entry, their unsubscribe token,
-- the trees they're a member of (in the order they joined) and the start
-- of the week to tell them about: since their last issue, so a job that
-- runs late misses nothing, or the last seven days for a first one, and
-- never more than eight days back. `p_users` narrows it to some members (a
-- test send).
-- Writes nothing but the rows of members who have none yet, so a run that
-- fails before `claim_newsletter_issues` leaves everyone due.
create or replace function public.newsletter_due(p_users uuid[] default null)
returns table (
  user_id uuid,
  email text,
  self_person_id uuid,
  token uuid,
  since timestamptz,
  tree_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.newsletter_settings as s (user_id)
  select pr.auth_user_id
  from public.profiles pr
  where (p_users is null or pr.auth_user_id = any (p_users))
    and exists (
      select 1 from public.tree_members m where m.user_id = pr.auth_user_id
    )
  on conflict on constraint newsletter_settings_pkey do nothing;

  return query
  select
    s.user_id,
    u.email::text,
    pr.self_person_id,
    s.token,
    greatest(
      coalesce(s.last_issue_at, now() - interval '7 days'),
      now() - interval '8 days'
    ),
    array(
      select m.tree_id
      from public.tree_members m
      where m.user_id = s.user_id
      order by m.created_at, m.tree_id
    )
  from public.newsletter_settings s
  join public.profiles pr on pr.auth_user_id = s.user_id
  join auth.users u on u.id = s.user_id
  where s.subscribed
    and (s.last_issue_at is null or s.last_issue_at < now() - interval '6 days')
    and (p_users is null or s.user_id = any (p_users))
    and u.email is not null
    and exists (select 1 from public.tree_members m where m.user_id = s.user_id);
end;
$$;

revoke all on function public.newsletter_due(uuid[]) from public, anon, authenticated;
grant execute on function public.newsletter_due(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 4. This week's issue made (service role only)
-- ---------------------------------------------------------------------------
-- Marks each of `p_users` done for the week, just before their email goes,
-- and returns those it marked: anyone another run marked first (the job
-- called twice), or who turned it off meanwhile, is left out and not sent
-- to again.
create or replace function public.claim_newsletter_issues(p_users uuid[])
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  update public.newsletter_settings s
  set last_issue_at = now(),
      updated_at = now()
  where s.user_id = any (p_users)
    and s.subscribed
    and (s.last_issue_at is null or s.last_issue_at < now() - interval '6 days')
  returning s.user_id;
$$;

revoke all on function public.claim_newsletter_issues(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_newsletter_issues(uuid[]) to service_role;
