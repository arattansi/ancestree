-- Step 225: what became of each weekly newsletter (Aalim, 2026-11-07: "clicks
-- and opens", then "start clicks build"; this is the clicks). Nothing recorded
-- how many went out, or what was opened from them. Now, in `private`:
--
--   newsletter_issues   one row per weekly issue, by the UTC day it went out,
--                       and how many were sent. The cron job writes it
--                       (`record_newsletter_issue`), service role only.
--   newsletter_clicks   a signed-in member arriving from one of the issue's
--                       tagged links (`utm_campaign=newsletter`, the section in
--                       `utm_content`, the issue's day in `utm_term`, Step 225):
--                       once per member per section per issue. The member isn't
--                       kept, only md5 of them with the issue, enough to count
--                       them once, as Step 216 counts an invite's visitors.
--
-- `note_newsletter_click` is the proxy's call as the member; it counts only
-- for an issue that was sent, only a member's own, and at most 12 sections a
-- member an issue, so nobody can fill the table. `newsletter_engagement()` is
-- the analytics tab's card, beta reviewers only, like `invite_funnel()`.

create table private.newsletter_issues (
  issue_day date primary key,
  sent integer not null default 0 check (sent >= 0),
  updated_at timestamptz not null default now()
);

create table private.newsletter_clicks (
  id bigint generated always as identity primary key,
  issue_day date not null references private.newsletter_issues (issue_day) on delete cascade,
  -- Which block of the email: cards, messages, this-week, later, news, story,
  -- open, invite, write-a-story (`lib/newsletter-clicks.ts`).
  section text not null check (section ~ '^[a-z0-9-]{1,40}$'),
  -- md5 of the member and the issue: not the member.
  member_key text not null,
  at timestamptz not null default now(),
  unique (member_key, section)
);

create index newsletter_clicks_issue on private.newsletter_clicks (issue_day);

alter table private.newsletter_issues enable row level security;
alter table private.newsletter_clicks enable row level security;
revoke all on private.newsletter_issues from anon, authenticated;
revoke all on private.newsletter_clicks from anon, authenticated;

-- An issue went out, or is about to: `p_sent` more of them. The cron job calls
-- it with none before the first batch goes, so a first click never finds no
-- issue, and again with how many went. Service role only.
create or replace function public.record_newsletter_issue(p_day date, p_sent integer default 0)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.newsletter_issues as i (issue_day, sent)
  values (p_day, greatest(coalesce(p_sent, 0), 0))
  on conflict (issue_day)
  do update set sent = i.sent + excluded.sent, updated_at = now();
$$;

revoke all on function public.record_newsletter_issue(date, integer) from public, anon, authenticated;
grant execute on function public.record_newsletter_issue(date, integer) to service_role;

-- A member arrived from the issue of `p_issue`, at its block `p_section`. Says
-- nothing back, whatever it was given.
create or replace function public.note_newsletter_click(p_issue date, p_section text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_key text;
begin
  if v_user is null or p_issue is null or p_section is null
     or p_section !~ '^[a-z0-9-]{1,40}$' then
    return;
  end if;
  if not exists (select 1 from public.profiles p where p.auth_user_id = v_user) then
    return;
  end if;
  if not exists (select 1 from private.newsletter_issues i where i.issue_day = p_issue) then
    return;
  end if;

  v_key := md5('newsletter:' || v_user::text || ':' || p_issue::text);
  if (select count(*) from private.newsletter_clicks c where c.member_key = v_key) >= 12 then
    return;
  end if;

  insert into private.newsletter_clicks (issue_day, section, member_key)
  values (p_issue, p_section, v_key)
  on conflict (member_key, section) do nothing;
end;
$$;

revoke all on function public.note_newsletter_click(date, text) from public, anon;
grant execute on function public.note_newsletter_click(date, text) to authenticated;

-- The analytics tab's newsletter, newest issue first, the last 12: how many
-- were sent, how many members arrived from a link (once each however many
-- they opened), and how many by block.
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
          'by_section', t.by_section
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
           ) x) as by_section
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
