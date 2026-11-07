-- Step 224: managers hear that a birthday card can be started as soon as it
-- can (Aalim, 2026-11-07: "build a notification for users when a birthday
-- card can be started"). Until now `send_card_nudges` told them in the app
-- only, 14 days before, while `start_birthday_card` takes a start from 31
-- days before.
--
-- Aalim's calls: managers only (`private.card_managers`, as Step 217's
-- decision 5); told when starting opens, 31 days before, and reminded at
-- 14 if nobody has started it; in the app, on their phones (the Birthday
-- cards switch, sent by the cron with the service role) and in the weekly
-- newsletter, beside Step 223's Birthday Cards to Sign. No email.
--
-- 1. `private.card_nudges` keeps a kind: `open` (31 days) and `reminder`
--    (14), each once a person, year and manager.
-- 2. `send_card_nudges` re-created from 20261030090000_birthday_cards (the
--    live body is asserted first): the first notice from 31 days, a
--    reminder from 14 when nobody started it and the first came at least a
--    week before, from 8 in the manager's morning as before. Each row now
--    says its kind, the person's first name and whether their phones may be
--    told (`private.push_reachable`, Step 217.4's switch), for the cron's
--    pushes. The rows' columns change, so it's dropped and made again.
-- 3. `newsletter_cards_to_start(p_users)`: for each reader, the cards they
--    manage that can be started now and nobody has. Service role only, as
--    `newsletter_cards_to_sign` is.

do $$
begin
  if md5(pg_get_functiondef('public.send_card_nudges()'::regprocedure))
      <> 'b8fcdb5404af7962cce4b4463502b0ce' then
    raise exception 'send_card_nudges changed since 20261030090000_birthday_cards';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Two nudges a birthday
-- ---------------------------------------------------------------------------

-- Any nudge already sent went 14 days before: a reminder's window.
alter table private.card_nudges add column kind text not null default 'reminder'
  check (kind in ('open', 'reminder'));
alter table private.card_nudges alter column kind drop default;
alter table private.card_nudges drop constraint card_nudges_pkey;
alter table private.card_nudges add primary key (person_id, year, user_id, kind);

comment on table private.card_nudges is
  'Step 217: who was nudged to start a birthday card. Step 224: `open` when starting opens (31 days before), `reminder` at 14 when nobody has; each once a person, year and manager.';

-- ---------------------------------------------------------------------------
-- 2. The nudges
-- ---------------------------------------------------------------------------

drop function public.send_card_nudges();

-- Each run first moves any sealed card whose person has moved (Lives in) to
-- where they live now; then tells each manager of a birthday nobody has
-- started a card for, from 8 in their morning: once when starting opens,
-- 31 days before, and once more from 14 days before, unless the first came
-- less than a week ago. Whoever first hears within the 14 days hears the
-- first notice's words.
create function public.send_card_nudges()
returns table (
  user_id uuid,
  person_id uuid,
  tree_id uuid,
  body text,
  kind text,
  first_name text,
  push boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
  v_on date;
  v_opens timestamptz;
  v_year integer;
  v_kind text;
  v_name text;
begin
  update public.birthday_cards c
  set time_zone = o.time_zone, opens_at = o.opens_at, closes_at = o.closes_at
  from (
    select c2.id, z.zone as time_zone,
      c2.opens_on::timestamp at time zone z.zone as opens_at,
      (c2.opens_on + 1)::timestamp at time zone z.zone as closes_at
    from public.birthday_cards c2
    cross join lateral (select private.card_time_zone(c2.person_id, c2.time_zone) as zone) z
    where c2.opens_at > now() + interval '1 hour'
      and z.zone is distinct from c2.time_zone
  ) o
  where c.id = o.id
    and o.opens_at > now();

  for v_person in
    select p.id
    from public.people p
    where not p.is_deceased and p.date_of_death is null and p.placeholder_number is null
      and private.person_owner_member(p.id) is not null
      and (
        (p.date_of_birth is not null and p.date_of_birth_precision = 'day')
        or (p.birth_month is not null and p.birth_day is not null)
      )
  loop
    v_on := null;
    select o.opens_on, o.opens_at into v_on, v_opens
    from private.card_opening(v_person.id) o;
    continue when v_on is null;
    -- As far ahead as `start_birthday_card` takes a start.
    continue when v_opens > now() + interval '31 days';
    v_year := extract(year from v_on)::integer;
    continue when exists (
      select 1 from public.birthday_cards c where c.person_id = v_person.id and c.year = v_year
    );
    v_kind := case when v_opens > now() + interval '14 days' then 'open' else 'reminder' end;
    v_name := private.card_first_name(v_person.id);

    return query
    with due as (
      select m.u,
        exists (
          select 1 from private.card_nudges n
          where n.person_id = v_person.id and n.year = v_year and n.user_id = m.u
            and n.kind = 'open'
        ) as told
      from (select distinct u from private.card_managers(v_person.id) as u) m
      left join public.profiles pr on pr.auth_user_id = m.u
      where not exists (
          select 1 from private.card_nudges n
          where n.person_id = v_person.id and n.year = v_year and n.user_id = m.u
            and (
              n.kind = v_kind
              -- A reminder waits a week after the first.
              or (v_kind = 'reminder' and n.kind = 'open' and n.at > now() - interval '7 days')
            )
        )
        and extract(hour from now() at time zone coalesce(private.time_zone_or_null(pr.time_zone), 'UTC')) >= 8
        and private.card_notice_tree(m.u, v_person.id) is not null
    ),
    noted as (
      insert into private.card_nudges (person_id, year, user_id, kind)
      select v_person.id, v_year, d.u, v_kind from due d
      on conflict do nothing
      returning card_nudges.user_id
    ),
    sent as (
      insert into public.notifications (recipient_user_id, type, person_id, tree_id, body)
      select n.user_id, 'card_start_due', v_person.id, private.card_notice_tree(n.user_id, v_person.id),
        case
          when d.told then
            'No card yet for ' || v_name || '''s birthday on '
              || private.card_day_label(v_on) || '. Start one for the family to sign?'
          else
            v_name || '''s birthday is on '
              || private.card_day_label(v_on) || '. Start a card for the family to sign?'
        end
      from noted n
      join due d on d.u = n.user_id
      returning notifications.recipient_user_id, notifications.person_id, notifications.tree_id, notifications.body
    )
    select s.recipient_user_id, s.person_id, s.tree_id, s.body, v_kind, v_name,
      private.push_reachable(s.recipient_user_id, 'cards')
    from sent s;
  end loop;
end;
$$;

revoke all on function public.send_card_nudges() from public, anon, authenticated;
grant execute on function public.send_card_nudges() to service_role;

-- ---------------------------------------------------------------------------
-- 3. The newsletter's Birthday Cards to Start
-- ---------------------------------------------------------------------------

-- For each of `p_users`, every living member's next birthday they manage
-- (`private.card_managers`, never the person themself) whose card can be
-- started now, as `start_birthday_card` would take it (31 days before), and
-- nobody has, on a tree of theirs that shows the person in full, as the
-- nudges are. Service role only, as `newsletter_cards_to_sign` is.
create or replace function public.newsletter_cards_to_start(p_users uuid[])
returns table (
  user_id uuid,
  person_id uuid,
  first_name text,
  opens_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  with startable as materialized (
    select p.id, o.opens_on
    from public.people p
    cross join lateral private.card_opening(p.id) o
    where not p.is_deceased and p.date_of_death is null and p.placeholder_number is null
      and private.person_owner_member(p.id) is not null
      and (
        (p.date_of_birth is not null and p.date_of_birth_precision = 'day')
        or (p.birth_month is not null and p.birth_day is not null)
      )
      and o.opens_at <= now() + interval '31 days'
      and not exists (
        select 1 from public.birthday_cards c
        where c.person_id = p.id and c.year = extract(year from o.opens_on)::integer
      )
  )
  select m.u, s.id, private.card_first_name(s.id), s.opens_on
  from startable s
  cross join lateral (select distinct u from private.card_managers(s.id) as u) m
  where m.u = any(p_users)
    and private.card_notice_tree(m.u, s.id) is not null
  order by m.u, s.opens_on, s.id;
$$;

revoke all on function public.newsletter_cards_to_start(uuid[]) from public, anon, authenticated;
grant execute on function public.newsletter_cards_to_start(uuid[]) to service_role;
