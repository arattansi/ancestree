-- Step 217.2 — Birthday cards in the app.
--
-- A card is one person's, for one birthday: whatever trees they're on, the
-- family sign the same card (one row a person and a year). It's sealed until
-- midnight on their birthday where they live: until then nothing about it is
-- readable by them, not the card, its signatures or its files. Every read
-- goes through the definer functions here; the tables have no policies.
--
-- 1. Time zones: `places.time_zone` (filled from GeoNames by
--    `scripts/import-geonames-time-zones.ts`) and `profiles.time_zone` (the
--    member's device, `set_my_time_zone`).
-- 2. `birthday_cards`, `card_signatures`, `private.card_nudges`.
-- 3. The rules: when a birthday falls, where it opens, who manages a card
--    (Aalim's brief: on one tree its Roots, the Branch who tends them, their
--    spouse and parents; on several only spouse and parents; else siblings and
--    children; else the home tree's Roots), who signs, who is reminded (members
--    whose My Family Tree shows them, as a card or a pill).
-- 4. The calls: start, sign, delete a signature or a card, read, flags for
--    the canvas, the person's first look.
-- 5. The service role's: nudges 14 days before, the word on the day.
-- 6. The `cards` bucket.
-- 7. Four notices.

-- ---------------------------------------------------------------------------
-- 1. Time zones
-- ---------------------------------------------------------------------------
alter table public.places add column time_zone text;

alter table public.profiles add column time_zone text
  check (time_zone is null or length(time_zone) between 1 and 64);

-- A name Postgres knows: anything else is no zone at all.
create or replace function private.time_zone_or_null(p_zone text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select z.name from pg_catalog.pg_timezone_names z
  where z.name = nullif(btrim(coalesce(p_zone, '')), '')
  limit 1;
$$;

-- The member's device's zone, as the browser or the phone says it, kept for
-- whatever needs their own midnight.
create or replace function public.set_my_time_zone(p_zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_zone text := private.time_zone_or_null(p_zone);
begin
  if v_uid is null or v_zone is null then
    return;
  end if;
  update public.profiles
  set time_zone = v_zone
  where auth_user_id = v_uid and time_zone is distinct from v_zone;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The tables
-- ---------------------------------------------------------------------------
create table public.birthday_cards (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- The year of the birthday it's for.
  year integer not null check (year between 2000 and 2200),
  opens_on date not null,
  -- Where it opens: where they live, else where they were born, else their
  -- device, else the starter's (`private.card_time_zone`).
  time_zone text not null,
  -- Midnight on `opens_on` there; signing closes at the next midnight.
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  started_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  -- The person's first look.
  opened_at timestamptz,
  -- When the service role told them (`announce_birthday_cards`).
  announced_at timestamptz,
  unique (person_id, year),
  check (closes_at > opens_at)
);

create table public.card_signatures (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.birthday_cards (id) on delete cascade,
  -- A member's; nobody's once their profile goes (Phase 2 adds signing out).
  signer_user_id uuid references public.profiles (auth_user_id) on delete set null,
  signer_name text not null check (length(btrim(signer_name)) between 1 and 80),
  message text check (message is null or length(message) <= 2000),
  audio_path text unique,
  audio_seconds integer check (audio_seconds is null or audio_seconds between 0 and 125),
  photo_path text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, signer_user_id),
  check (message is not null or audio_path is not null or photo_path is not null)
);

create index card_signatures_card_idx on public.card_signatures (card_id);

alter table public.birthday_cards enable row level security;
alter table public.card_signatures enable row level security;
revoke all on public.birthday_cards from anon, authenticated;
revoke all on public.card_signatures from anon, authenticated;

-- Who was nudged to start a card, a person and a year each, once.
create table private.card_nudges (
  person_id uuid not null references public.people (id) on delete cascade,
  year integer not null,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  at timestamptz not null default now(),
  primary key (person_id, year, user_id)
);

-- ---------------------------------------------------------------------------
-- 3. The rules
-- ---------------------------------------------------------------------------

-- A birthday in `p_year`: 29 February keeps the 28th in a year without one,
-- and a day past the month's end (never stored, but) keeps its last.
create or replace function private.card_day_in(p_year integer, p_month integer, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    p_year,
    p_month,
    least(
      p_day,
      extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::integer
    )
  );
$$;

-- The day their birthday next falls on, `p_from` included, as Upcoming reads
-- it (`lib/occasions.ts`): living, a day to keep (a whole date, a yearless
-- day and month, a circa year), never the day they were born.
create or replace function private.card_birthday_on(p_person uuid, p_from date)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month integer;
  v_day integer;
  v_born date;
  v_on date;
  v_year integer;
begin
  select
    case when p.date_of_birth is not null and p.date_of_birth_precision = 'day'
      then extract(month from p.date_of_birth)::integer else p.birth_month end,
    case when p.date_of_birth is not null and p.date_of_birth_precision = 'day'
      then extract(day from p.date_of_birth)::integer else p.birth_day end,
    case when p.date_of_birth_precision = 'day' then p.date_of_birth end
  into v_month, v_day, v_born
  from public.people p
  where p.id = p_person
    and not p.is_deceased
    and p.date_of_death is null
    and p.placeholder_number is null;

  if v_month is null or v_day is null or v_month not between 1 and 12 or v_day not between 1 and 31 then
    return null;
  end if;
  for v_year in extract(year from p_from)::integer .. extract(year from p_from)::integer + 1 loop
    v_on := private.card_day_in(v_year, v_month, v_day);
    if v_on >= p_from and (v_born is null or v_on > v_born) then
      return v_on;
    end if;
  end loop;
  return null;
end;
$$;

-- Where a card opens (decision 9): where they live now, else where they were
-- born, else their device, else `p_fallback`, else UTC. A country spanning
-- several zones, or a place typed rather than picked, has none.
create or replace function private.card_time_zone(p_person uuid, p_fallback text default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.time_zone_or_null(pl.time_zone) from public.places pl where pl.id = p.place_id_residence),
    (select private.time_zone_or_null(pl.time_zone) from public.places pl where pl.id = p.place_id_birth),
    (select private.time_zone_or_null(pr.time_zone) from public.profiles pr
      where pr.auth_user_id = private.person_owner_member(p.id)),
    private.time_zone_or_null(p_fallback),
    'UTC'
  )
  from public.people p
  where p.id = p_person;
$$;

-- The next birthday still to open, where it opens: midnight on the day there,
-- and the midnight after, when signing closes. None without a birthday.
create or replace function private.card_opening(p_person uuid, p_fallback text default null)
returns table (opens_on date, time_zone text, opens_at timestamptz, closes_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone text := private.card_time_zone(p_person, p_fallback);
  v_today date := (now() at time zone v_zone)::date;
  v_on date := private.card_birthday_on(p_person, v_today);
begin
  if v_on is null then
    return;
  end if;
  -- Already their birthday there: the next one is a year away.
  if (v_on::timestamp at time zone v_zone) <= now() then
    v_on := private.card_birthday_on(p_person, v_on + 1);
    if v_on is null then
      return;
    end if;
  end if;
  return query select
    v_on,
    v_zone,
    v_on::timestamp at time zone v_zone,
    (v_on + 1)::timestamp at time zone v_zone;
end;
$$;

-- Whether the Branch whose own entry is `p_branch_self` tends `p_person` on
-- `p_tree`: `private.own_branch_ids`, for any member rather than the caller.
create or replace function private.branch_tends(p_branch_self uuid, p_tree uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with own as (
    select id from private.branch_ids(p_branch_self, p_tree) as b(id)
  ),
  sides as (
    select r.root, b.id
    from private.root_person_ids(p_tree) as r(root)
    cross join lateral private.branch_ids(r.root, p_tree) as b(id)
  )
  select exists (
    select 1
    from sides s
    join own o on o.id = s.id
    where s.id = p_person
      and s.root in (select root from sides where id = p_branch_self)
  );
$$;

-- The members who manage someone's card: start it, see and remove every
-- signature before the day, delete it. Never the person themself.
create or replace function private.card_managers(p_person uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.person_owner_member(p_person);
  v_home uuid;
  v_trees integer;
  v_close uuid[];
begin
  select p.tree_id into v_home from public.people p where p.id = p_person;
  if v_home is null then
    return;
  end if;
  select count(*) into v_trees
  from public.tree_placements pl
  where pl.person_id = p_person and pl.status = 'active' and pl.detail = 'full';

  -- Their spouse (a marriage not ended, to someone living) and parents, as
  -- members.
  v_close := array(
    select distinct s.u from (
      select private.person_owner_member(o.id) as u
      from public.relationships r
      join public.people o
        on o.id = case when r.from_person = p_person then r.to_person else r.from_person end
      where r.type = 'spouse' and not r.is_divorced
        and p_person in (r.from_person, r.to_person)
        and not o.is_deceased and o.date_of_death is null
      union all
      select private.person_owner_member(r.from_person)
      from public.relationships r
      where r.type = 'parent' and r.to_person = p_person
    ) s
    where s.u is not null and s.u is distinct from v_owner
  );

  if v_trees <= 1 then
    return query
      select distinct x.u from (
        select m.user_id as u
        from public.tree_members m
        where m.tree_id = v_home and m.role = 'admin'
        union all
        select m.user_id
        from public.tree_members m
        join public.profiles pr on pr.auth_user_id = m.user_id
        where m.tree_id = v_home and m.role = 'branch_admin'
          and pr.self_person_id is not null
          and private.branch_tends(pr.self_person_id, v_home, p_person)
        union all
        select unnest(v_close)
      ) x
      where x.u is distinct from v_owner;
    return;
  end if;

  if cardinality(v_close) > 0 then
    return query select unnest(v_close);
    return;
  end if;

  -- On several trees with no spouse or parent on ancestree: siblings and
  -- children.
  return query
    select distinct s.u from (
      select private.person_owner_member(x.id) as u
      from (
        select r2.to_person as id
        from public.relationships r1
        join public.relationships r2
          on r2.from_person = r1.from_person and r2.type = 'parent' and r2.to_person <> p_person
        where r1.type = 'parent' and r1.to_person = p_person
        union
        select case when r.from_person = p_person then r.to_person else r.from_person end
        from public.relationships r
        where r.type = 'sibling' and p_person in (r.from_person, r.to_person)
        union
        select r.to_person
        from public.relationships r
        where r.type = 'parent' and r.from_person = p_person
      ) x
    ) s
    where s.u is not null and s.u is distinct from v_owner;
  if found then
    return;
  end if;

  -- Nobody at all (decision 4): the home tree's Roots.
  return query
    select m.user_id
    from public.tree_members m
    where m.tree_id = v_home and m.role = 'admin' and m.user_id is distinct from v_owner;
end;
$$;

create or replace function private.manages_card_of(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select auth.uid()) in (select private.card_managers(p_person));
$$;

-- Who may sign in the app (decision 6): a member of a tree that shows them in
-- full, never the person themself.
create or replace function private.may_sign_card_of(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.person_owner_member(p_person) is distinct from (select auth.uid())
    and exists (
      select 1 from public.tree_members m
      where m.user_id = (select auth.uid())
        and private.is_placed_in_full(m.tree_id, p_person)
    );
$$;

-- Whether a card takes signatures from the caller now: it may be signed by
-- them and signing hasn't closed.
create or replace function private.can_sign_card(p_card uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.birthday_cards c
    join public.people p on p.id = c.person_id
    where c.id = p_card
      and now() < c.closes_at
      and not p.is_deceased and p.date_of_death is null
      and private.may_sign_card_of(c.person_id)
  );
$$;

-- Who is reminded to sign (decision 6): members whose My Family Tree shows the
-- person, as a card or a pill. Blood is shared either way (the Step 55 walk),
-- so: everyone blood with them, everyone blood with someone they married or
-- had a child with, and those partners themselves; each a member of a tree
-- showing them in full, walked over the people those trees show.
create or replace function private.card_reminder_members(p_person uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive trees as (
    select pl.tree_id
    from public.tree_placements pl
    where pl.person_id = p_person and pl.status = 'active' and pl.detail = 'full'
  ),
  on_trees as (
    select distinct pl.person_id as id
    from public.tree_placements pl
    where pl.tree_id in (select tree_id from trees) and pl.status = 'active'
  ),
  partners as (
    select case when r.from_person = p_person then r.to_person else r.from_person end as id
    from public.relationships r
    where r.type = 'spouse' and p_person in (r.from_person, r.to_person)
    union
    select r2.from_person
    from public.relationships r1
    join public.relationships r2
      on r2.to_person = r1.to_person and r2.type = 'parent' and r2.from_person <> p_person
    where r1.type = 'parent' and r1.from_person = p_person
  ),
  up as (
    select p_person as id
    union
    select id from partners where id in (select id from on_trees)
    union
    select r.from_person
    from up
    join public.relationships r on r.to_person = up.id and r.type = 'parent'
    where r.from_person in (select id from on_trees)
  ),
  step as (
    select r.from_person as a, r.to_person as b
    from public.relationships r where r.type = 'parent'
    union all
    select r.from_person, r.to_person
    from public.relationships r where r.type = 'sibling'
    union all
    select r.to_person, r.from_person
    from public.relationships r where r.type = 'sibling'
  ),
  blood as (
    select id from up
    union
    select s.b
    from blood
    join step s on s.a = blood.id
    where s.b in (select id from on_trees)
  )
  select distinct m.user_id
  from public.tree_members m
  join public.profiles pr on pr.auth_user_id = m.user_id
  where m.tree_id in (select tree_id from trees)
    and (pr.self_person_id in (select id from blood) or pr.self_person_id in (select id from partners))
    and m.user_id is distinct from private.person_owner_member(p_person);
$$;

-- The tree a notice about `p_person` goes into for `p_user`: one of theirs
-- showing the person in full, the person's home first.
create or replace function private.card_notice_tree(p_user uuid, p_person uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.tree_id
  from public.tree_members m
  join public.people p on p.id = p_person
  where m.user_id = p_user and private.is_placed_in_full(m.tree_id, p_person)
  order by (m.tree_id = p.tree_id) desc, m.tree_id
  limit 1;
$$;

-- What a notice calls someone: the name they go by.
create or replace function private.card_first_name(p_person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p.preferred_name), ''),
    nullif(btrim(p.first_name), ''),
    nullif(btrim(p.last_name), ''),
    'them'
  )
  from public.people p
  where p.id = p_person;
$$;

-- "14 March"
create or replace function private.card_day_label(p_day date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_day, 'FMDD FMMonth');
$$;

-- A card as the caller may see it, signatures and all, or null: the person
-- only once it's open; its managers and those who signed it always; others
-- who may sign while it's still signing. The seal is here.
create or replace function private.card_json(p_card uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_card public.birthday_cards;
  v_recipient boolean;
  v_manager boolean;
  v_signed boolean;
  v_open boolean;
  v_signing boolean;
  v_may_sign boolean;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_card from public.birthday_cards where id = p_card;
  if not found then
    return null;
  end if;
  v_recipient := coalesce(private.person_owner_member(v_card.person_id) = v_uid, false);
  v_open := now() >= v_card.opens_at;
  v_signing := now() < v_card.closes_at;
  if v_recipient then
    if not v_open then
      return null;
    end if;
    v_manager := false;
    v_signed := false;
    v_may_sign := false;
  else
    v_manager := private.manages_card_of(v_card.person_id);
    v_signed := exists (
      select 1 from public.card_signatures s
      where s.card_id = p_card and s.signer_user_id = v_uid
    );
    v_may_sign := private.may_sign_card_of(v_card.person_id);
    if not (v_manager or v_signed or (v_may_sign and not v_open)) then
      return null;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_card.id,
    'personId', v_card.person_id,
    'year', v_card.year,
    'opensOn', v_card.opens_on,
    'opensAt', v_card.opens_at,
    'closesAt', v_card.closes_at,
    'isOpen', v_open,
    'signing', v_signing and v_may_sign and private.can_sign_card(v_card.id),
    'startedBy', coalesce(private.member_label(v_card.started_by), 'A relative'),
    'openedAt', v_card.opened_at,
    'recipient', v_recipient,
    'manager', v_manager,
    'signed', v_signed,
    'signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.signer_name,
        'personId', pr.self_person_id,
        'message', s.message,
        'audioPath', s.audio_path,
        'audioSeconds', s.audio_seconds,
        'photoPath', s.photo_path,
        'mine', s.signer_user_id = v_uid,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      ) order by s.created_at)
      from public.card_signatures s
      left join public.profiles pr on pr.auth_user_id = s.signer_user_id
      where s.card_id = v_card.id
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The calls
-- ---------------------------------------------------------------------------

-- Start someone's card for their next birthday (a manager, up to 30 days
-- before). Two managers at once get the one card. Those whose My Family Tree
-- shows them are told.
create or replace function public.start_birthday_card(p_person uuid, p_time_zone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_on date;
  v_zone text;
  v_opens timestamptz;
  v_closes timestamptz;
  v_id uuid;
  v_name text;
  v_starter text;
  v_new boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.manages_card_of(p_person) then
    raise exception 'CARD: not yours to start' using errcode = '42501';
  end if;
  if private.person_owner_member(p_person) is null then
    raise exception 'CARD: not on ancestree' using errcode = '22023';
  end if;
  select o.opens_on, o.time_zone, o.opens_at, o.closes_at
  into v_on, v_zone, v_opens, v_closes
  from private.card_opening(p_person, p_time_zone) o;
  if v_on is null then
    raise exception 'CARD: no birthday' using errcode = '22023';
  end if;
  if v_opens > now() + interval '31 days' then
    raise exception 'CARD: too early' using errcode = '22023';
  end if;

  insert into public.birthday_cards
    (person_id, year, opens_on, time_zone, opens_at, closes_at, started_by)
  values (
    p_person, extract(year from v_on)::integer, v_on, v_zone, v_opens, v_closes, v_uid
  )
  on conflict (person_id, year) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id into v_id from public.birthday_cards c
    where c.person_id = p_person and c.year = extract(year from v_on)::integer;
  else
    v_new := true;
  end if;

  if v_new then
    v_name := private.card_first_name(p_person);
    v_starter := coalesce(private.member_label(v_uid), 'A relative');
    insert into public.notifications (recipient_user_id, actor_user_id, type, person_id, tree_id, body)
    select r.u, v_uid, 'card_started', p_person, private.card_notice_tree(r.u, p_person),
      v_starter || ' started a card for ' || v_name || '''s birthday on '
        || private.card_day_label(v_on) || '.'
    from (select distinct u from private.card_reminder_members(p_person) as u) r
    where r.u is distinct from v_uid
      and private.card_notice_tree(r.u, p_person) is not null;
  end if;

  return jsonb_build_object('id', v_id, 'opensOn', v_on, 'started', v_new);
end;
$$;

-- Sign a card, or change one's own signature: a message, a recording, a
-- photo, any of them. Files are put in the card's folder first, by the
-- caller. Returns the files the change let go, for the server to remove.
create or replace function public.sign_birthday_card(
  p_card uuid,
  p_message text default null,
  p_audio_path text default null,
  p_audio_seconds integer default null,
  p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_audio text := nullif(btrim(coalesce(p_audio_path, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_old public.card_signatures;
  v_id uuid;
  v_person uuid;
  v_name text;
  v_new boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.can_sign_card(p_card) then
    raise exception 'CARD: not open for you to sign' using errcode = '42501';
  end if;
  if v_message is null and v_audio is null and v_photo is null then
    raise exception 'CARD: nothing to sign with' using errcode = '22023';
  end if;
  if length(v_message) > 2000 then
    raise exception 'CARD: longer than a message may be' using errcode = '22001';
  end if;
  if p_audio_seconds is not null and p_audio_seconds not between 0 and 125 then
    raise exception 'CARD: longer than a voice memo may be' using errcode = '22023';
  end if;
  -- Each file is in the card's folder, put there by the caller.
  if exists (
    select 1 from unnest(array_remove(array[v_audio, v_photo], null)) as f(path)
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'cards'
        and o.name = f.path
        and o.owner_id = v_uid::text
        and (storage.foldername(o.name))[1] = p_card::text
    )
  ) then
    raise exception 'CARD: that file didn''t arrive' using errcode = '22023';
  end if;

  select * into v_old from public.card_signatures
  where card_id = p_card and signer_user_id = v_uid;
  v_new := v_old.id is null;
  v_name := coalesce(private.member_label(v_uid), 'A relative');

  insert into public.card_signatures
    (card_id, signer_user_id, signer_name, message, audio_path, audio_seconds, photo_path)
  values (
    p_card, v_uid, left(v_name, 80), v_message, v_audio,
    case when v_audio is not null then p_audio_seconds end, v_photo
  )
  on conflict (card_id, signer_user_id) do update
  set signer_name = excluded.signer_name,
      message = excluded.message,
      audio_path = excluded.audio_path,
      audio_seconds = excluded.audio_seconds,
      photo_path = excluded.photo_path,
      updated_at = now()
  returning id into v_id;

  -- Managers hear of a new signature at most once a day a card.
  if v_new then
    select person_id into v_person from public.birthday_cards where id = p_card;
    insert into public.notifications (recipient_user_id, actor_user_id, type, person_id, tree_id, body)
    select m.u, v_uid, 'card_signed', v_person, private.card_notice_tree(m.u, v_person),
      v_name || ' signed ' || private.card_first_name(v_person) || '''s birthday card.'
    from (select distinct u from private.card_managers(v_person) as u) m
    where m.u is distinct from v_uid
      and private.card_notice_tree(m.u, v_person) is not null
      and not exists (
        select 1 from public.notifications n
        where n.recipient_user_id = m.u and n.type = 'card_signed'
          and n.person_id = v_person and n.created_at > now() - interval '1 day'
      );
  end if;

  return jsonb_build_object(
    'id', v_id,
    'released', to_jsonb(array_remove(array[
      case when v_old.audio_path is distinct from v_audio then v_old.audio_path end,
      case when v_old.photo_path is distinct from v_photo then v_old.photo_path end
    ], null))
  );
end;
$$;

-- Take a signature off: its signer, whenever; a manager, before the day.
-- Returns its files, for the server to remove.
create or replace function public.delete_card_signature(p_signature uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sig public.card_signatures;
  v_card public.birthday_cards;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_sig from public.card_signatures where id = p_signature;
  if not found then
    raise exception 'CARD: no such signature' using errcode = '22023';
  end if;
  select * into v_card from public.birthday_cards where id = v_sig.card_id;
  if not (
    v_sig.signer_user_id = v_uid
    or (now() < v_card.opens_at and private.manages_card_of(v_card.person_id))
  ) then
    raise exception 'CARD: not yours to take off' using errcode = '42501';
  end if;
  delete from public.card_signatures where id = p_signature;
  return jsonb_build_object(
    'released', to_jsonb(array_remove(array[v_sig.audio_path, v_sig.photo_path], null))
  );
end;
$$;

-- Delete a card before its day (a manager). Returns its files.
create or replace function public.delete_birthday_card(p_card uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.birthday_cards;
  v_files text[];
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_card from public.birthday_cards where id = p_card;
  if not found then
    raise exception 'CARD: no such card' using errcode = '22023';
  end if;
  if now() >= v_card.opens_at or not private.manages_card_of(v_card.person_id) then
    raise exception 'CARD: not yours to delete' using errcode = '42501';
  end if;
  v_files := array(
    select f from public.card_signatures s,
      unnest(array_remove(array[s.audio_path, s.photo_path], null)) as f
    where s.card_id = p_card
  );
  delete from public.birthday_cards where id = p_card;
  return jsonb_build_object('released', to_jsonb(v_files));
end;
$$;

-- What a person's sheet shows of their cards to the caller: the current one
-- (to sign, to open, or just opened), the earlier ones the caller may see,
-- and, for a manager, whether a card can be started.
create or replace function public.birthday_cards_for(p_person uuid, p_time_zone text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current jsonb;
  v_past jsonb;
  v_on date;
  v_opens timestamptz;
  v_can_start boolean := false;
begin
  if v_uid is null then
    return null;
  end if;

  select private.card_json(c.id) into v_current
  from public.birthday_cards c
  where c.person_id = p_person
    and c.opens_at > now() - interval '30 days'
    and private.card_json(c.id) is not null
  order by c.opens_at desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'year', x.year, 'opensOn', x.opens_on, 'count', x.n
  ) order by x.opens_on desc), '[]'::jsonb)
  into v_past
  from (
    select c.id, c.year, c.opens_on,
      (select count(*) from public.card_signatures s where s.card_id = c.id) as n
    from public.birthday_cards c
    where c.person_id = p_person
      and now() >= c.opens_at
      and c.id is distinct from (v_current ->> 'id')::uuid
      and private.card_json(c.id) is not null
    order by c.opens_on desc
    limit 20
  ) x;

  if v_current is null and private.manages_card_of(p_person)
    and private.person_owner_member(p_person) is not null then
    select o.opens_on, o.opens_at into v_on, v_opens
    from private.card_opening(p_person, p_time_zone) o;
    v_can_start := v_on is not null
      and v_opens <= now() + interval '31 days'
      and not exists (
        select 1 from public.birthday_cards c
        where c.person_id = p_person and c.year = extract(year from v_on)::integer
      );
  end if;

  return jsonb_build_object(
    'current', v_current,
    'past', v_past,
    'startsOn', case when v_can_start then v_on end
  );
end;
$$;

-- One card, for opening it again from the sheet's list.
create or replace function public.birthday_card(p_card uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.card_json(p_card);
$$;

-- What the canvas marks (an envelope beside someone's card, or the person's
-- own card ready): `sign` for a card the caller may still sign, `mine` for
-- their own, open, in its first week while they haven't looked.
create or replace function public.my_card_flags()
returns table (person_id uuid, state text, card_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.person_id,
    case when private.person_owner_member(c.person_id) = (select auth.uid()) then 'mine' else 'sign' end,
    c.id
  from public.birthday_cards c
  where (select auth.uid()) is not null
    and (
      (
        private.person_owner_member(c.person_id) = (select auth.uid())
        and now() >= c.opens_at
        and now() < c.opens_at + interval '7 days'
        and c.opened_at is null
      )
      or (
        now() < c.closes_at
        and private.may_sign_card_of(c.person_id)
      )
    );
$$;

-- The person's first look at their open card.
create or replace function public.mark_card_opened(p_card uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.birthday_cards c
  set opened_at = now()
  where c.id = p_card
    and c.opened_at is null
    and now() >= c.opens_at
    and private.person_owner_member(c.person_id) = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 5. The service role's
-- ---------------------------------------------------------------------------

-- Each run first moves any sealed card whose person has moved (Lives in) to
-- where they live now; then nudges each manager once, 14 days before a
-- birthday nobody has started a card for, from 8 in their morning.
create or replace function public.send_card_nudges()
returns table (user_id uuid, person_id uuid, tree_id uuid, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
  v_on date;
  v_opens timestamptz;
  v_year integer;
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
    continue when v_opens > now() + interval '14 days';
    v_year := extract(year from v_on)::integer;
    continue when exists (
      select 1 from public.birthday_cards c where c.person_id = v_person.id and c.year = v_year
    );

    return query
    with due as (
      select m.u
      from (select distinct u from private.card_managers(v_person.id) as u) m
      left join public.profiles pr on pr.auth_user_id = m.u
      where not exists (
          select 1 from private.card_nudges n
          where n.person_id = v_person.id and n.year = v_year and n.user_id = m.u
        )
        and extract(hour from now() at time zone coalesce(private.time_zone_or_null(pr.time_zone), 'UTC')) >= 8
        and private.card_notice_tree(m.u, v_person.id) is not null
    ),
    noted as (
      insert into private.card_nudges (person_id, year, user_id)
      select v_person.id, v_year, d.u from due d
      on conflict do nothing
      returning card_nudges.user_id
    ),
    sent as (
      insert into public.notifications (recipient_user_id, type, person_id, tree_id, body)
      select n.user_id, 'card_start_due', v_person.id, private.card_notice_tree(n.user_id, v_person.id),
        private.card_first_name(v_person.id) || '''s birthday is on '
          || private.card_day_label(v_on) || '. Start a card for the family to sign?'
      from noted n
      returning notifications.recipient_user_id, notifications.person_id, notifications.tree_id, notifications.body
    )
    select s.recipient_user_id, s.person_id, s.tree_id, s.body from sent s;
  end loop;
end;
$$;

-- On the day, from 8 in their morning, each open card's person is told once,
-- and handed back for the email. A card nobody signed says nothing.
create or replace function public.announce_birthday_cards()
returns table (card_id uuid, user_id uuid, person_id uuid, tree_id uuid, signatures integer, email text, first_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    update public.birthday_cards c
    set announced_at = now()
    where c.announced_at is null
      and now() >= c.opens_at + interval '8 hours'
      and now() < c.opens_at + interval '7 days'
    returning c.id, c.person_id
  ),
  told as (
    select d.id, d.person_id, private.person_owner_member(d.person_id) as u,
      (select count(*)::integer from public.card_signatures s where s.card_id = d.id) as n
    from due d
    join public.people p on p.id = d.person_id
    where not p.is_deceased and p.date_of_death is null
  ),
  sent as (
    insert into public.notifications (recipient_user_id, type, person_id, tree_id, body)
    select t.u, 'card_ready', t.person_id, private.card_notice_tree(t.u, t.person_id),
      'Your birthday card is here: ' || t.n
        || case when t.n = 1 then ' person signed it.' else ' people signed it.' end
    from told t
    where t.u is not null and t.n > 0 and private.card_notice_tree(t.u, t.person_id) is not null
    returning notifications.recipient_user_id, notifications.person_id, notifications.tree_id
  )
  select t.id, t.u, t.person_id, s.tree_id, t.n, au.email::text, private.card_first_name(t.person_id)
  from sent s
  join told t on t.u = s.recipient_user_id and t.person_id = s.person_id
  left join auth.users au on au.id = t.u;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.set_my_time_zone(text) from public, anon;
revoke all on function public.start_birthday_card(uuid, text) from public, anon;
revoke all on function public.sign_birthday_card(uuid, text, text, integer, text) from public, anon;
revoke all on function public.delete_card_signature(uuid) from public, anon;
revoke all on function public.delete_birthday_card(uuid) from public, anon;
revoke all on function public.birthday_cards_for(uuid, text) from public, anon;
revoke all on function public.birthday_card(uuid) from public, anon;
revoke all on function public.my_card_flags() from public, anon;
revoke all on function public.mark_card_opened(uuid) from public, anon;
grant execute on function public.set_my_time_zone(text) to authenticated;
grant execute on function public.start_birthday_card(uuid, text) to authenticated;
grant execute on function public.sign_birthday_card(uuid, text, text, integer, text) to authenticated;
grant execute on function public.delete_card_signature(uuid) to authenticated;
grant execute on function public.delete_birthday_card(uuid) to authenticated;
grant execute on function public.birthday_cards_for(uuid, text) to authenticated;
grant execute on function public.birthday_card(uuid) to authenticated;
grant execute on function public.my_card_flags() to authenticated;
grant execute on function public.mark_card_opened(uuid) to authenticated;

revoke all on function public.send_card_nudges() from public, anon, authenticated;
revoke all on function public.announce_birthday_cards() from public, anon, authenticated;
grant execute on function public.send_card_nudges() to service_role;
grant execute on function public.announce_birthday_cards() to service_role;

-- ---------------------------------------------------------------------------
-- 6. The files: a private bucket, one folder a card. Put there by someone
-- who may sign it; nobody reads it directly (the server signs links for what
-- `card_json` hands back); an upload no signature took is its uploader's to
-- remove. A signature's files go with the service role once it does.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cards', 'cards', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/wav'
  ]
)
on conflict (id) do nothing;

create policy storage_cards_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cards'
    and (select private.can_sign_card(private.uuid_or_null((storage.foldername(objects.name))[1])))
  );

create policy storage_cards_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cards'
    and owner_id = (select auth.uid())::text
  );

create policy storage_cards_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cards'
    and owner_id = (select auth.uid())::text
    and not exists (
      select 1 from public.card_signatures s
      where s.audio_path = objects.name or s.photo_path = objects.name
    )
  );

-- ---------------------------------------------------------------------------
-- 7. The notices
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_updated',
    'person_added', 'edit_reverted', 'placement_requested',
    'placements_requested', 'placement_accepted', 'placement_declined',
    'placements_lapsed', 'tree_request_approved', 'placed_on_join',
    'joined_by_link', 'change_suggested', 'suggestion_accepted',
    'suggestion_declined', 'story_to_approve', 'story_approved',
    'story_declined', 'story_commented', 'photo_to_approve',
    'photo_approved', 'photo_declined', 'placeholder_child',
    'invite_renewed', 'member_joined', 'message_reported',
    'message_report_resolved', 'signed_in_by_link',
    'card_start_due', 'card_started', 'card_signed', 'card_ready'
  ));
