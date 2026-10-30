-- Step 217.3 — Birthday cards: the public link and joining.
--
-- A card's managers make it one public link, for the family chat, and a
-- personal link for a relative on the tree with no account, which is also
-- their link to claim their entry. Anyone holding a link signs, signed in as
-- themself or signed out with their name; signed out, the browser keeps an
-- edit token (a cookie) to change or take off their signature and, after
-- the day, to open the card. A family signer who'd pass the bloodline gate
-- on the person's home tree is offered Ask to join; the link never lets
-- anyone onto the tree itself.
--
-- 1. `card_signatures` says how it was signed, the signer's relation, and
--    the hash of a signed-out signer's edit token.
-- 2. `private.card_links` (only the token's hash), `private.card_uploads`
--    (the files a link signer was handed a place for), `private.card_events`.
-- 3. `invite_requests` from a card: `source` 'card', `relation`,
--    `card_person_id`.
-- 4. The rules: a link's token, the relation words, who may join.
-- 5. Managers' calls: make, turn off, personal links, shares.
-- 6. The service role's, for /c/<token> and /api/cards/*: the page, an
--    upload's place, signing, taking off, opens, asking to join, stale
--    uploads.
-- 7. `card_json` and `sign_birthday_card` again, with the link and the event.
-- 8. A personal link's claim noted from `invite_events`; `card_funnel()`.

-- ---------------------------------------------------------------------------
-- 1. Signatures
-- ---------------------------------------------------------------------------
alter table public.card_signatures
  add column relation text check (relation is null or relation in (
    'mother', 'father', 'sister', 'brother', 'daughter', 'son',
    'wife', 'husband', 'partner',
    'grandmother', 'grandfather', 'granddaughter', 'grandson',
    'aunt', 'uncle', 'niece', 'nephew', 'cousin', 'in_law', 'other_family',
    'friend'
  )),
  add column came_by text not null default 'app'
    check (came_by in ('app', 'link', 'personal_link')),
  -- A signed-out signer's: sha256 of their browser's secret and the card.
  add column edit_token_hash text unique
    check (edit_token_hash is null or edit_token_hash ~ '^[0-9a-f]{64}$'),
  -- A personal link's relative, whose entry the card shows for them.
  add column signer_person_id uuid references public.people (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Links, uploads, events
-- ---------------------------------------------------------------------------
create table private.card_links (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.birthday_cards (id) on delete cascade,
  kind text not null check (kind in ('public', 'personal')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- A personal link's relative, and their claim invite (kept with no
  -- foreign key: claiming deletes the invite).
  person_id uuid references public.people (id) on delete cascade,
  invite_id uuid,
  made_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((kind = 'public') = (person_id is null))
);

create unique index card_links_one_public on private.card_links (card_id)
  where kind = 'public' and revoked_at is null;
create index card_links_card on private.card_links (card_id);
create index card_links_invite on private.card_links (invite_id) where invite_id is not null;

-- A place in the card's folder handed to a link signer, for one file of
-- theirs: `signer` is 'u:' and their account, or their edit token's hash.
-- Gone once a signature takes it; a day old and untaken, the cron removes
-- the file. No foreign key, so a deleted card's leave too.
create table private.card_uploads (
  path text primary key,
  card_id uuid not null,
  signer text not null,
  kind text not null check (kind in ('audio', 'photo')),
  created_at timestamptz not null default now()
);

create index card_uploads_signer on private.card_uploads (signer, created_at);
create index card_uploads_at on private.card_uploads (created_at);

-- What happens to cards' links, for the analytics tab:
--
--   made        a link made: public or personal
--   shared      a share button a manager pressed: share / whatsapp /
--               messages / copy
--   opened      a link's page drawn, once per visitor a day
--   signed      a new signature: app, link or personal_link
--   join_shown  the join button shown, once per visitor a day
--   asked       an Ask to join sent from the card
--   claimed     a personal link's relative claimed their entry
--
-- No IP, no user agent, no visitor id: an open's `dedupe` is a hash of the
-- browser's secret, the link, the day and what; a signature's `visitor` a
-- hash of the secret and the day, to count three a day.
create table private.card_events (
  id bigint generated always as identity primary key,
  card_id uuid not null references public.birthday_cards (id) on delete cascade,
  link_id uuid references private.card_links (id) on delete set null,
  kind text not null
    check (kind in ('made', 'shared', 'opened', 'signed', 'join_shown', 'asked', 'claimed')),
  detail text,
  visitor text,
  dedupe text unique,
  at timestamptz not null default now(),
  constraint card_events_detail check (
    (kind = 'made' and detail in ('public', 'personal'))
    or (kind = 'shared' and detail in ('share', 'whatsapp', 'messages', 'copy'))
    or (kind = 'signed' and detail in ('app', 'link', 'personal_link'))
    or (kind not in ('made', 'shared', 'signed') and detail is null)
  )
);

create index card_events_at on private.card_events (at);
create index card_events_card on private.card_events (card_id, kind);
create index card_events_visitor on private.card_events (visitor, at) where visitor is not null;

alter table private.card_links enable row level security;
alter table private.card_uploads enable row level security;
alter table private.card_events enable row level security;
revoke all on private.card_links from anon, authenticated;
revoke all on private.card_uploads from anon, authenticated;
revoke all on private.card_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Asking to join from a card
-- ---------------------------------------------------------------------------
alter table public.invite_requests drop constraint invite_requests_source_check;
alter table public.invite_requests add constraint invite_requests_source_check
  check (source in ('request', 'direct', 'card'));
alter table public.invite_requests
  add column relation text check (relation is null or relation in (
    'mother', 'father', 'sister', 'brother', 'daughter', 'son',
    'wife', 'husband', 'partner',
    'grandmother', 'grandfather', 'granddaughter', 'grandson',
    'aunt', 'uncle', 'niece', 'nephew', 'cousin', 'in_law', 'other_family'
  )),
  -- Whose card they signed: "from Ada's birthday card".
  add column card_person_id uuid references public.people (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. The rules
-- ---------------------------------------------------------------------------

-- The link a token opens, revoked or not: a token is 144 random bits as
-- URL-safe base64, and only its sha256 is kept.
create or replace function private.card_link_by_token(p_token text)
returns setof private.card_links
language sql
stable
security definer
set search_path = ''
as $$
  select l.* from private.card_links l
  where p_token ~ '^[A-Za-z0-9_-]{24}$'
    and l.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- A link signer's key for their signature and uploads: their account, or
-- the hash of their browser's secret with the card.
create or replace function private.card_signer_key(p_card uuid, p_viewer uuid, p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_viewer is not null then 'u:' || p_viewer::text
    when p_secret ~ '^[A-Za-z0-9_-]{32,64}$'
      then encode(extensions.digest(p_secret || ':' || p_card::text, 'sha256'), 'hex')
  end;
$$;

-- A signed-out browser today, to count its signatures: its secret and the
-- UTC day, hashed, so no two days' are the same.
create or replace function private.card_visitor(p_secret text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_secret ~ '^[A-Za-z0-9_-]{32,64}$'
    then encode(extensions.digest(p_secret || ':visitor:' || private.utc_day(now())::text, 'sha256'), 'hex')
  end;
$$;

-- A relation someone says they are, family's words.
create or replace function private.card_family_relation(p_relation text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_relation in (
    'mother', 'father', 'sister', 'brother', 'daughter', 'son',
    'wife', 'husband', 'partner',
    'grandmother', 'grandfather', 'granddaughter', 'grandson',
    'aunt', 'uncle', 'niece', 'nephew', 'cousin', 'in_law', 'other_family'
  ), false);
$$;

-- Whether someone who says they're `p_relation` to the person would pass the
-- bloodline gate on the person's home tree (decision 11): anyone family
-- when the person is blood there (or the tree has no gate); when they
-- married in, only their children and spouse. A friend never.
create or replace function private.card_join_eligible(p_person uuid, p_relation text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_home uuid;
begin
  if not private.card_family_relation(p_relation) then
    return false;
  end if;
  select p.tree_id into v_home from public.people p where p.id = p_person;
  if v_home is null then
    return false;
  end if;
  if not private.bloodline_gate_active(v_home)
     or exists (select 1 from private.blood_ids(v_home) as b(id) where b.id = p_person) then
    return true;
  end if;
  return p_relation in ('daughter', 'son', 'wife', 'husband', 'partner');
end;
$$;

-- The person is under 18 (decision 14: only a parent turns on their link).
create or replace function private.card_for_a_minor(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.birth_age(p.date_of_birth, p.date_of_birth_precision) = 'minor'
    from public.people p where p.id = p_person
  ), false);
$$;

-- Whether the caller may turn on the person's public link: a manager, and a
-- parent of theirs when they're under 18.
create or replace function private.may_share_card_of(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.manages_card_of(p_person)
    and (not private.card_for_a_minor(p_person) or private.is_own_child(p_person));
$$;

-- The relatives of someone, as their My Family Tree would hold them, on the
-- trees showing them in full: everyone blood with them or with someone they
-- married or had a child with, and those partners (the walk
-- `card_reminder_members` makes, returning people rather than members).
create or replace function private.card_relative_people(p_person uuid)
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
  select id from blood where id <> p_person and id in (select id from on_trees)
  union
  select id from partners where id in (select id from on_trees);
$$;

-- A card's signatures as a link signer sees them, once they've signed:
-- names, relations, messages, files. Nothing of who they are on a tree.
create or replace function private.card_link_signatures_json(p_card uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.signer_name,
    'relation', s.relation,
    'message', s.message,
    'audioPath', s.audio_path,
    'audioSeconds', s.audio_seconds,
    'photoPath', s.photo_path,
    'mine', coalesce(
      ('u:' || s.signer_user_id::text) = p_key or s.edit_token_hash = p_key,
      false
    ),
    'createdAt', s.created_at,
    'updatedAt', s.updated_at
  ) order by s.created_at), '[]'::jsonb)
  from public.card_signatures s
  where s.card_id = p_card;
$$;

-- ---------------------------------------------------------------------------
-- 5. Managers' calls
-- ---------------------------------------------------------------------------

-- Turn on a card's public link, or make it again: any link before stops
-- working. The token comes back once; only its hash is kept.
create or replace function public.make_card_link(p_card uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.birthday_cards;
  v_token text;
  v_link uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_card from public.birthday_cards where id = p_card for update;
  if not found or not private.manages_card_of(v_card.person_id) then
    raise exception 'CARD: not yours to share' using errcode = '42501';
  end if;
  if not private.may_share_card_of(v_card.person_id) then
    raise exception 'CARD: only a parent can share it' using errcode = '42501';
  end if;
  if now() >= v_card.closes_at then
    raise exception 'CARD: signing has closed' using errcode = '22023';
  end if;

  update private.card_links set revoked_at = now()
  where card_id = p_card and kind = 'public' and revoked_at is null;

  v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into private.card_links (card_id, kind, token_hash, made_by)
  values (p_card, 'public', encode(extensions.digest(v_token, 'sha256'), 'hex'), (select auth.uid()))
  returning id into v_link;
  insert into private.card_events (card_id, link_id, kind, detail)
  values (p_card, v_link, 'made', 'public');
  return v_token;
end;
$$;

-- Turn the public link off: it stops working, for signing and for reading.
create or replace function public.revoke_card_link(p_card uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select person_id into v_person from public.birthday_cards where id = p_card;
  if v_person is null or not private.manages_card_of(v_person) then
    raise exception 'CARD: not yours to share' using errcode = '42501';
  end if;
  update private.card_links set revoked_at = now()
  where card_id = p_card and kind = 'public' and revoked_at is null;
end;
$$;

-- The relatives a manager could send their own link: on a tree showing the
-- person, living, not a placeholder, nobody behind the entry, not known to
-- be under 18, and one the manager may invite to claim it on a tree of
-- theirs (`can_invite_to_claim_on`), the person's home tree first.
create or replace function public.card_personal_candidates(p_card uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_card public.birthday_cards;
  v_home uuid;
begin
  select * into v_card from public.birthday_cards where id = p_card;
  if not found or now() >= v_card.closes_at or not private.manages_card_of(v_card.person_id) then
    return '[]'::jsonb;
  end if;
  select p.tree_id into v_home from public.people p where p.id = v_card.person_id;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'personId', x.id,
      'name', x.name,
      'firstName', x.first_name,
      'sex', x.sex,
      'treeId', x.tree_id,
      'signed', x.signed
    ) order by x.signed, x.name)
    from (
      select pe.id,
        btrim(coalesce(nullif(btrim(pe.preferred_name), ''), pe.first_name, '') || ' ' || coalesce(pe.last_name, '')) as name,
        coalesce(nullif(btrim(pe.preferred_name), ''), nullif(btrim(pe.first_name), ''), pe.last_name) as first_name,
        pe.sex,
        (
          select m.tree_id from public.tree_members m
          where m.user_id = (select auth.uid())
            and private.can_invite_to_claim_on(m.tree_id, pe.id)
          order by (m.tree_id = v_home) desc, m.tree_id
          limit 1
        ) as tree_id,
        exists (
          select 1 from public.card_signatures s
          where s.card_id = p_card and s.signer_person_id = pe.id
        ) as signed
      from public.people pe
      where pe.id in (select private.card_relative_people(v_card.person_id))
        and not pe.is_deceased and pe.date_of_death is null
        and pe.placeholder_number is null
        and private.person_owner_member(pe.id) is null
        and private.birth_age(pe.date_of_birth, pe.date_of_birth_precision) <> 'minor'
      limit 60
    ) x
    where x.tree_id is not null
  ), '[]'::jsonb);
end;
$$;

-- A relative's own link to the card, which is also their claim link: the
-- invite (`makeClaimLink`, made first) must be a live bare claim on their
-- entry. The token comes back once.
create or replace function public.make_card_personal_link(p_card uuid, p_person uuid, p_invite_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.birthday_cards;
  v_invite uuid;
  v_token text;
  v_link uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_card from public.birthday_cards where id = p_card;
  if not found or not private.manages_card_of(v_card.person_id) then
    raise exception 'CARD: not yours to share' using errcode = '42501';
  end if;
  if now() >= v_card.closes_at then
    raise exception 'CARD: signing has closed' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.card_personal_candidates(p_card)) c
    where c ->> 'personId' = p_person::text
  ) then
    raise exception 'CARD: not one to send a link' using errcode = '42501';
  end if;
  select i.id into v_invite from public.invites i
  where i.token = p_invite_token
    and i.person_id = p_person
    and i.status = 'active'
    and not i.founds_tree
    and i.invited_email is null
    and i.max_uses is null
    and i.archived_at is null
    and (i.expires_at is null or i.expires_at > now());
  if v_invite is null then
    raise exception 'CARD: their claim link didn''t work' using errcode = '22023';
  end if;

  v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into private.card_links (card_id, kind, token_hash, person_id, invite_id, made_by)
  values (
    p_card, 'personal', encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_person, v_invite, (select auth.uid())
  )
  returning id into v_link;
  insert into private.card_events (card_id, link_id, kind, detail)
  values (p_card, v_link, 'made', 'personal');
  return v_token;
end;
$$;

-- A share button a manager pressed on one of the card's links.
create or replace function public.note_card_shared(p_token text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_person uuid;
begin
  if (select auth.uid()) is null or p_channel not in ('share', 'whatsapp', 'messages', 'copy') then
    return;
  end if;
  select * into v_link from private.card_link_by_token(p_token);
  if not found or v_link.revoked_at is not null then
    return;
  end if;
  select person_id into v_person from public.birthday_cards where id = v_link.card_id;
  if not private.manages_card_of(v_person) then
    return;
  end if;
  insert into private.card_events (card_id, link_id, kind, detail)
  values (v_link.card_id, v_link.id, 'shared', p_channel);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The service role's, for the link's page and routes
-- ---------------------------------------------------------------------------

-- What /c/<token> shows. Null for a token that opens nothing; 'gone' for a
-- link turned off (unless this browser signed through it); 'peek' for the
-- person themself, signed in (nothing but the day); else the page: their
-- first name and the day, who's collecting, their birthplace (for the
-- leaf) and photo unless they hide their entry from visitors, and, once
-- the viewer has signed, the signatures. `p_viewer` is the signed-in
-- account, `p_secret` a signed-out browser's.
create or replace function public.card_link_view(p_token text, p_viewer uuid default null, p_secret text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_card public.birthday_cards;
  v_person public.people;
  v_key text;
  v_mine public.card_signatures;
  v_member boolean;
  v_open boolean;
  v_signing boolean;
  v_claim text;
  v_relative public.people;
begin
  select * into v_link from private.card_link_by_token(p_token);
  if not found then
    return null;
  end if;
  select * into v_card from public.birthday_cards where id = v_link.card_id;
  select * into v_person from public.people where id = v_card.person_id;

  if p_viewer is not null and private.person_owner_member(v_card.person_id) = p_viewer then
    return jsonb_build_object(
      'state', 'peek',
      'firstName', private.card_first_name(v_card.person_id),
      'opensOn', v_card.opens_on
    );
  end if;

  v_key := private.card_signer_key(v_card.id, p_viewer, p_secret);
  select * into v_mine from public.card_signatures s
  where s.card_id = v_card.id
    and v_key is not null
    and (('u:' || s.signer_user_id::text) = v_key or s.edit_token_hash = v_key);

  if v_link.revoked_at is not null and v_mine.id is null then
    return jsonb_build_object('state', 'gone');
  end if;

  v_open := now() >= v_card.opens_at;
  v_signing := v_link.revoked_at is null
    and now() < v_card.closes_at
    and not v_person.is_deceased and v_person.date_of_death is null;
  v_member := p_viewer is not null and exists (
    select 1 from public.tree_members m
    where m.user_id = p_viewer and private.is_placed(m.tree_id, v_card.person_id)
  );

  if v_link.kind = 'personal' then
    select * into v_relative from public.people where id = v_link.person_id;
    -- Their claim link, once they've signed, while it's live and theirs to use.
    if v_mine.id is not null and not v_member then
      select i.token into v_claim from public.invites i
      where i.id = v_link.invite_id
        and i.status = 'active'
        and i.archived_at is null
        and (i.expires_at is null or i.expires_at > now())
        and private.person_owner_member(v_link.person_id) is null;
    end if;
  end if;

  return jsonb_build_object(
    'state', 'live',
    'cardId', v_card.id,
    'linkId', v_link.id,
    'kind', v_link.kind,
    'firstName', private.card_first_name(v_card.person_id),
    'sex', v_person.sex,
    'opensOn', v_card.opens_on,
    'opensAt', v_card.opens_at,
    'closesAt', v_card.closes_at,
    'isOpen', v_open,
    'signing', v_signing,
    'collector', split_part(coalesce(private.member_label(v_card.started_by), 'A relative'), ' ', 1),
    'birthplace', case when not v_person.hidden_from_visitors then jsonb_build_object(
      'city', v_person.city_of_birth, 'country', v_person.country_of_birth) end,
    'photoPath', case when not v_person.hidden_from_visitors then v_person.photo_path end,
    'photoCrop', case when not v_person.hidden_from_visitors then v_person.photo_crop end,
    'member', v_member,
    'viewerName', case when p_viewer is not null then private.member_label(p_viewer) end,
    'personal', case when v_link.kind = 'personal' then jsonb_build_object(
      'name', btrim(coalesce(nullif(btrim(v_relative.preferred_name), ''), v_relative.first_name, '')
        || ' ' || coalesce(v_relative.last_name, ''))
    ) end,
    'claimToken', v_claim,
    'mine', case when v_mine.id is not null then jsonb_build_object(
      'id', v_mine.id,
      'name', v_mine.signer_name,
      'relation', v_mine.relation,
      'message', v_mine.message,
      'audioPath', v_mine.audio_path,
      'audioSeconds', v_mine.audio_seconds,
      'photoPath', v_mine.photo_path,
      'updatedAt', v_mine.updated_at
    ) end,
    'joinable', v_mine.id is not null
      and v_link.kind = 'public'
      and v_link.revoked_at is null
      and not v_member
      and private.card_join_eligible(v_card.person_id, v_mine.relation),
    'signatures', case when v_mine.id is not null
      then private.card_link_signatures_json(v_card.id, v_key) end
  );
end;
$$;

-- A place in the card's folder for one file of a link signer's, before
-- signing (`createSignedUploadUrl`, so it never passes through a
-- function). Refused if they couldn't sign: the link off, signing closed,
-- the card full, or three signatures from this browser today already.
create or replace function public.card_link_upload(
  p_token text,
  p_viewer uuid,
  p_secret text,
  p_kind text,
  p_type text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_card public.birthday_cards;
  v_key text;
  v_ext text;
  v_path text;
begin
  select * into v_link from private.card_link_by_token(p_token);
  if not found or v_link.revoked_at is not null then
    raise exception 'CARD: this link no longer works' using errcode = '22023';
  end if;
  select * into v_card from public.birthday_cards where id = v_link.card_id;
  if now() >= v_card.closes_at then
    raise exception 'CARD: signing has closed' using errcode = '22023';
  end if;
  if p_viewer is not null and private.person_owner_member(v_card.person_id) = p_viewer then
    raise exception 'CARD: no peeking' using errcode = '42501';
  end if;
  v_key := private.card_signer_key(v_card.id, p_viewer, p_secret);
  if v_key is null then
    raise exception 'CARD: no signer' using errcode = '22023';
  end if;
  v_ext := case p_type
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    when 'audio/mp4' then 'm4a' when 'audio/x-m4a' then 'm4a' when 'audio/aac' then 'aac'
    when 'audio/mpeg' then 'mp3' when 'audio/ogg' then 'ogg' when 'audio/webm' then 'webm'
    when 'audio/wav' then 'wav'
  end;
  if v_ext is null or p_kind not in ('audio', 'photo')
     or (p_kind = 'photo') <> (p_type like 'image/%') then
    raise exception 'CARD: not a file the card takes' using errcode = '22023';
  end if;

  -- Someone who hasn't signed yet must be able to.
  if not exists (
    select 1 from public.card_signatures s
    where s.card_id = v_card.id
      and (('u:' || s.signer_user_id::text) = v_key or s.edit_token_hash = v_key)
  ) then
    if (select count(*) from public.card_signatures s where s.card_id = v_card.id) >= 200 then
      raise exception 'CARD: this card is full' using errcode = '23514';
    end if;
    if p_viewer is null and (
      select count(*) from private.card_events e
      where e.visitor = private.card_visitor(p_secret) and e.kind = 'signed'
    ) >= 3 then
      raise exception 'CARD: three cards a day' using errcode = '23514';
    end if;
  end if;
  if (
    select count(*) from private.card_uploads u
    where u.signer = v_key and u.created_at > now() - interval '1 day'
  ) >= 8 then
    raise exception 'CARD: too many files' using errcode = '23514';
  end if;
  if (select count(*) from private.card_uploads u where u.created_at > now() - interval '1 hour') >= 600 then
    raise exception 'CARD: too many right now' using errcode = '23514';
  end if;

  v_path := v_card.id::text || '/' || gen_random_uuid()::text || '.' || v_ext;
  insert into private.card_uploads (path, card_id, signer, kind)
  values (v_path, v_card.id, v_key, p_kind);
  return v_path;
end;
$$;

-- Sign through a link, or change one's signature: signed in, as themself
-- (one signature an account, as in the app); signed out, with a name, kept
-- by the browser's edit token. Files are in the places `card_link_upload`
-- handed this signer, or kept from their signature. Caps: 200 a card, three
-- new ones a day from one browser, 300 an hour from every link together.
-- Managers hear of it as of one signed in the app. Returns the files the
-- change let go.
create or replace function public.sign_card_by_link(
  p_token text,
  p_viewer uuid,
  p_secret text,
  p_name text,
  p_relation text,
  p_message text,
  p_audio_path text,
  p_audio_seconds integer,
  p_photo_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_card public.birthday_cards;
  v_person public.people;
  v_key text;
  v_old public.card_signatures;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_audio text := nullif(btrim(coalesce(p_audio_path, '')), '');
  v_photo text := nullif(btrim(coalesce(p_photo_path, '')), '');
  v_relation text := nullif(btrim(coalesce(p_relation, '')), '');
  v_name text;
  v_came text;
  v_id uuid;
begin
  select * into v_link from private.card_link_by_token(p_token);
  if not found or v_link.revoked_at is not null then
    raise exception 'CARD: this link no longer works' using errcode = '22023';
  end if;
  -- One at a time a card, so its caps count true.
  select * into v_card from public.birthday_cards where id = v_link.card_id for update;
  select * into v_person from public.people where id = v_card.person_id;
  if now() >= v_card.closes_at or v_person.is_deceased or v_person.date_of_death is not null then
    raise exception 'CARD: signing has closed' using errcode = '22023';
  end if;
  if p_viewer is not null and private.person_owner_member(v_card.person_id) = p_viewer then
    raise exception 'CARD: no peeking' using errcode = '42501';
  end if;
  v_key := private.card_signer_key(v_card.id, p_viewer, p_secret);
  if v_key is null then
    raise exception 'CARD: no signer' using errcode = '22023';
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
  if v_relation is not null and v_relation <> 'friend' and not private.card_family_relation(v_relation) then
    raise exception 'CARD: not a relation' using errcode = '22023';
  end if;

  select * into v_old from public.card_signatures s
  where s.card_id = v_card.id
    and (('u:' || s.signer_user_id::text) = v_key or s.edit_token_hash = v_key);

  -- Each file: kept from their signature, or put in a place handed to them
  -- for this card, as its kind, and arrived.
  if v_audio is not null and v_audio is distinct from v_old.audio_path and not exists (
    select 1 from private.card_uploads u
    join storage.objects o on o.bucket_id = 'cards' and o.name = u.path
    where u.path = v_audio and u.card_id = v_card.id and u.signer = v_key and u.kind = 'audio'
      and coalesce(o.metadata ->> 'mimetype', '') like 'audio/%'
  ) then
    raise exception 'CARD: that file didn''t arrive' using errcode = '22023';
  end if;
  if v_photo is not null and v_photo is distinct from v_old.photo_path and not exists (
    select 1 from private.card_uploads u
    join storage.objects o on o.bucket_id = 'cards' and o.name = u.path
    where u.path = v_photo and u.card_id = v_card.id and u.signer = v_key and u.kind = 'photo'
      and coalesce(o.metadata ->> 'mimetype', '') like 'image/%'
  ) then
    raise exception 'CARD: that file didn''t arrive' using errcode = '22023';
  end if;

  if p_viewer is not null then
    v_name := coalesce(private.member_label(p_viewer), 'A relative');
  else
    v_name := nullif(btrim(coalesce(p_name, '')), '');
    if v_name is null then
      raise exception 'CARD: a name to sign with' using errcode = '22023';
    end if;
  end if;
  if length(v_name) > 80 then
    raise exception 'CARD: a shorter name' using errcode = '22001';
  end if;

  if v_old.id is null then
    if (select count(*) from public.card_signatures s where s.card_id = v_card.id) >= 200 then
      raise exception 'CARD: this card is full' using errcode = '23514';
    end if;
    if p_viewer is null and (
      select count(*) from private.card_events e
      where e.visitor = private.card_visitor(p_secret) and e.kind = 'signed'
    ) >= 3 then
      raise exception 'CARD: three cards a day' using errcode = '23514';
    end if;
    if (
      select count(*) from private.card_events e
      where e.kind = 'signed' and e.detail in ('link', 'personal_link')
        and e.at > now() - interval '1 hour'
    ) >= 300 then
      raise exception 'CARD: too many right now' using errcode = '23514';
    end if;

    v_came := case v_link.kind when 'personal' then 'personal_link' else 'link' end;
    insert into public.card_signatures (
      card_id, signer_user_id, signer_name, relation, message, audio_path, audio_seconds,
      photo_path, came_by, edit_token_hash, signer_person_id
    ) values (
      v_card.id, p_viewer, left(v_name, 80), v_relation, v_message, v_audio,
      case when v_audio is not null then p_audio_seconds end, v_photo, v_came,
      case when p_viewer is null then v_key end,
      case when v_link.kind = 'personal' and p_viewer is null then v_link.person_id end
    )
    returning id into v_id;

    insert into private.card_events (card_id, link_id, kind, detail, visitor)
    values (
      v_card.id, v_link.id, 'signed', v_came,
      case when p_viewer is null then private.card_visitor(p_secret) end
    );

    -- Managers hear of a new signature at most once a day a card.
    insert into public.notifications (recipient_user_id, actor_user_id, type, person_id, tree_id, body)
    select m.u, p_viewer, 'card_signed', v_card.person_id, private.card_notice_tree(m.u, v_card.person_id),
      v_name || ' signed ' || private.card_first_name(v_card.person_id) || '''s birthday card.'
    from (select distinct u from private.card_managers(v_card.person_id) as u) m
    where m.u is distinct from p_viewer
      and private.card_notice_tree(m.u, v_card.person_id) is not null
      and not exists (
        select 1 from public.notifications n
        where n.recipient_user_id = m.u and n.type = 'card_signed'
          and n.person_id = v_card.person_id and n.created_at > now() - interval '1 day'
      );
  else
    update public.card_signatures
    set signer_name = left(v_name, 80),
        relation = coalesce(v_relation, case when v_old.came_by = 'app' then null else relation end),
        message = v_message,
        audio_path = v_audio,
        audio_seconds = case when v_audio is not null then p_audio_seconds end,
        photo_path = v_photo,
        updated_at = now()
    where id = v_old.id
    returning id into v_id;
  end if;

  delete from private.card_uploads u where u.path in (v_audio, v_photo);

  return jsonb_build_object(
    'id', v_id,
    'created', v_old.id is null,
    'released', to_jsonb(array_remove(array[
      case when v_old.audio_path is distinct from v_audio then v_old.audio_path end,
      case when v_old.photo_path is distinct from v_photo then v_old.photo_path end
    ], null))
  );
end;
$$;

-- A link signer takes their own signature off, whenever, even through a link
-- since turned off. Returns its files.
create or replace function public.delete_card_signature_by_link(
  p_token text,
  p_viewer uuid,
  p_secret text,
  p_signature uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_key text;
  v_sig public.card_signatures;
begin
  select * into v_link from private.card_link_by_token(p_token);
  if not found then
    raise exception 'CARD: this link no longer works' using errcode = '22023';
  end if;
  v_key := private.card_signer_key(v_link.card_id, p_viewer, p_secret);
  select * into v_sig from public.card_signatures s
  where s.id = p_signature
    and s.card_id = v_link.card_id
    and v_key is not null
    and (('u:' || s.signer_user_id::text) = v_key or s.edit_token_hash = v_key);
  if v_sig.id is null then
    raise exception 'CARD: not yours to take off' using errcode = '42501';
  end if;
  delete from public.card_signatures where id = v_sig.id;
  return jsonb_build_object(
    'released', to_jsonb(array_remove(array[v_sig.audio_path, v_sig.photo_path], null))
  );
end;
$$;

-- A link's page drawn (`opened`) or its join button shown (`join_shown`),
-- by the page's beacon: once per browser per link per day, at most 500 a
-- link a day, never the person or the card's managers. Says nothing back.
create or replace function public.note_card_link_seen(p_token text, p_viewer uuid, p_secret text, p_what text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_person uuid;
  v_day date := private.utc_day(now());
begin
  if p_what not in ('opened', 'join_shown') or p_secret !~ '^[A-Za-z0-9_-]{32,64}$' then
    return;
  end if;
  select * into v_link from private.card_link_by_token(p_token);
  if not found or v_link.revoked_at is not null then
    return;
  end if;
  select person_id into v_person from public.birthday_cards where id = v_link.card_id;
  if p_viewer is not null and (
    private.person_owner_member(v_person) = p_viewer
    or p_viewer in (select private.card_managers(v_person))
  ) then
    return;
  end if;
  if (
    select count(*) from private.card_events e
    where e.link_id = v_link.id and e.kind = p_what
      and e.at >= v_day::timestamp at time zone 'utc'
  ) >= 500 then
    return;
  end if;
  insert into private.card_events (card_id, link_id, kind, dedupe)
  values (
    v_link.card_id, v_link.id, p_what,
    md5(p_secret || ':' || v_link.id::text || ':' || p_what || ':' || v_day::text)
  )
  on conflict (dedupe) do nothing;
end;
$$;

-- Ask to join from the card (decision 11): someone who signed through the
-- public link as family, whose relation passes the gate on the person's
-- home tree, and who isn't on any tree the person is on. The ask goes to
-- that tree's Roots, saying whose card and what relation; it never lets
-- them in. Asking again while one waits answers `created` false.
create or replace function public.ask_to_join_from_card(
  p_token text,
  p_viewer uuid,
  p_secret text,
  p_first_name text,
  p_last_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link private.card_links;
  v_card public.birthday_cards;
  v_key text;
  v_mine public.card_signatures;
  v_tree public.trees;
  v_created boolean := true;
begin
  select * into v_link from private.card_link_by_token(p_token);
  if not found or v_link.revoked_at is not null or v_link.kind <> 'public' then
    raise exception 'CARD: this link no longer works' using errcode = '22023';
  end if;
  select * into v_card from public.birthday_cards where id = v_link.card_id;
  v_key := private.card_signer_key(v_card.id, p_viewer, p_secret);
  select * into v_mine from public.card_signatures s
  where s.card_id = v_card.id
    and v_key is not null
    and (('u:' || s.signer_user_id::text) = v_key or s.edit_token_hash = v_key);
  if v_mine.id is null then
    raise exception 'CARD: sign first' using errcode = '42501';
  end if;
  if p_viewer is not null and exists (
    select 1 from public.tree_members m
    where m.user_id = p_viewer and private.is_placed(m.tree_id, v_card.person_id)
  ) then
    raise exception 'CARD: already on the tree' using errcode = '22023';
  end if;
  if not private.card_join_eligible(v_card.person_id, v_mine.relation) then
    raise exception 'CARD: not one to join' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_first_name, '')), '') is null
     or nullif(btrim(coalesce(p_last_name, '')), '') is null
     or nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception 'CARD: a name and an email' using errcode = '22023';
  end if;

  select t.* into v_tree from public.trees t
  join public.people p on p.tree_id = t.id
  where p.id = v_card.person_id;

  begin
    insert into public.invite_requests (tree_id, first_name, last_name, email, source, relation, card_person_id)
    values (
      v_tree.id, left(btrim(p_first_name), 80), left(btrim(p_last_name), 80),
      lower(btrim(p_email)), 'card', v_mine.relation, v_card.person_id
    );
  exception when unique_violation then
    v_created := false;
  end;
  if v_created then
    insert into private.card_events (card_id, link_id, kind) values (v_card.id, v_link.id, 'asked');
  end if;
  return jsonb_build_object('treeId', v_tree.id, 'treeName', v_tree.name, 'created', v_created);
end;
$$;

-- Places handed out a day ago that no signature took: forgotten here, and
-- handed back for the cron to remove the files.
create or replace function public.take_stale_card_uploads()
returns setof text
language sql
security definer
set search_path = ''
as $$
  with gone as (
    delete from private.card_uploads u
    where u.path in (
      select x.path from private.card_uploads x
      where x.created_at < now() - interval '1 day'
      order by x.created_at
      limit 500
    )
    returning u.path
  )
  select g.path from gone g
  where not exists (
    select 1 from public.card_signatures s
    where s.audio_path = g.path or s.photo_path = g.path
  );
$$;

-- ---------------------------------------------------------------------------
-- 7. `card_json` and `sign_birthday_card` again
-- ---------------------------------------------------------------------------

-- As in 20261030090000_birthday_cards, with each signature's relation, how
-- it was signed and a personal link's relative as its entry, and, for a
-- manager, whether the public link is on and whether they may turn it on.
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
    'link', case when v_manager then jsonb_build_object(
      'on', exists (
        select 1 from private.card_links l
        where l.card_id = v_card.id and l.kind = 'public' and l.revoked_at is null
      ),
      'mayTurnOn', private.may_share_card_of(v_card.person_id)
    ) end,
    'signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.signer_name,
        'personId', coalesce(pr.self_person_id, s.signer_person_id),
        'relation', s.relation,
        'cameBy', s.came_by,
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

-- As in 20261030090000_birthday_cards, with a new signature counted for the
-- analytics tab.
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
    -- Counted for the analytics tab (Step 217.3); a count never stops it.
    begin
      insert into private.card_events (card_id, kind, detail) values (p_card, 'signed', 'app');
    exception when others then
      raise warning 'card_events: signature not noted — %', sqlerrm;
    end;
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

-- ---------------------------------------------------------------------------
-- 8. Claims, and the analytics tab
-- ---------------------------------------------------------------------------

-- A personal link's relative claimed their entry: `redeem_invite_tree` notes
-- the join, which this hears. A count never stops the join.
create or replace function private.card_claim_noted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'joined' then
    begin
      insert into private.card_events (card_id, link_id, kind)
      select distinct on (l.card_id) l.card_id, l.id, 'claimed'
      from private.card_links l
      where l.invite_id = new.invite_id and l.kind = 'personal'
      order by l.card_id, l.created_at desc;
    exception when others then
      raise warning 'card_events: claim not noted — %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

create trigger card_events_claimed
  after insert on private.invite_events
  for each row execute function private.card_claim_noted();

-- The analytics tab's cards (beta reviewers only, like `invite_funnel`): each
-- card made or with anything in the last 30 days, its links made, shared
-- (by which button), opened, signatures by how, join buttons shown, asks,
-- claims.
create or replace function public.card_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', private.utc_day(now()),
    'counted_from', (select private.utc_day(min(e.at)) from private.card_events e),
    'cards', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.opens_on desc, t.id)
      from (
        select
          c.id,
          c.opens_on,
          private.card_first_name(c.person_id) as first_name,
          tr.name as tree_name,
          case
            when exists (
              select 1 from public.tree_members m
              join auth.users u on u.id = m.user_id
              join private.beta_reviewers r on lower(r.email) = lower(u.email)
              where m.tree_id = tr.id and m.role = 'admin') then 'ours'
            when exists (
              select 1 from auth.users u
              where u.id = tr.created_by
                and (u.email ilike '%@resend.dev' or u.email ilike '%@example.com')) then 'test'
            else 'outside'
          end as owner,
          (select count(*) from public.card_signatures s where s.card_id = c.id) as signatures,
          count(*) filter (where e.kind = 'made' and e.detail = 'public') as links,
          count(*) filter (where e.kind = 'made' and e.detail = 'personal') as personal_links,
          count(*) filter (where e.kind = 'shared') as shared,
          count(*) filter (where e.kind = 'opened') as opened,
          count(*) filter (where e.kind = 'signed') as signed,
          count(*) filter (where e.kind = 'join_shown') as join_shown,
          count(*) filter (where e.kind = 'asked') as asked,
          count(*) filter (where e.kind = 'claimed') as claimed,
          (select coalesce(jsonb_object_agg(x.detail, x.n), '{}'::jsonb)
           from (
             select e2.detail, count(*) as n from private.card_events e2
             where e2.card_id = c.id and e2.at >= v_since and e2.kind = 'shared'
             group by e2.detail) x) as shares_by,
          (select coalesce(jsonb_object_agg(x.detail, x.n), '{}'::jsonb)
           from (
             select e2.detail, count(*) as n from private.card_events e2
             where e2.card_id = c.id and e2.at >= v_since and e2.kind = 'signed'
             group by e2.detail) x) as signed_by
        from public.birthday_cards c
        join public.people p on p.id = c.person_id
        join public.trees tr on tr.id = p.tree_id
        left join private.card_events e on e.card_id = c.id and e.at >= v_since
        where c.created_at >= v_since
           or exists (select 1 from private.card_events x where x.card_id = c.id and x.at >= v_since)
        group by c.id, c.opens_on, c.person_id, tr.id, tr.name, tr.created_by
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.card_link_by_token(text) from public, anon, authenticated;
revoke all on function private.card_signer_key(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.card_visitor(text) from public, anon, authenticated;
revoke all on function private.card_family_relation(text) from public, anon, authenticated;
revoke all on function private.card_join_eligible(uuid, text) from public, anon, authenticated;
revoke all on function private.card_for_a_minor(uuid) from public, anon, authenticated;
revoke all on function private.may_share_card_of(uuid) from public, anon, authenticated;
revoke all on function private.card_relative_people(uuid) from public, anon, authenticated;
revoke all on function private.card_link_signatures_json(uuid, text) from public, anon, authenticated;
revoke all on function private.card_claim_noted() from public, anon, authenticated;

revoke all on function public.make_card_link(uuid) from public, anon;
revoke all on function public.revoke_card_link(uuid) from public, anon;
revoke all on function public.card_personal_candidates(uuid) from public, anon;
revoke all on function public.make_card_personal_link(uuid, uuid, text) from public, anon;
revoke all on function public.note_card_shared(text, text) from public, anon;
revoke all on function public.card_funnel() from public, anon;
grant execute on function public.make_card_link(uuid) to authenticated;
grant execute on function public.revoke_card_link(uuid) to authenticated;
grant execute on function public.card_personal_candidates(uuid) to authenticated;
grant execute on function public.make_card_personal_link(uuid, uuid, text) to authenticated;
grant execute on function public.note_card_shared(text, text) to authenticated;
grant execute on function public.card_funnel() to authenticated;

revoke all on function public.card_link_view(text, uuid, text) from public, anon, authenticated;
revoke all on function public.card_link_upload(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.delete_card_signature_by_link(text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.note_card_link_seen(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.ask_to_join_from_card(text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.take_stale_card_uploads() from public, anon, authenticated;
grant execute on function public.card_link_view(text, uuid, text) to service_role;
grant execute on function public.card_link_upload(text, uuid, text, text, text) to service_role;
grant execute on function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.delete_card_signature_by_link(text, uuid, text, uuid) to service_role;
grant execute on function public.note_card_link_seen(text, uuid, text, text) to service_role;
grant execute on function public.ask_to_join_from_card(text, uuid, text, text, text, text) to service_role;
grant execute on function public.take_stale_card_uploads() to service_role;
