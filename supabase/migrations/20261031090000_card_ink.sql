-- Step 217.4 — Birthday cards: ink, and the phone app.
--
-- On a touch screen a signer can draw in a square and sign their name by
-- hand in a strip under the message, in a phone's browser or the app. Ink
-- is kept as strokes, not pictures (`lib/card-ink.ts`): each point where it
-- was in its box (0–1 across and down), how hard it pressed (0–1) and when
-- (ms since the box's first touch), as jsonb on the signature, about 200 KB
-- at most. The card writes it out again as it opens. No file in storage.
--
-- The phone signs and opens cards through the calls the web's sheet uses
-- (RPCs, as the member), and is told of them by push: a card started for
-- someone its member is reminded to sign, and their own card on the day.
--
-- 1. `private.card_ink_ok`, and `card_signatures.ink`: a signature may be
--    ink alone.
-- 2. `sign_birthday_card` and `sign_card_by_link` take the ink.
-- 3. `card_json`, `card_link_signatures_json` and `card_link_view` hand it
--    back.
-- 4. Pushes: a `cards` switch, `card_pushes`, `claim_card_started_push`
--    (as the starter) and `card_ready_pushes` (the service role's).
--
-- Re-created from `20261030120000_birthday_card_links.sql` (217.3), not
-- 217.2's: `sign_birthday_card`, `sign_card_by_link`, `card_json`,
-- `card_link_signatures_json`, `card_link_view`; from
-- `20261023120000_push_notifications.sql`: `push_reachable`,
-- `set_push_settings`.

-- ---------------------------------------------------------------------------
-- 1. Ink on a signature
-- ---------------------------------------------------------------------------

-- Whether `p_ink` is a signature's ink, as `asCardInk` in `lib/card-ink.ts`
-- reads it: an object with a `draw` or a `sign` box, or both; each 1–400
-- strokes of 1–1,500 points; a point [x, y, pressure, ms], the first three
-- 0–1, ms 0–600,000; 200,000 characters at most. Null is no ink.
create or replace function private.card_ink_ok(p_ink jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_box text;
  v_strokes jsonb;
  v_stroke jsonb;
  v_point jsonb;
  v_i integer;
begin
  if p_ink is null then
    return true;
  end if;
  if jsonb_typeof(p_ink) <> 'object' then
    return false;
  end if;
  if p_ink = '{}'::jsonb or length(p_ink::text) > 200000 then
    return false;
  end if;
  for v_box, v_strokes in select e.key, e.value from jsonb_each(p_ink) e loop
    if v_box not in ('draw', 'sign') then
      return false;
    end if;
    if jsonb_typeof(v_strokes) <> 'array' then
      return false;
    end if;
    if jsonb_array_length(v_strokes) not between 1 and 400 then
      return false;
    end if;
    for v_stroke in select s.value from jsonb_array_elements(v_strokes) s loop
      if jsonb_typeof(v_stroke) <> 'array' then
        return false;
      end if;
      if jsonb_array_length(v_stroke) not between 1 and 1500 then
        return false;
      end if;
      for v_point in select q.value from jsonb_array_elements(v_stroke) q loop
        if jsonb_typeof(v_point) <> 'array' then
          return false;
        end if;
        if jsonb_array_length(v_point) <> 4 then
          return false;
        end if;
        for v_i in 0..3 loop
          if jsonb_typeof(v_point -> v_i) <> 'number' then
            return false;
          end if;
        end loop;
        if (v_point ->> 0)::numeric not between 0 and 1
          or (v_point ->> 1)::numeric not between 0 and 1
          or (v_point ->> 2)::numeric not between 0 and 1
          or (v_point ->> 3)::numeric not between 0 and 600000 then
          return false;
        end if;
      end loop;
    end loop;
  end loop;
  return true;
end;
$$;

alter table public.card_signatures
  add column ink jsonb constraint card_signatures_ink_check check (private.card_ink_ok(ink));

-- Ink alone signs a card: a drawing, or a name signed by hand.
alter table public.card_signatures drop constraint card_signatures_check;
alter table public.card_signatures add constraint card_signatures_check
  check (message is not null or audio_path is not null or photo_path is not null or ink is not null);

-- ---------------------------------------------------------------------------
-- 2. Signing with ink
-- ---------------------------------------------------------------------------
drop function public.sign_birthday_card(uuid, text, text, integer, text);
drop function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text);

-- As in 20261030120000_birthday_card_links, with the signer's ink.
create or replace function public.sign_birthday_card(
  p_card uuid,
  p_message text default null,
  p_audio_path text default null,
  p_audio_seconds integer default null,
  p_photo_path text default null,
  p_ink jsonb default null
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
  v_ink jsonb := case when jsonb_typeof(p_ink) <> 'null' then p_ink end;
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
    (card_id, signer_user_id, signer_name, message, audio_path, audio_seconds, photo_path, ink)
  values (
    p_card, v_uid, left(v_name, 80), v_message, v_audio,
    case when v_audio is not null then p_audio_seconds end, v_photo, v_ink
  )
  on conflict (card_id, signer_user_id) do update
  set signer_name = excluded.signer_name,
      message = excluded.message,
      audio_path = excluded.audio_path,
      audio_seconds = excluded.audio_seconds,
      photo_path = excluded.photo_path,
      ink = excluded.ink,
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

-- As in 20261030120000_birthday_card_links, with the signer's ink.
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
  p_ink jsonb default null
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
      photo_path, ink, came_by, edit_token_hash, signer_person_id
    ) values (
      v_card.id, p_viewer, left(v_name, 80), v_relation, v_message, v_audio,
      case when v_audio is not null then p_audio_seconds end, v_photo, v_ink, v_came,
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
        ink = v_ink,
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
-- 3. Reading it back
-- ---------------------------------------------------------------------------

-- As in 20261030120000_birthday_card_links, with each signature's ink.
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
        'ink', s.ink,
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

-- As in 20261030120000_birthday_card_links, with each signature's ink.
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
  where s.card_id = p_card;
$$;

-- As in 20261030120000_birthday_card_links, with the viewer's own ink.
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
      'ink', v_mine.ink,
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

-- ---------------------------------------------------------------------------
-- 4. Pushes to the phone
-- ---------------------------------------------------------------------------

-- A third switch, on unless they turn it off: birthday cards.
alter table public.push_settings add column cards boolean not null default true;

comment on table public.push_settings is
  'Step 204: whether a member''s phones are told of new messages, new stories and (Step 217.4) birthday cards. Read by the member; set through set_push_settings.';

-- Whom each card's pushes went to, so nobody is told twice: `started` (a
-- card started for someone they're reminded to sign), `ready` (their own,
-- on the day).
create table public.card_pushes (
  card_id uuid not null references public.birthday_cards (id) on delete cascade,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  kind text not null check (kind in ('started', 'ready')),
  pushed_at timestamptz not null default now(),
  primary key (card_id, user_id, kind)
);

create index card_pushes_user_idx on public.card_pushes (user_id);

comment on table public.card_pushes is
  'Step 217.4: each birthday card''s pushes, a member and a kind once. The service role''s only.';

alter table public.card_pushes enable row level security;
revoke all on table public.card_pushes from anon, authenticated;

-- As in 20261023120000_push_notifications, with the cards switch.
create or replace function private.push_reachable(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.push_tokens t where t.user_id = p_user)
    and not exists (
      select 1 from public.push_settings s
      where s.user_id = p_user
        and not (case p_kind when 'messages' then s.messages when 'cards' then s.cards else s.stories end)
    )
    and not exists (
      select 1 from auth.users u
      where u.id = p_user and u.banned_until > now()
    );
$$;

-- As in 20261023120000_push_notifications, with the cards switch. A phone
-- built before it says nothing of cards, and leaves that switch as it was.
drop function public.set_push_settings(boolean, boolean);
create function public.set_push_settings(p_messages boolean, p_stories boolean, p_cards boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  insert into public.push_settings (user_id, messages, stories, cards)
  values (v_me, coalesce(p_messages, true), coalesce(p_stories, true), coalesce(p_cards, true))
  on conflict (user_id) do update
    set messages = excluded.messages,
        stories = excluded.stories,
        cards = coalesce(p_cards, push_settings.cards),
        updated_at = now();
end;
$$;

-- Whom a card just started should reach on their phones, asked by whoever
-- started it, within ten minutes: those told in the app
-- (`start_birthday_card`'s `card_started` notices, the members whose My
-- Family Tree shows the person), with the notice's words. Each once.
create or replace function public.claim_card_started_push(p_card uuid)
returns table (user_id uuid, person_id uuid, first_name text, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_card public.birthday_cards;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  select * into v_card from public.birthday_cards c
  where c.id = p_card
    and c.started_by = v_me
    and c.created_at > now() - interval '10 minutes';
  if not found then
    return;
  end if;

  return query
  with told as (
    select distinct on (n.recipient_user_id) n.recipient_user_id as u, n.body
    from public.notifications n
    where n.type = 'card_started'
      and n.person_id = v_card.person_id
      and n.actor_user_id = v_me
      and n.created_at >= v_card.created_at
      and n.recipient_user_id <> v_me
      and private.person_owner_member(v_card.person_id) is distinct from n.recipient_user_id
      and private.push_reachable(n.recipient_user_id, 'cards')
    order by n.recipient_user_id, n.created_at
  ),
  pushed as (
    insert into public.card_pushes (card_id, user_id, kind)
    select p_card, t.u, 'started' from told t
    on conflict do nothing
    returning card_pushes.user_id
  )
  select t.u, v_card.person_id, private.card_first_name(v_card.person_id), t.body
  from told t
  join pushed p on p.user_id = t.u;
end;
$$;

-- The phones to tell of their own card on the day, for the cards the run
-- just announced (`announce_birthday_cards`): the person, once a card, while
-- it's open and their switch is on. The service role's.
create or replace function public.card_ready_pushes(p_cards uuid[])
returns table (user_id uuid, person_id uuid, card_id uuid, first_name text, signatures integer)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select c.id, c.person_id, private.person_owner_member(c.person_id) as u,
      (select count(*)::integer from public.card_signatures s where s.card_id = c.id) as n
    from public.birthday_cards c
    where c.id = any (p_cards)
      and c.announced_at is not null
      and now() >= c.opens_at
      and now() < c.opens_at + interval '7 days'
  ),
  pushed as (
    insert into public.card_pushes (card_id, user_id, kind)
    select d.id, d.u, 'ready' from due d
    where d.u is not null and d.n > 0 and private.push_reachable(d.u, 'cards')
    on conflict do nothing
    returning card_pushes.card_id, card_pushes.user_id
  )
  select d.u, d.person_id, d.id, private.card_first_name(d.person_id), d.n
  from due d
  join pushed p on p.card_id = d.id and p.user_id = d.u;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.card_ink_ok(jsonb) from public, anon, authenticated;
revoke all on function public.sign_birthday_card(uuid, text, text, integer, text, jsonb) from public, anon;
grant execute on function public.sign_birthday_card(uuid, text, text, integer, text, jsonb) to authenticated;
revoke all on function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.sign_card_by_link(text, uuid, text, text, text, text, text, integer, text, jsonb) to service_role;

revoke all on function public.set_push_settings(boolean, boolean, boolean) from public, anon;
grant execute on function public.set_push_settings(boolean, boolean, boolean) to authenticated;
revoke all on function public.claim_card_started_push(uuid) from public, anon;
grant execute on function public.claim_card_started_push(uuid) to authenticated;
revoke all on function public.card_ready_pushes(uuid[]) from public, anon, authenticated;
grant execute on function public.card_ready_pushes(uuid[]) to service_role;
