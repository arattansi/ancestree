-- Step 232: a week before a birthday card opens, everyone reminded to sign
-- it who hasn't is emailed once (Aalim, 2026-11-20: "create a notification
-- email for t-1 week as 'last chance to sign ___ birthday card!'").
--
-- Who: as the newsletter's Birthday Cards to Sign (Step 223,
-- `newsletter_cards_to_sign`): the members reminded to sign
-- (`private.card_reminder_members`, Step 217's decision 6: those whose My
-- Family Tree shows the person; never the person themself), on a card still
-- open for signing of someone living, who haven't signed it, signed in or
-- through their own personal link. Not someone with no email (Step 202),
-- nor a suspended account, nor anyone who unsubscribed.
--
-- When: from a week before the card opens (`opens_at`, midnight where the
-- person lives), from 8 in the member's morning (`profiles.time_zone`,
-- else UTC), as the managers' nudges are; once a card and member. A card
-- started later than that tells its signers at the next run after it's
-- started, until signing closes at the end of the day.
--
-- 1. `card_sign_emails`: each member's switch (on unless they turn it off)
--    and the token in each email's unsubscribe link, which works signed out
--    (`/card-emails/<token>`), as the message emails' (Step 182).
-- 2. `card_last_calls`: whom each card's email went to. A send Resend
--    turned down for a reason that may pass is taken off by the server, so
--    the next run tries again.
-- 3. `claim_card_last_calls()`: records and answers the emails due now,
--    with the address, the token, the person's first name, the day, how
--    many days off it is where the member is, and how many have signed.
--    Service role only: the cron sends them.

-- ---------------------------------------------------------------------------
-- 1. The switch
-- ---------------------------------------------------------------------------

create table public.card_sign_emails (
  user_id uuid primary key
    references public.profiles (auth_user_id) on delete cascade,
  -- On unless they turn it off. A member with no row yet is on.
  subscribed boolean not null default true,
  -- In each email's unsubscribe link, which works signed out.
  token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

comment on table public.card_sign_emails is
  'Step 232: whether a member is emailed a week before a birthday card they haven''t signed opens, and the token in those emails'' unsubscribe link. The service role''s only.';

alter table public.card_sign_emails enable row level security;
revoke all on table public.card_sign_emails from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Whom each card's email went to
-- ---------------------------------------------------------------------------

create table public.card_last_calls (
  card_id uuid not null references public.birthday_cards (id) on delete cascade,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

comment on table public.card_last_calls is
  'Step 232: one row a member emailed "last chance to sign" for a birthday card, once each. The service role''s only.';

alter table public.card_last_calls enable row level security;
revoke all on table public.card_last_calls from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The emails due now
-- ---------------------------------------------------------------------------

create function public.claim_card_last_calls()
returns table (
  user_id uuid,
  email text,
  token uuid,
  card_id uuid,
  person_id uuid,
  first_name text,
  opens_on date,
  days_away integer,
  signatures integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with cards as materialized (
    select c.id, c.person_id, c.opens_on
    from public.birthday_cards c
    join public.people p on p.id = c.person_id
    where c.opens_at <= now() + interval '7 days'
      and now() < c.closes_at
      and not p.is_deceased and p.date_of_death is null
  ),
  due as materialized (
    select c.id as card, c.person_id as person, c.opens_on as day, r.u,
      coalesce(private.time_zone_or_null(pr.time_zone), 'UTC') as zone
    from cards c
    cross join lateral (select distinct u from private.card_reminder_members(c.person_id) as u) r
    join public.profiles pr on pr.auth_user_id = r.u
    join auth.users au on au.id = r.u
    where extract(hour from now() at time zone coalesce(private.time_zone_or_null(pr.time_zone), 'UTC')) >= 8
      and au.email is not null
      and lower(au.email) not like '%@no-email.ancestree.space'
      and (au.banned_until is null or au.banned_until <= now())
      and not exists (
        select 1 from public.card_last_calls l where l.card_id = c.id and l.user_id = r.u
      )
      and not exists (
        select 1 from public.card_sign_emails e where e.user_id = r.u and not e.subscribed
      )
      and not exists (
        select 1 from public.card_signatures s
        where s.card_id = c.id
          and (
            s.signer_user_id = r.u
            or (pr.self_person_id is not null and s.signer_person_id = pr.self_person_id)
          )
      )
  ),
  noted as (
    insert into public.card_last_calls (card_id, user_id)
    select d.card, d.u from due d
    on conflict do nothing
    returning card_last_calls.card_id, card_last_calls.user_id
  ),
  switches as (
    insert into public.card_sign_emails (user_id)
    select distinct n.user_id from noted n
    -- A row that's there already answers its own token.
    on conflict on constraint card_sign_emails_pkey
      do update set token = card_sign_emails.token
    returning card_sign_emails.user_id, card_sign_emails.token
  )
  select n.user_id, au.email::text, sw.token, n.card_id, d.person,
    private.card_first_name(d.person), d.day,
    (d.day - (now() at time zone d.zone)::date)::integer,
    (select count(*) from public.card_signatures s where s.card_id = n.card_id)::integer
  from noted n
  join due d on d.card = n.card_id and d.u = n.user_id
  join switches sw on sw.user_id = n.user_id
  join auth.users au on au.id = n.user_id
  order by n.user_id, d.day, n.card_id;
end;
$$;

revoke all on function public.claim_card_last_calls() from public, anon, authenticated;
grant execute on function public.claim_card_last_calls() to service_role;
