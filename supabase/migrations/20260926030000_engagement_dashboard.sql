-- Step 56 — An engagement dashboard for the beta reviewers
--
-- Aalim asked (2026-09-25) for a dashboard of how much ancestree is used,
-- on its own tab of the account page, for Aalim's and Raiya's accounts
-- only. Those two are the beta reviewers (`private.beta_reviewers`, Step
-- 28), so that list decides who sees it: anyone added to it later sees it
-- too.
--
-- The dashboard counts across the whole site and never shows a person:
-- how many members there are and how many come back, what they add, and
-- how each tree is doing.
--
-- 1. `private.active_days` — the days each member used ancestree: one row
--    a member a UTC day, the date and nothing else. Nothing recorded this
--    before. The proxy notes it from now on, once a day a member; the days
--    before this migration are pieced together from sign-ins, token
--    refreshes and what members added, so those weeks can undercount (a
--    day someone only looked left no trace). A member's days go with their
--    account.
-- 2. `note_active_day()` — the proxy's call. Only a member is noted.
-- 3. `engagement_dashboard()` — everything the tab shows, as one jsonb.
--    Refused to anyone but a beta reviewer.

-- ---------------------------------------------------------------------------
-- 1. Days active
-- ---------------------------------------------------------------------------

-- The UTC day a moment falls on: how every count below draws its days.
create or replace function private.utc_day(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'utc')::date;
$$;

revoke all on function private.utc_day(timestamptz) from anon, public;

create table private.active_days (
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

comment on table private.active_days is
  'The UTC days each member used ancestree (Step 56), the date only. Noted by the proxy through note_active_day(); read only by engagement_dashboard().';

create index active_days_day on private.active_days (day);

alter table private.active_days enable row level security;
revoke all on table private.active_days from anon, authenticated, public;

-- The days before now, from what already shows someone was there: signing
-- in, a session's token refreshes, joining, and every kind of addition or
-- answer. Each is a day that member certainly used the site.
insert into private.active_days (user_id, day)
select distinct e.user_id, private.utc_day(e.at)
from (
  select u.id as user_id, u.last_sign_in_at as at from auth.users u
  union all select s.user_id, s.created_at from auth.sessions s
  union all select s.user_id, s.updated_at from auth.sessions s
  -- `refreshed_at` is a timestamp without a time zone, in UTC.
  union all select s.user_id, s.refreshed_at at time zone 'utc' from auth.sessions s
  -- `user_id` is text on this table.
  union all select t.user_id::uuid, t.created_at from auth.refresh_tokens t
  where t.user_id is not null
  union all select t.user_id::uuid, t.updated_at from auth.refresh_tokens t
  where t.user_id is not null
  union all select p.auth_user_id, p.created_at from public.profiles p
  union all select t.created_by, t.created_at from public.trees t
  union all select m.user_id, m.created_at from public.tree_members m
  union all select p.created_by, p.created_at from public.people p
  union all select p.verified_by, p.verified_at from public.people p
  union all select r.created_by, r.created_at from public.relationships r
  union all select pl.placed_by, pl.created_at from public.tree_placements pl
  union all select p.created_by, p.created_at from public.pets p
  union all select c.created_by, c.created_at from public.entry_comments c
  union all select c.resolved_by, c.resolved_at from public.entry_comments c
  union all select c.created_by, c.created_at from public.pet_comments c
  union all select d.uploaded_by, d.created_at from public.documents d
  union all select c.claimant_user_id, c.created_at from public.claims c
  union all select c.resolved_by, c.resolved_at from public.claims c
  union all select r.editor_user_id, r.created_at from public.entry_revisions r
  union all select r.reverted_by, r.reverted_at from public.entry_revisions r
  union all select s.resolved_by, s.resolved_at from public.connection_suggestions s
  union all select i.created_by, i.created_at from public.invites i
  union all select q.reviewed_by, q.reviewed_at from public.invite_requests q
  union all select q.user_id, q.created_at from public.tree_requests q
  union all select r.recipient_user_id, r.answered_at from public.invite_relays r
  union all select l.created_by, l.created_at from public.share_links l
  union all select n.recipient_user_id, n.read_at from public.notifications n
  union all select o.owner, o.created_at from storage.objects o
  where o.bucket_id in ('photos', 'documents')
) e
where e.user_id is not null
  and e.at is not null
  and exists (select 1 from public.profiles p where p.auth_user_id = e.user_id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Noting a day
-- ---------------------------------------------------------------------------

-- The signed-in member used ancestree today. True once they're noted (or
-- were already today); false for someone signed in who isn't a member yet,
-- whom the proxy asks about again on their next request.
create or replace function public.note_active_day()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null
     or not exists (select 1 from public.profiles p where p.auth_user_id = v_uid) then
    return false;
  end if;

  insert into private.active_days (user_id, day)
  values (v_uid, private.utc_day(now()))
  on conflict do nothing;
  return true;
end;
$$;

revoke all on function public.note_active_day() from anon, public;
grant execute on function public.note_active_day() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The dashboard
-- ---------------------------------------------------------------------------

-- Every count on the dashboard tab, across the whole site, for a beta
-- reviewer; `NOT_A_REVIEWER` for anyone else. Counts only: no names, no
-- addresses, nothing from an entry. Weeks are the seven days up to and
-- including a day, so the newest is the last seven days and never a part
-- week. Keys are snake_case; lib/dashboard.ts reads them.
create or replace function public.engagement_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
          union all select 'comments', private.utc_day(c.created_at)
          from public.entry_comments c
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
$$;

revoke all on function public.engagement_dashboard() from anon, public;
grant execute on function public.engagement_dashboard() to authenticated;
