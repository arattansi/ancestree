-- Step 229: a birthday card's link stays copyable. Aalim (2026-11-10):
-- "keep the share link copiable so that it can be easily referenced to
-- share again. right now, i have to generate a new link and kill the old
-- one every time i lose track."
--
-- Since Step 217.3 only a link token's sha256 is kept, so its address showed
-- once, when it was made. Now the server makes the token: an HMAC of the
-- link's id under a key only it holds (`lib/card-link-key.server.ts`), and
-- hands the database the id and the hash. Still nothing but the hash is
-- stored, and a visitor's token is still checked by its hash alone
-- (`private.card_link_by_token`, unchanged); a manager's sheet asks for the
-- live link's id and hash, and the server works the address out again.
-- A link made before this, from random bytes, can't be; it's made again
-- once to show.
--
-- 1. `make_card_link` and `make_card_personal_link` take the link's id and
--    its token's hash (re-created from 20261030120000_birthday_card_links,
--    the live bodies asserted). Called without them, as the web before this
--    step does, they make a random token and hand it back as before.
-- 2. `card_public_link`: the live public link's id and hash, for a manager
--    who may share it, while signing's open.
-- 3. `card_personal_link`: a relative's newest live link bound to their live
--    claim invite, so "send them their link" shows the same one again.

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.make_card_link(uuid)'::regprocedure)
      <> 'c098b98e9b220d4b6efe65532c9e4095' then
    raise exception 'make_card_link changed since 20261030120000_birthday_card_links';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.make_card_personal_link(uuid, uuid, text)'::regprocedure)
      <> '854302ede7c02399cb606a0a2cfce083' then
    raise exception 'make_card_personal_link changed since 20261030120000_birthday_card_links';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Making links
-- ---------------------------------------------------------------------------
drop function public.make_card_link(uuid);
drop function public.make_card_personal_link(uuid, uuid, text);

-- Turn on a card's public link, or make it again: any link before stops
-- working. The server gives the new link's id and its token's hash (the
-- token is its own HMAC of the id) and gets nothing back; called without
-- them, a random token is made here and comes back once.
create or replace function public.make_card_link(
  p_card uuid,
  p_link uuid default null,
  p_token_hash text default null
)
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
  if (p_link is null) <> (p_token_hash is null)
     or (p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'CARD: not a link' using errcode = '22023';
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

  if p_link is null then
    v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  end if;
  insert into private.card_links (id, card_id, kind, token_hash, made_by)
  values (
    coalesce(p_link, gen_random_uuid()), p_card, 'public',
    coalesce(p_token_hash, encode(extensions.digest(v_token, 'sha256'), 'hex')),
    (select auth.uid())
  )
  returning id into v_link;
  insert into private.card_events (card_id, link_id, kind, detail)
  values (p_card, v_link, 'made', 'public');
  return v_token;
end;
$$;

-- A relative's own link to the card, which is also their claim link: the
-- invite (`makeClaimLink`, made first) must be a live bare claim on their
-- entry. The link's id and hash come from the server, as the public link's
-- do; without them a random token is made here and comes back once.
create or replace function public.make_card_personal_link(
  p_card uuid,
  p_person uuid,
  p_invite_token text,
  p_link uuid default null,
  p_token_hash text default null
)
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
  if (p_link is null) <> (p_token_hash is null)
     or (p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'CARD: not a link' using errcode = '22023';
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

  if p_link is null then
    v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  end if;
  insert into private.card_links (id, card_id, kind, token_hash, person_id, invite_id, made_by)
  values (
    coalesce(p_link, gen_random_uuid()), p_card, 'personal',
    coalesce(p_token_hash, encode(extensions.digest(v_token, 'sha256'), 'hex')),
    p_person, v_invite, (select auth.uid())
  )
  returning id into v_link;
  insert into private.card_events (card_id, link_id, kind, detail)
  values (p_card, v_link, 'made', 'personal');
  return v_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The public link, again
-- ---------------------------------------------------------------------------

-- The card's live public link, `{id, hash}`, for whoever may turn it on (a
-- manager, and a parent for someone under 18), while signing's open: the
-- server works its address out again from the id and checks it by the hash.
-- Null for anyone else, or with no link on.
create or replace function public.card_public_link(p_card uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', l.id, 'hash', l.token_hash)
  from public.birthday_cards c
  join private.card_links l
    on l.card_id = c.id and l.kind = 'public' and l.revoked_at is null
  where c.id = p_card
    and (select auth.uid()) is not null
    and now() < c.closes_at
    and private.may_share_card_of(c.person_id);
$$;

-- ---------------------------------------------------------------------------
-- 3. A relative's link, again
-- ---------------------------------------------------------------------------

-- A relative's newest live link to the card, `{id, hash}`, bound to the
-- claim invite `p_invite_token` names while that invite is live: for a
-- manager who could send them one now, while signing's open. Null when
-- there's none to show again, and a new one is made.
create or replace function public.card_personal_link(p_card uuid, p_person uuid, p_invite_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_card public.birthday_cards;
  v_found jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  select * into v_card from public.birthday_cards where id = p_card;
  if not found or now() >= v_card.closes_at or not private.manages_card_of(v_card.person_id) then
    return null;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(public.card_personal_candidates(p_card)) c
    where c ->> 'personId' = p_person::text
  ) then
    return null;
  end if;
  select jsonb_build_object('id', l.id, 'hash', l.token_hash) into v_found
  from private.card_links l
  join public.invites i on i.id = l.invite_id
  where l.card_id = p_card
    and l.kind = 'personal'
    and l.person_id = p_person
    and l.revoked_at is null
    and i.token = p_invite_token
    and i.person_id = p_person
    and i.status = 'active'
    and not i.founds_tree
    and i.invited_email is null
    and i.max_uses is null
    and i.archived_at is null
    and (i.expires_at is null or i.expires_at > now())
  order by l.created_at desc
  limit 1;
  return v_found;
end;
$$;

revoke all on function public.make_card_link(uuid, uuid, text) from public, anon;
revoke all on function public.make_card_personal_link(uuid, uuid, text, uuid, text) from public, anon;
revoke all on function public.card_public_link(uuid) from public, anon;
revoke all on function public.card_personal_link(uuid, uuid, text) from public, anon;
grant execute on function public.make_card_link(uuid, uuid, text) to authenticated;
grant execute on function public.make_card_personal_link(uuid, uuid, text, uuid, text) to authenticated;
grant execute on function public.card_public_link(uuid) to authenticated;
grant execute on function public.card_personal_link(uuid, uuid, text) to authenticated;
