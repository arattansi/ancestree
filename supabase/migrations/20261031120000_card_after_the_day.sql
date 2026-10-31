-- Step 217.5 — Birthday cards: after the day.
--
-- Once their card has opened, the person thanks everyone who signed it at
-- once, with one message of theirs, and hides a signature they'd rather the
-- others didn't see (theirs to hide and show again). Members who signed are
-- told in the app and on their phones; someone who signed through a link
-- signed out hears by email, if they left one when they signed (decision
-- 16: asked only there, kept only for the thank-you). Each once. Their
-- cards go in Export data. A death before the day closes the card: its
-- managers are told and keep the signatures, and nothing is sent.
--
-- 1. The columns: the person's thank-you on the card; on each signature,
--    when it was hidden, when it was thanked, and a link signer's email.
-- 2. The person's calls: `thank_card_signers`, `hide_card_signature`,
--    `my_birthday_cards`.
-- 3. Reading it back: `card_json`, `card_link_signatures_json` and
--    `card_link_view` say the thank-you, leave hidden signatures to the
--    person (and each to its signer), and say when a card closed;
--    `birthday_cards_for` counts what the viewer may see; `my_card_flags`
--    puts no envelope on someone who has died.
-- 4. Signing through a link takes the optional email: `sign_card_by_link`.
-- 5. The service role's: the thank-you's pushes and emails.
-- 6. A death before the day: the managers are told.
-- 7. Two notices, and a push kind.
--
-- Re-created from `20261031090000_card_ink.sql` (217.4): `card_json`,
-- `card_link_signatures_json`, `card_link_view`, `sign_card_by_link`; from
-- `20261030090000_birthday_cards.sql` (217.2): `birthday_cards_for`,
-- `my_card_flags`.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
alter table public.birthday_cards
  -- The person's one message to everyone who signed, and when they first
  -- sent it.
  add column thanks text check (thanks is null or length(btrim(thanks)) between 1 and 1000),
  add column thanked_at timestamptz;

alter table public.card_signatures
  -- Hidden by the person, after the day: from everyone but them and its
  -- signer.
  add column hidden_at timestamptz,
  -- The person's thank-you reached it.
  add column thanked_at timestamptz,
  -- A link signer's, signed out, for the thank-you only: gone once it's
  -- sent, or 30 days after the day if it never is.
  add column thanks_email text check (
    thanks_email is null
    or (length(thanks_email) <= 254 and thanks_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  );

-- ---------------------------------------------------------------------------
-- 2. The person's calls
-- ---------------------------------------------------------------------------

-- Thank everyone who signed one's own card, once it's open: one message,
-- the first time; anyone who signs after, or whose signature is shown
-- again, is thanked later with the same words. Hidden signatures aren't
-- thanked. Each signature once. Members who signed are told in the app;
-- their phones and a link signer's email follow from the server
-- (`card_thanks_pushes`, `card_thanks_emails`).
create or replace function public.thank_card_signers(p_card uuid, p_message text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_card public.birthday_cards;
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_body text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_card from public.birthday_cards where id = p_card for update;
  if not found
    or private.person_owner_member(v_card.person_id) is distinct from v_uid
    or now() < v_card.opens_at then
    raise exception 'CARD: not yours to thank for' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.card_signatures s
    where s.card_id = p_card and s.thanked_at is null and s.hidden_at is null
  ) then
    raise exception 'CARD: nobody to thank' using errcode = '22023';
  end if;

  if v_card.thanks is null then
    if v_message is null then
      raise exception 'CARD: a thank-you to send' using errcode = '22023';
    end if;
    if length(v_message) > 1000 then
      raise exception 'CARD: a shorter thank-you' using errcode = '22001';
    end if;
    update public.birthday_cards set thanks = v_message, thanked_at = now() where id = p_card;
  else
    v_message := v_card.thanks;
  end if;

  v_body := coalesce(private.member_label(v_uid), private.card_first_name(v_card.person_id))
    || ' thanked you for signing '
    || (select case p.sex when 'female' then 'her' when 'male' then 'his' else 'their' end
        from public.people p where p.id = v_card.person_id)
    || ' birthday card: “' || v_message || '”';

  with thanked as (
    update public.card_signatures s
    set thanked_at = now()
    where s.card_id = p_card and s.thanked_at is null and s.hidden_at is null
    returning coalesce(s.signer_user_id, private.person_owner_member(s.signer_person_id)) as u
  ),
  told as (
    insert into public.notifications (recipient_user_id, actor_user_id, type, person_id, tree_id, body)
    select d.u, v_uid, 'card_thanks', v_card.person_id, private.card_notice_tree(d.u, v_card.person_id), v_body
    from (select distinct t.u from thanked t where t.u is not null and t.u <> v_uid) d
    returning 1
  )
  select count(*)::integer into v_count from thanked;

  return jsonb_build_object('thanked', v_count);
end;
$$;

-- Hide a signature on one's own card once it's open, or show it again:
-- hidden, only the person and its signer see it.
create or replace function public.hide_card_signature(p_signature uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  update public.card_signatures s
  set hidden_at = case when p_hidden then coalesce(s.hidden_at, now()) end
  from public.birthday_cards c
  where s.id = p_signature
    and c.id = s.card_id
    and now() >= c.opens_at
    and private.person_owner_member(c.person_id) = v_uid;
  if not found then
    raise exception 'CARD: not yours to hide' using errcode = '42501';
  end if;
end;
$$;

-- Every card of one's own that has opened, as `card_json` gives it to
-- them, oldest first: for Export data.
create or replace function public.my_birthday_cards()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.card_json(c.id) order by c.opens_on), '[]'::jsonb)
  from public.birthday_cards c
  where (select auth.uid()) is not null
    and now() >= c.opens_at
    and private.person_owner_member(c.person_id) = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. Reading it back
-- ---------------------------------------------------------------------------

-- As in 20261031090000_card_ink, with the person's thank-you (to them, and
-- to each signer it reached), how many are still to thank, the hidden
-- signatures left to the person and each to its signer, and whether the
-- card closed (the person died).
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
  v_person public.people;
  v_recipient boolean;
  v_manager boolean;
  v_signed boolean;
  v_open boolean;
  v_signing boolean;
  v_may_sign boolean;
  v_thanked boolean;
begin
  if v_uid is null then
    return null;
  end if;
  select * into v_card from public.birthday_cards where id = p_card;
  if not found then
    return null;
  end if;
  select * into v_person from public.people where id = v_card.person_id;
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
    v_thanked := v_card.thanks is not null;
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
    v_thanked := exists (
      select 1 from public.card_signatures s
      where s.card_id = p_card and s.signer_user_id = v_uid and s.thanked_at is not null
    );
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
    'closed', v_person.is_deceased or v_person.date_of_death is not null,
    'startedBy', coalesce(private.member_label(v_card.started_by), 'A relative'),
    'openedAt', v_card.opened_at,
    'recipient', v_recipient,
    'manager', v_manager,
    'signed', v_signed,
    'thanks', case when v_thanked then v_card.thanks end,
    'thankedAt', case when v_recipient then v_card.thanked_at end,
    'unthanked', case when v_recipient then (
      select count(*)::integer from public.card_signatures s
      where s.card_id = v_card.id and s.thanked_at is null and s.hidden_at is null
    ) else 0 end,
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
        'ink', s.ink,
        'mine', s.signer_user_id = v_uid,
        'hidden', v_recipient and s.hidden_at is not null,
        'createdAt', s.created_at,
        'updatedAt', s.updated_at
      ) order by s.created_at)
      from public.card_signatures s
      left join public.profiles pr on pr.auth_user_id = s.signer_user_id
      where s.card_id = v_card.id
        and (v_recipient or s.hidden_at is null or s.signer_user_id = v_uid)
    ), '[]'::jsonb)
  );
end;
$$;

-- As in 20261031090000_card_ink, leaving out what the person hid, but for
-- the viewer's own.
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
    'ink', s.ink,
    'mine', coalesce(
      ('u:' || s.signer_user_id::text) = p_key or s.edit_token_hash = p_key,
      false
    ),
    'createdAt', s.created_at,
    'updatedAt', s.updated_at
  ) order by s.created_at), '[]'::jsonb)
  from public.card_signatures s
  where s.card_id = p_card
    and (
      s.hidden_at is null
      or coalesce(('u:' || s.signer_user_id::text) = p_key or s.edit_token_hash = p_key, false)
    );
$$;

-- As in 20261031090000_card_ink, with the viewer's own email for the
-- thank-you, the person's thank-you once it reached them, and whether the
-- card closed.
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
    'closed', v_person.is_deceased or v_person.date_of_death is not null,
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
      'ink', v_mine.ink,
      'email', v_mine.thanks_email,
      'updatedAt', v_mine.updated_at
    ) end,
    'thanks', case when v_mine.thanked_at is not null then v_card.thanks end,
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

-- As in 20261030090000_birthday_cards, an earlier card's count being the
-- signatures the viewer may see.
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
    select c.id, c.year, c.opens_on, jsonb_array_length(j.card -> 'signatures') as n
    from public.birthday_cards c
    cross join lateral (select private.card_json(c.id) as card) j
    where c.person_id = p_person
      and now() >= c.opens_at
      and c.id is distinct from (v_current ->> 'id')::uuid
      and j.card is not null
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

-- As in 20261030090000_birthday_cards, with no envelope on someone who has
-- died: their card closed.
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
  join public.people p on p.id = c.person_id
  where (select auth.uid()) is not null
    and not p.is_deceased and p.date_of_death is null
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

-- ---------------------------------------------------------------------------
-- 4. Signing through a link, with an email for the thank-you
-- ---------------------------------------------------------------------------
drop function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text, jsonb);

-- As in 20261031090000_card_ink, with a signed-out signer's email for the
-- person's thank-you (decision 16), optional, asked only here. A signature
-- already thanked keeps none: the thank-you has been and gone.
create or replace function public.sign_card_by_link(
  p_token text,
  p_viewer uuid,
  p_secret text,
  p_name text,
  p_relation text,
  p_message text,
  p_audio_path text,
  p_audio_seconds integer,
  p_photo_path text,
  p_ink jsonb default null,
  p_email text default null
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
  v_ink jsonb := case when jsonb_typeof(p_ink) <> 'null' then p_ink end;
  v_email text := case when p_viewer is null then nullif(lower(btrim(coalesce(p_email, ''))), '') end;
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
  if v_message is null and v_audio is null and v_photo is null and v_ink is null then
    raise exception 'CARD: nothing to sign with' using errcode = '22023';
  end if;
  if length(v_message) > 2000 then
    raise exception 'CARD: longer than a message may be' using errcode = '22001';
  end if;
  if p_audio_seconds is not null and p_audio_seconds not between 0 and 125 then
    raise exception 'CARD: longer than a voice memo may be' using errcode = '22023';
  end if;
  if not private.card_ink_ok(v_ink) then
    raise exception 'CARD: not ink the card takes' using errcode = '22023';
  end if;
  if v_relation is not null and v_relation <> 'friend' and not private.card_family_relation(v_relation) then
    raise exception 'CARD: not a relation' using errcode = '22023';
  end if;
  if v_email is not null and (
    length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'CARD: not an email' using errcode = '22023';
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
      photo_path, ink, came_by, edit_token_hash, signer_person_id, thanks_email
    ) values (
      v_card.id, p_viewer, left(v_name, 80), v_relation, v_message, v_audio,
      case when v_audio is not null then p_audio_seconds end, v_photo, v_ink, v_came,
      case when p_viewer is null then v_key end,
      case when v_link.kind = 'personal' and p_viewer is null then v_link.person_id end,
      v_email
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
        ink = v_ink,
        thanks_email = case when v_old.thanked_at is null then v_email end,
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

-- ---------------------------------------------------------------------------
-- 5. The service role's: the thank-you's pushes and emails
-- ---------------------------------------------------------------------------

-- The phones to tell of a thank-you: members whose signatures it reached in
-- the last two days (`p_card`'s, or every card's), while their cards switch
-- is on, once a card. Called after a thank-you from the web, and by the
-- cron for one sent from the phone.
create or replace function public.card_thanks_pushes(p_card uuid default null)
returns table (user_id uuid, person_id uuid, first_name text, thanks text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select distinct c.id as card_id, c.person_id, x.u
    from public.card_signatures s
    join public.birthday_cards c on c.id = s.card_id
    cross join lateral (
      select coalesce(s.signer_user_id, private.person_owner_member(s.signer_person_id)) as u
    ) x
    where s.thanked_at > now() - interval '2 days'
      and (p_card is null or s.card_id = p_card)
      and x.u is not null
      and x.u is distinct from private.person_owner_member(c.person_id)
      and private.push_reachable(x.u, 'cards')
  ),
  pushed as (
    insert into public.card_pushes (card_id, user_id, kind)
    select d.card_id, d.u, 'thanks' from due d
    on conflict do nothing
    returning card_pushes.card_id, card_pushes.user_id
  )
  select d.u, d.person_id, private.card_first_name(d.person_id), c.thanks
  from due d
  join pushed p on p.card_id = d.card_id and p.user_id = d.u
  join public.birthday_cards c on c.id = d.card_id;
$$;

-- The emails a thank-you owes (`p_card`'s, or every card's): each link
-- signer who left an address and whose signature it reached, handed back
-- once and the address forgotten as it is. An address never used is
-- forgotten 30 days after the day.
create or replace function public.card_thanks_emails(p_card uuid default null)
returns table (to_email text, signer text, first_name text, message text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.card_signatures s
  set thanks_email = null
  from public.birthday_cards c
  where c.id = s.card_id
    and s.thanks_email is not null
    and s.thanked_at is null
    and c.opens_at < now() - interval '30 days';

  return query
  with picked as (
    select s.id, s.card_id, s.thanks_email, s.signer_name
    from public.card_signatures s
    where s.thanks_email is not null
      and s.thanked_at is not null
      and (p_card is null or s.card_id = p_card)
    for update skip locked
  ),
  cleared as (
    update public.card_signatures s
    set thanks_email = null
    from picked p
    where s.id = p.id
    returning s.id
  )
  select p.thanks_email, p.signer_name, private.card_first_name(c.person_id), c.thanks
  from picked p
  join cleared x on x.id = p.id
  join public.birthday_cards c on c.id = p.card_id
  where c.thanks is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. A death before the day closes the card
-- ---------------------------------------------------------------------------

-- Someone marked as having died with a card still sealed: signing has
-- closed already (`can_sign_card`, `sign_card_by_link`) and nobody will be
-- told on the day (`announce_birthday_cards`); here its managers hear of it,
-- once, but whoever marked it. They keep the signatures. Never stops the
-- edit.
create or replace function private.card_closed_on_death()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.notifications (recipient_user_id, actor_user_id, type, person_id, tree_id, body)
    select m.u, (select auth.uid()), 'card_closed', new.id, private.card_notice_tree(m.u, new.id),
      private.card_first_name(new.id) || '''s birthday card is closed: it won''t open on the day. '
        || 'Its signatures are kept.'
    from public.birthday_cards c
    cross join lateral (select distinct u from private.card_managers(new.id) as u) m
    where c.person_id = new.id
      and now() < c.opens_at
      and m.u is distinct from (select auth.uid())
      and private.card_notice_tree(m.u, new.id) is not null;
  exception when others then
    raise warning 'card_closed: managers not told — %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger people_card_closed
  after update of is_deceased, date_of_death on public.people
  for each row
  when (
    (new.is_deceased or new.date_of_death is not null)
    and not (old.is_deceased or old.date_of_death is not null)
  )
  execute function private.card_closed_on_death();

-- ---------------------------------------------------------------------------
-- 7. Two notices, and a push kind
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
    'card_start_due', 'card_started', 'card_signed', 'card_ready',
    'card_thanks', 'card_closed'
  ));

alter table public.card_pushes drop constraint card_pushes_kind_check;
alter table public.card_pushes add constraint card_pushes_kind_check
  check (kind in ('started', 'ready', 'thanks'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.thank_card_signers(uuid, text) from public, anon;
revoke all on function public.hide_card_signature(uuid, boolean) from public, anon;
revoke all on function public.my_birthday_cards() from public, anon;
grant execute on function public.thank_card_signers(uuid, text) to authenticated;
grant execute on function public.hide_card_signature(uuid, boolean) to authenticated;
grant execute on function public.my_birthday_cards() to authenticated;

revoke all on function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text, jsonb, text) to service_role;
revoke all on function public.card_thanks_pushes(uuid) from public, anon, authenticated;
revoke all on function public.card_thanks_emails(uuid) from public, anon, authenticated;
grant execute on function public.card_thanks_pushes(uuid) to service_role;
grant execute on function public.card_thanks_emails(uuid) to service_role;
revoke all on function private.card_closed_on_death() from public, anon, authenticated;
