-- Step 95 — When the weekly newsletter goes out
--
-- Aalim asked to control the newsletter's schedule from the app (2026-10-01):
-- the beta reviewers' dashboard sets the day it goes out and can pause it
-- for everyone. The Vercel Cron job now calls every day at 15:00 UTC (Hobby
-- allows one run a day, so the hour stays in `vercel.json`), and the app
-- sends only on the day set here, unless it's paused.
--
-- Additive only: a new one-row table and a function to change it.

create table public.newsletter_schedule (
  -- One row, for the whole site.
  id boolean primary key default true check (id),
  -- The day it goes out: 0 = Sunday … 6 = Saturday, as cron and JavaScript
  -- count them.
  weekday smallint not null default 0 check (weekday between 0 and 6),
  -- Nobody gets it while paused; each member's own switch is kept.
  paused boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.newsletter_schedule is
  'Step 95: the weekly newsletter''s day and pause, one row. Beta reviewers read it and change it through set_newsletter_schedule; the cron job reads it with the service role.';

insert into public.newsletter_schedule (id) values (true);

alter table public.newsletter_schedule enable row level security;

revoke all on table public.newsletter_schedule from anon, authenticated;
grant select (weekday, paused, updated_at) on table public.newsletter_schedule to authenticated;

create policy newsletter_schedule_select on public.newsletter_schedule
  for select to authenticated
  using ((select private.is_beta_reviewer()));

create or replace function public.set_newsletter_schedule(
  p_weekday smallint,
  p_paused boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'Only beta reviewers set the newsletter''s schedule'
      using errcode = '42501';
  end if;
  if p_weekday is null or p_weekday not between 0 and 6 or p_paused is null then
    raise exception 'A day and whether it''s paused' using errcode = '22023';
  end if;

  update public.newsletter_schedule
  set weekday = p_weekday,
      paused = p_paused,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id;
end;
$$;

revoke all on function public.set_newsletter_schedule(smallint, boolean) from public, anon;
grant execute on function public.set_newsletter_schedule(smallint, boolean) to authenticated;
