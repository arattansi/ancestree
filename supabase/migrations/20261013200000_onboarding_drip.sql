-- Step 151 — Getting started emails: the onboarding drip
--
-- Aalim asked (2026-10-13) for emails that keep new members going and bring
-- their family in, starting with inviting the people they've added to
-- claim their entries. He chose a drip that answers to how each member is
-- using ancestree: the days since they were last active (Step 56's
-- `private.active_days`) set how often they hear from us, and the first
-- step they haven't taken picks what they hear. The app decides
-- (`lib/onboarding.ts`) and sends (`lib/onboarding.server.ts`) from the
-- newsletter's daily cron call; this database says who is in the drip,
-- what each has done, and what each has been sent.
--
-- On for every member unless they turn it off, from its own box in
-- settings or signed out from the link in each email (their own token), as
-- the newsletter's switch (Step 95), and apart from it: turning one off
-- leaves the other on. Members who joined before this are in from the day
-- the job first sees them, as new ones are.
--
-- Additive only: two new tables and three new functions.

-- ---------------------------------------------------------------------------
-- 1. Who is in it
-- ---------------------------------------------------------------------------
create table public.onboarding_settings (
  user_id uuid primary key
    references public.profiles (auth_user_id) on delete cascade,
  -- On unless they turn it off. A member with no row yet is on.
  subscribed boolean not null default true,
  -- In each email's unsubscribe link, which works signed out.
  token uuid not null default gen_random_uuid() unique,
  -- The day the drip first saw them: about when they joined, or the day it
  -- began for members who were here before. It runs 60 days from here.
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_settings is
  'Step 151: the getting started emails, per member. Members read their own `subscribed`; everything else is the service role''s.';

alter table public.onboarding_settings enable row level security;

revoke all on table public.onboarding_settings from anon, authenticated;
grant select (user_id, subscribed) on table public.onboarding_settings to authenticated;

create policy onboarding_settings_select on public.onboarding_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. What each has been sent
-- ---------------------------------------------------------------------------
-- One row an email, at most one a member a UTC day. `step` is the email:
-- one of the four steps (claim, invite, family, story), or the win-back
-- sent once an absence, or the last one at a month away.
create table public.onboarding_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  step text not null
    check (step in ('claim', 'invite', 'family', 'story', 'winback', 'last')),
  sent_at timestamptz not null default now(),
  sent_day date not null default private.utc_day(now()),
  unique (user_id, sent_day)
);

comment on table public.onboarding_sends is
  'Step 151: each getting started email sent, one a member a day. The service role''s only.';

alter table public.onboarding_sends enable row level security;
revoke all on table public.onboarding_sends from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The switch in settings
-- ---------------------------------------------------------------------------
create or replace function public.set_onboarding_emails(p_on boolean)
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

  insert into public.onboarding_settings (user_id, subscribed)
  values (v_user, p_on)
  on conflict (user_id) do update
    set subscribed = excluded.subscribed,
        updated_at = now();
end;
$$;

revoke all on function public.set_onboarding_emails(boolean) from public, anon;
grant execute on function public.set_onboarding_emails(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who is in the drip today, and what each has done (service role only)
-- ---------------------------------------------------------------------------
-- Every member on at least one tree with it on, whose 60 days haven't run
-- out, with an address and not suspended: what the app needs to pick their
-- email.
--   - `last_active`: the last UTC day they used ancestree.
--   - `claimable`: the living entries they made that nobody is behind yet
--     (`private.person_is_claimable`, no placeholder child), on a tree they
--     still belong to, with no live invite to claim them out: the people
--     to invite. Oldest first.
--   - `people_added`: every entry they made but their own.
--   - `invited`: they've made an invite of any kind (a relative, a claim,
--     the family link).
--   - `shared`: they've written a story or put up an album photo.
--   - `tree_ids` in the order they joined; `root_of`, the ones they run.
--   - `sends`: every email of the drip they've had, oldest first.
-- Makes a row for each member who has none yet (in from today), and
-- writes nothing else. `p_users` narrows it to some members (a test send).
create or replace function public.onboarding_due(p_users uuid[] default null)
returns table (
  user_id uuid,
  email text,
  self_person_id uuid,
  token uuid,
  started_at timestamptz,
  last_active date,
  claimable uuid[],
  people_added integer,
  invited boolean,
  shared boolean,
  tree_ids uuid[],
  root_of uuid[],
  sends jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.onboarding_settings as s (user_id)
  select pr.auth_user_id
  from public.profiles pr
  where (p_users is null or pr.auth_user_id = any (p_users))
    and exists (
      select 1 from public.tree_members m where m.user_id = pr.auth_user_id
    )
  on conflict on constraint onboarding_settings_pkey do nothing;

  return query
  select
    s.user_id,
    u.email::text,
    pr.self_person_id,
    s.token,
    s.started_at,
    (select max(d.day) from private.active_days d where d.user_id = s.user_id),
    array(
      select pe.id
      from public.people pe
      where pe.created_by = s.user_id
        and pe.id is distinct from pr.self_person_id
        and pe.placeholder_number is null
        and not pe.is_deceased
        and pe.date_of_death is null
        and private.person_is_claimable(pe.id)
        and exists (
          select 1 from public.tree_members m
          where m.user_id = s.user_id and m.tree_id = pe.tree_id
        )
        and not exists (
          select 1 from public.invites i
          where i.person_id = pe.id
            and i.status = 'active'
            and i.archived_at is null
            and (i.expires_at is null or i.expires_at > now())
        )
      order by pe.created_at, pe.id
    ),
    (
      select count(*)::integer from public.people pe
      where pe.created_by = s.user_id
        and pe.id is distinct from pr.self_person_id
    ),
    exists (
      select 1 from public.invites i
      where i.created_by = s.user_id and not i.founds_tree
    ),
    exists (select 1 from public.stories st where st.created_by = s.user_id)
      or exists (select 1 from public.album_photos ap where ap.created_by = s.user_id),
    array(
      select m.tree_id
      from public.tree_members m
      where m.user_id = s.user_id
      order by m.created_at, m.tree_id
    ),
    array(
      select m.tree_id
      from public.tree_members m
      where m.user_id = s.user_id and m.role = 'admin'
      order by m.created_at, m.tree_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('step', o.step, 'sent_at', o.sent_at)
          order by o.sent_at
        )
        from public.onboarding_sends o
        where o.user_id = s.user_id
      ),
      '[]'::jsonb
    )
  from public.onboarding_settings s
  join public.profiles pr on pr.auth_user_id = s.user_id
  join auth.users u on u.id = s.user_id
  where s.subscribed
    and s.started_at > now() - interval '60 days'
    and (p_users is null or s.user_id = any (p_users))
    and u.email is not null
    and (u.banned_until is null or u.banned_until <= now())
    and exists (select 1 from public.tree_members m where m.user_id = s.user_id);
end;
$$;

revoke all on function public.onboarding_due(uuid[]) from public, anon, authenticated;
grant execute on function public.onboarding_due(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Today's emails, noted just before they go (service role only)
-- ---------------------------------------------------------------------------
-- `p_sends` is `[{ "user_id": …, "step": … }, …]`. Notes each one that is
-- still on and hasn't had one today, and returns those it noted: a member
-- another run reached first (the job called twice), or who turned it off
-- meanwhile, is left out and not sent to again.
create or replace function public.record_onboarding_sends(p_sends jsonb)
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.onboarding_sends (user_id, step)
  select x.user_id, x.step
  from jsonb_to_recordset(p_sends) as x (user_id uuid, step text)
  where exists (
    select 1 from public.onboarding_settings s
    where s.user_id = x.user_id and s.subscribed
  )
  on conflict (user_id, sent_day) do nothing
  returning user_id;
$$;

revoke all on function public.record_onboarding_sends(jsonb) from public, anon, authenticated;
grant execute on function public.record_onboarding_sends(jsonb) to service_role;
