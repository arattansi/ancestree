-- Step 226: the newsletter's opens, for the members who say yes (Aalim,
-- 2026-11-07: "build opens", after Step 225's clicks). France's CNIL (deliberation
-- 2026-042, §3.1) wants prior consent before the opening rate is measured, so:
--
--   newsletter_settings.count_opens      off unless the member turned it on, in
--                                        settings or on the newsletter's page
--   .count_opens_at / .count_opens_via   when it last changed, and where ('settings'
--                                        or 'page'): the proof of consent (§6)
--   .opens_asked_at                      when the newsletter last asked them, so it
--                                        asks again no sooner than six months
--   private.newsletter_pixels            one random key per opted-in member per issue
--                                        (the one-pixel image in their copy), and when
--                                        it was first loaded. The key isn't kept with
--                                        the member, so the count says how many, never
--                                        who.
--
-- `record_newsletter_pixels` and `note_newsletter_open` are the server's (service
-- role); `set_newsletter_opens` is the member's own switch.
-- `newsletter_engagement()` gains, per issue, how many were counting and how many of
-- those opened.

alter table public.newsletter_settings
  add column count_opens boolean not null default false,
  add column count_opens_at timestamptz,
  add column count_opens_via text check (count_opens_via in ('settings', 'page')),
  add column opens_asked_at timestamptz;

comment on column public.newsletter_settings.count_opens is
  'Step 226: they said yes to counting when their copy of the newsletter is opened. Off until they do.';

-- A member reads only whether it's on; the rest is the service role's.
grant select (count_opens) on table public.newsletter_settings to authenticated;

create table private.newsletter_pixels (
  key uuid primary key,
  issue_day date not null references private.newsletter_issues (issue_day) on delete cascade,
  opened_at timestamptz
);

create index newsletter_pixels_issue on private.newsletter_pixels (issue_day);

alter table private.newsletter_pixels enable row level security;
revoke all on private.newsletter_pixels from anon, authenticated;

-- Their switch in settings (Step 226), as `set_newsletter` is the newsletter's.
create or replace function public.set_newsletter_opens(p_on boolean)
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

  insert into public.newsletter_settings (user_id, count_opens, count_opens_at, count_opens_via)
  values (v_user, p_on, now(), 'settings')
  on conflict (user_id) do update
    set count_opens = excluded.count_opens,
        count_opens_at = now(),
        count_opens_via = 'settings',
        updated_at = now();
end;
$$;

revoke all on function public.set_newsletter_opens(boolean) from public, anon;
grant execute on function public.set_newsletter_opens(boolean) to authenticated;

-- The keys of the pixels in an issue's copies, made as it goes out; the issue is on
-- record (with none sent yet) if it isn't. Service role only.
create or replace function public.record_newsletter_pixels(p_day date, p_keys uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.newsletter_issues (issue_day) values (p_day)
  on conflict (issue_day) do nothing;
  insert into private.newsletter_pixels (key, issue_day)
  select k, p_day from unnest(coalesce(p_keys, '{}'::uuid[])) as k
  on conflict (key) do nothing;
$$;

revoke all on function public.record_newsletter_pixels(date, uuid[]) from public, anon, authenticated;
grant execute on function public.record_newsletter_pixels(date, uuid[]) to service_role;

-- A pixel was loaded: the first time is when it was opened. Says nothing about a key
-- it doesn't know. Service role only (the pixel's route).
create or replace function public.note_newsletter_open(p_key uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.newsletter_pixels
  set opened_at = now()
  where key = p_key and opened_at is null;
$$;

revoke all on function public.note_newsletter_open(uuid) from public, anon, authenticated;
grant execute on function public.note_newsletter_open(uuid) to service_role;

-- The analytics tab's newsletter (Step 225), now with the opens of those who said yes.
create or replace function public.newsletter_engagement()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'counted_from', (select min(i.issue_day) from private.newsletter_issues i),
    'issues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day', t.issue_day,
          'sent', t.sent,
          'clicked', t.clicked,
          'by_section', t.by_section,
          'counting', t.counting,
          'opened', t.opened
        )
        order by t.issue_day desc
      )
      from (
        select
          i.issue_day,
          i.sent,
          (select count(distinct c.member_key)
           from private.newsletter_clicks c
           where c.issue_day = i.issue_day) as clicked,
          (select coalesce(jsonb_object_agg(x.section, x.n), '{}'::jsonb)
           from (
             select c.section, count(*) as n
             from private.newsletter_clicks c
             where c.issue_day = i.issue_day
             group by c.section
           ) x) as by_section,
          (select count(*) from private.newsletter_pixels p
           where p.issue_day = i.issue_day) as counting,
          (select count(*) from private.newsletter_pixels p
           where p.issue_day = i.issue_day and p.opened_at is not null) as opened
        from private.newsletter_issues i
        order by i.issue_day desc
        limit 12
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.newsletter_engagement() from public, anon;
grant execute on function public.newsletter_engagement() to authenticated;
