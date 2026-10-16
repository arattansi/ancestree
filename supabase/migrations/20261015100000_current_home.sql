-- Step 153 — Where someone lives now.
--
-- Aalim asked for "another location field that is optional for 'current
-- location'. i.e., what is 'home' for the person, today". A place like the
-- place of death: a GeoNames place and the label it was picked with,
--
--     people.place_id_residence   the place they live now
--     people.place_of_residence   its label, "Toronto, Ontario, Canada"
--
-- Optional, and only for the living: `people_before_write` empties it once
-- someone is marked as having died, so a writer that doesn't know about it
-- (a suggestion marking them deceased, an undo) still leaves none behind.
--
-- It's where a living relative can be found, so it goes no further than
-- their family: `tree_people` hands it to members of the tree being read
-- and to the entry's owner, and to nobody else — not a visitor from another
-- tree, not a share link (read with the service role, a member of nothing),
-- not a basic card (Step 80). Trailing columns, so the view is replaced in
-- place.
--
-- Everything that lists a person's details learns it, as Step 81's circa
-- did: a placeholder child holds it back like any other detail
-- (`people_before_write`, `entry_details`, `merge_invited_entry`) and their
-- parent shows it as 'home' (`reveal_withheld_details`); it can be filled
-- in where it's blank (`fill_person_blanks`), suggested and accepted
-- (`suggestion_columns`, `suggest_entry_change`, `decide_entry_suggestion`),
-- undone by a Root (`revision_fields`), and an edit of it is told as
-- "current home" (`person_edit_notify`). `add_people_with_connections`
-- needs no change: the app sets it on the new rows afterwards, as it does
-- their places' ids.
--
-- Each function is its latest migration's body, which matched live by md5,
-- with only the lines named here changed. Additive: the app before it
-- neither reads nor sends the columns, so this goes live before the code.
--
-- Down: re-run the functions from their migrations (20261001200000,
-- 20261001170000, 20260929010000, 20260929090000, 20261001140000), drop
-- tree_people and create it again from 20261001140000 (a view can't lose
-- columns in place), then drop the two columns.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.people
  add column place_id_residence bigint references public.places(id),
  add column place_of_residence text,
  add constraint people_place_of_residence_length
    check (char_length(place_of_residence) <= 160);

comment on column public.people.place_id_residence is
  'Step 153: the GeoNames place someone lives now; living people only (people_before_write empties it when they die). tree_people shows it to members only.';
comment on column public.people.place_of_residence is
  'Step 153: the label place_id_residence was picked with.';

create index people_place_id_residence_idx on public.people (place_id_residence);

-- ---------------------------------------------------------------------------
-- The view: members see where someone lives, visitors and share links don't
-- ---------------------------------------------------------------------------

create or replace view public.tree_people
  with (security_invoker = true)
as
SELECT pl.tree_id,
    pl.id AS placement_id,
    pl.status AS placement_status,
    pl.pos_x,
    pl.pos_y,
    pl.pos_dx,
    pl.pos_dy,
    (pe.tree_id = pl.tree_id) AS is_home,
    pl.person_id AS id,
    pe.tree_id AS home_tree_id,
    pe.first_name,
    pe.middle_name,
    pe.preferred_name,
    pe.maiden_name,
    pe.last_name,
    pe.date_of_birth,
    pe.date_of_death,
    pe.date_of_birth_precision,
    pe.date_of_death_precision,
    pe.city_of_birth,
    pe.country_of_birth,
    pe.place_id_birth,
    pe.place_id_death,
    pe.is_deceased,
    pe.place_of_death,
    pe.sex,
    pe.lineage_type,
    pe.photo_path,
    pe.photo_crop,
    pe.owner_user_id,
    pe.created_by,
    pe.hidden_from_visitors,
    pe.created_at,
    pe.updated_at,
    (pe.id IS NULL) AS blurred,
        CASE
            WHEN ((pe.id IS NOT NULL) AND (pe.email_visible OR (pe.owner_user_id = ( SELECT auth.uid() AS uid)))) THEN pe.email
            ELSE NULL::text
        END AS email,
    pe.email_visible,
    pe.birth_month,
    pe.birth_day,
    pe.date_of_birth_circa,
    pe.date_of_death_circa,
    pl.detail,
    pl.approval,
    NULL::text AS asked_of,
    false AS nudge_due,
    pe.placeholder_number,
        CASE
            WHEN ((pe.owner_user_id = ( SELECT auth.uid() AS uid)) OR private.is_tree_member(pl.tree_id)) THEN pe.place_id_residence
            ELSE NULL::bigint
        END AS place_id_residence,
        CASE
            WHEN ((pe.owner_user_id = ( SELECT auth.uid() AS uid)) OR private.is_tree_member(pl.tree_id)) THEN pe.place_of_residence
            ELSE NULL::text
        END AS place_of_residence
   FROM (tree_placements pl
     LEFT JOIN people pe ON ((pe.id = pl.person_id)))
  WHERE ((pl.status = 'active'::text) AND (pl.detail = 'full'::text))
UNION ALL
 SELECT b.tree_id,
    b.placement_id,
    b.placement_status,
    b.pos_x,
    b.pos_y,
    b.pos_dx,
    b.pos_dy,
    false AS is_home,
    b.id,
    b.home_tree_id,
    b.first_name,
    NULL::text AS middle_name,
    b.preferred_name,
    NULL::text AS maiden_name,
    b.last_name,
    NULL::date AS date_of_birth,
    NULL::date AS date_of_death,
    NULL::text AS date_of_birth_precision,
    NULL::text AS date_of_death_precision,
    b.city_of_birth,
    b.country_of_birth,
    b.place_id_birth,
    NULL::bigint AS place_id_death,
    NULL::boolean AS is_deceased,
    NULL::text AS place_of_death,
    NULL::text AS sex,
    NULL::text AS lineage_type,
    NULL::text AS photo_path,
    NULL::jsonb AS photo_crop,
    NULL::uuid AS owner_user_id,
    NULL::uuid AS created_by,
    (NOT b.shown) AS hidden_from_visitors,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    (NOT b.shown) AS blurred,
    NULL::text AS email,
    NULL::boolean AS email_visible,
    NULL::smallint AS birth_month,
    NULL::smallint AS birth_day,
    false AS date_of_birth_circa,
    false AS date_of_death_circa,
    b.detail,
    b.approval,
    b.asked_of,
    b.nudge_due,
    b.placeholder_number,
    NULL::bigint AS place_id_residence,
    NULL::text AS place_of_residence
   FROM private.basic_tree_people b;

-- ---------------------------------------------------------------------------
-- The trigger: held back from a placeholder like any detail, and gone once someone has died
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.people_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := new.created_by;
    end if;
    if (select auth.uid()) is not null and not private.is_root_of(new.tree_id) then
      new.lineage_type := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if (select auth.uid()) is not null
       and not private.is_root_of(new.tree_id)
       and new.lineage_type is distinct from old.lineage_type
       -- A child's own entry folded into their placeholder is emptied,
       -- lineage too (Step 98.3, `merge_invited_entry`).
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on' then
      raise exception 'lineage_type can only be changed by a Root' using errcode = '42501';
    end if;
    if new.tree_id is distinct from old.tree_id
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on'
       and (select auth.uid()) is not null then
      raise exception 'HOME_TREE: change a home tree through set_home_tree' using errcode = '42501';
    end if;
    -- Placeholder children (Step 98.2): the number is given only by
    -- `add_placeholder_child`, or by a merge that folds one into the
    -- child's own entry (Step 98.3, under the privileged flag), and never
    -- changed otherwise. Their parent's edit that
    -- gives one any detail clears it and makes the entry theirs, unless the
    -- child has claimed it (Step 98.3).
    if new.placeholder_number is distinct from old.placeholder_number
       and new.placeholder_number is not null
       and (select auth.uid()) is not null
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on' then
      raise exception 'PLACEHOLDER: a placeholder keeps its number'
        using errcode = '42501';
    end if;
    if old.placeholder_number is not null
       and new.placeholder_number is not null
       and (select auth.uid()) is not null
       and
       (new.first_name, new.middle_name, new.preferred_name, new.maiden_name,
        new.last_name, new.date_of_birth, new.birth_month, new.birth_day,
        new.city_of_birth, new.country_of_birth, new.place_id_birth,
        new.is_deceased, new.date_of_death, new.place_of_death,
        new.place_id_death, new.sex, new.lineage_type, new.photo_path,
        new.photo_crop, new.email, new.place_id_residence,
        new.place_of_residence)
       is distinct from
       (old.first_name, old.middle_name, old.preferred_name, old.maiden_name,
        old.last_name, old.date_of_birth, old.birth_month, old.birth_day,
        old.city_of_birth, old.country_of_birth, old.place_id_birth,
        old.is_deceased, old.date_of_death, old.place_of_death,
        old.place_id_death, old.sex, old.lineage_type, old.photo_path,
        old.photo_crop, old.email, old.place_id_residence,
        old.place_of_residence) then
      if not private.is_own_child(new.id) then
        raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
          using errcode = '42501';
      end if;
      new.placeholder_number := null;
      if private.person_owner_member(new.id) is null then
        new.owner_user_id := (select auth.uid());
      end if;
    end if;
    -- What was held back of it goes with the placeholder (Step 98.3).
    if old.placeholder_number is not null and new.placeholder_number is null then
      delete from private.withheld_details where person_id = new.id;
    end if;
    -- A living child's date of birth under 18 is their parent's to give
    -- (Step 98), or their own; anyone else's edit, fill, accepted
    -- suggestion or undo that sets one is refused.
    if (select auth.uid()) is not null
       and (new.date_of_birth, new.date_of_birth_precision, new.is_deceased, new.date_of_death)
           is distinct from
           (old.date_of_birth, old.date_of_birth_precision, old.is_deceased, old.date_of_death)
       and not new.is_deceased and new.date_of_death is null
       and private.birth_age(new.date_of_birth, new.date_of_birth_precision) = 'minor'
       and new.id is distinct from private.self_person_id()
       and not private.is_own_child(new.id) then
      raise exception 'MINOR: % is under 18; only their parent can give that date of birth',
        coalesce(nullif(private.person_label(new.id), ''), 'Someone')
        using errcode = '42501';
    end if;
  end if;
  -- A rough date needs its date (Step 81): when the date goes, circa goes.
  if new.date_of_birth is null then
    new.date_of_birth_circa := false;
  end if;
  if new.date_of_death is null then
    new.date_of_death_circa := false;
  end if;
  -- Where someone lives now is for the living (Step 153): once they're
  -- marked as having died, it goes.
  if new.is_deceased then
    new.place_id_residence := null;
    new.place_of_residence := null;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- What's held back of a child's own entry when it folds into their placeholder
-- ---------------------------------------------------------------------------

create or replace function private.entry_details(p_person uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'first_name', pe.first_name,
    'middle_name', pe.middle_name,
    'preferred_name', pe.preferred_name,
    'maiden_name', pe.maiden_name,
    'last_name', nullif(pe.last_name, ''),
    'date_of_birth', pe.date_of_birth,
    'date_of_birth_precision',
      case when pe.date_of_birth is not null then pe.date_of_birth_precision end,
    'date_of_birth_circa', nullif(pe.date_of_birth_circa, false),
    'birth_month', pe.birth_month,
    'birth_day', pe.birth_day,
    'city_of_birth', nullif(pe.city_of_birth, ''),
    'country_of_birth', nullif(pe.country_of_birth, ''),
    'place_id_birth', pe.place_id_birth,
    'place_id_residence', pe.place_id_residence,
    'place_of_residence', nullif(pe.place_of_residence, ''),
    'sex', pe.sex,
    'email', pe.email,
    'email_visible', case when pe.email is not null then pe.email_visible end,
    'photo_path', pe.photo_path,
    'photo_crop', pe.photo_crop
  ))
  from public.people pe
  where pe.id = p_person;
$$;

-- ---------------------------------------------------------------------------
-- That merge empties it with the rest
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.merge_invited_entry(p_invited uuid, p_own uuid, p_tree uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_invited public.people;
  v_own public.people;
  v_hold boolean;
begin
  select * into v_invited from public.people where id = p_invited;
  select * into v_own from public.people where id = p_own;
  if v_invited.id is null or v_own.id is null or p_invited = p_own
     or not exists (
       select 1 from public.profiles pr
       where pr.auth_user_id = v_uid and pr.self_person_id = p_own
     ) then
    return false;
  end if;

  -- Someone who has died is nobody's own entry (Steps 36 and 37).
  if v_invited.is_deceased or v_invited.date_of_death is not null
     or v_own.is_deceased or v_own.date_of_death is not null then
    return false;
  end if;

  -- A placeholder child (Step 98.3) folds into the child's own entry like
  -- any stand-in, but theirs takes its number too: one record, kept a
  -- placeholder to everyone (its details held back) until their parent
  -- shows it.
  v_hold := v_invited.placeholder_number is not null;

  -- A stand-in its maker added and nobody else has built on, spoken for by
  -- nobody, shown on this tree alone: folding it in loses nobody's work and
  -- moves nothing onto a tree they didn't agree to.
  if not private.person_is_claimable(p_invited)
     or not private.is_own_placeholder(p_invited, v_invited.created_by)
     or not private.is_placed(p_tree, p_invited)
     or exists (
       select 1 from public.tree_placements pl
       where pl.person_id = p_invited and pl.tree_id <> p_tree
     ) then
    return false;
  end if;

  -- Plainly someone else: a relative of theirs (a parent with the same name),
  -- or born more than a year apart.
  if exists (
       select 1 from public.relationships r
       where (r.from_person = p_invited and r.to_person = p_own)
          or (r.from_person = p_own and r.to_person = p_invited)
     )
     or abs(extract(year from v_invited.date_of_birth) - extract(year from v_own.date_of_birth)) > 1 then
    return false;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  if v_hold then
    insert into private.withheld_details as w (person_id, details)
    values (
      p_own,
      coalesce((select x.details from private.withheld_details x where x.person_id = p_invited), '{}'::jsonb)
        || coalesce((select x.details from private.withheld_details x where x.person_id = p_own), '{}'::jsonb)
        || private.entry_details(p_own)
    )
    on conflict (person_id) do update set details = excluded.details;
    update public.people set
      first_name = null, middle_name = null, preferred_name = null,
      maiden_name = null, last_name = '', date_of_birth = null,
      date_of_birth_circa = false, birth_month = null, birth_day = null,
      city_of_birth = null, country_of_birth = '', place_id_birth = null,
      place_id_residence = null, place_of_residence = null,
      sex = null, lineage_type = null, email = null, photo_path = null,
      photo_crop = null, placeholder_number = v_invited.placeholder_number
    where id = p_own;
  end if;

  -- Theirs sits where the invited entry sat on this canvas, unless it's
  -- there already. A placement a Root asked for and they hadn't answered
  -- becomes active, keeping that Root as `placed_by` (as Step 30.9 does).
  if not private.is_placed_in_full(p_tree, p_own) then
    insert into public.tree_placements as tp
      (tree_id, person_id, status, placed_by, responded_at, pos_x, pos_y, pos_dx, pos_dy)
    select p_tree, p_own, 'active', v_uid, now(), pl.pos_x, pl.pos_y, pl.pos_dx, pl.pos_dy
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_invited
    on conflict (tree_id, person_id) do update
      set status = 'active', responded_at = now(),
          approval = case when tp.approval = 'none' then 'none' else 'approved' end,
          answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end,
          pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          pos_dx = excluded.pos_dx, pos_dy = excluded.pos_dy;
  end if;

  -- Its lines move onto theirs, dropping any that would double up or point
  -- at itself (as `claim_person` does).
  delete from public.relationships r
  where (r.from_person = p_invited or r.to_person = p_invited)
    and (
      (case when r.from_person = p_invited then p_own else r.from_person end)
        = (case when r.to_person = p_invited then p_own else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = p_invited then p_own else from_person end,
      to_person = case when to_person = p_invited then p_own else to_person end
  where from_person = p_invited or to_person = p_invited;

  update public.stories set person_id = p_own where person_id = p_invited;
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = p_invited
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_own
    );
  update public.story_credits set person_id = p_own where person_id = p_invited;
  -- The photos it's in (Step 88.5), but for those theirs is in already.
  delete from public.album_tags t
  where t.person_id = p_invited
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_own
    );
  update public.album_tags set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;

  -- Its companions, staying their pet's first person where it was.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_own, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = p_invited and private.is_placed(pt.tree_id, p_own)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_own
  where pt.primary_person_id = p_invited
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_own
    );

  -- And a bloodline it anchors.
  update public.bloodline_anchors a
  set person_id = p_own
  where a.person_id = p_invited
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_own
    );

  delete from public.people where id = p_invited;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return true;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Their parent shows it as 'home'
-- ---------------------------------------------------------------------------

create or replace function public.reveal_withheld_details(p_person uuid, p_show text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_show text[] := coalesce(p_show, '{}');
  d jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_placeholder(p_person) or not private.is_own_child(p_person) then
    raise exception 'PLACEHOLDER: only their parent chooses what to show'
      using errcode = '42501';
  end if;
  if not v_show <@ array['name', 'birth', 'birthplace', 'home', 'sex', 'email', 'photo'] then
    raise exception 'REVEAL: unknown details %', v_show using errcode = '22023';
  end if;
  if not 'name' = any(v_show) then
    raise exception 'REVEAL_NAME: show their name too' using errcode = '22023';
  end if;

  select w.details into d
  from private.withheld_details w
  where w.person_id = p_person
  for update;
  if d is null then
    raise exception 'PLACEHOLDER: nothing is held back' using errcode = 'P0002';
  end if;

  update public.people pe set
    first_name = d ->> 'first_name',
    middle_name = d ->> 'middle_name',
    preferred_name = d ->> 'preferred_name',
    maiden_name = d ->> 'maiden_name',
    last_name = coalesce(d ->> 'last_name', ''),
    date_of_birth = case when 'birth' = any(v_show) then (d ->> 'date_of_birth')::date end,
    date_of_birth_precision = case
      when 'birth' = any(v_show) and d ? 'date_of_birth_precision'
        then d ->> 'date_of_birth_precision'
      else pe.date_of_birth_precision
    end,
    date_of_birth_circa = 'birth' = any(v_show)
      and coalesce((d ->> 'date_of_birth_circa')::boolean, false),
    birth_month = case when 'birth' = any(v_show) then (d ->> 'birth_month')::smallint end,
    birth_day = case when 'birth' = any(v_show) then (d ->> 'birth_day')::smallint end,
    city_of_birth = case when 'birthplace' = any(v_show) then d ->> 'city_of_birth' end,
    country_of_birth = case
      when 'birthplace' = any(v_show) then coalesce(d ->> 'country_of_birth', '')
      else ''
    end,
    place_id_birth = case when 'birthplace' = any(v_show) then (d ->> 'place_id_birth')::bigint end,
    place_id_residence = case when 'home' = any(v_show) then (d ->> 'place_id_residence')::bigint end,
    place_of_residence = case when 'home' = any(v_show) then d ->> 'place_of_residence' end,
    sex = case when 'sex' = any(v_show) then d ->> 'sex' end,
    email = case when 'email' = any(v_show) then d ->> 'email' end,
    email_visible = case
      when 'email' = any(v_show) and d ? 'email_visible'
        then (d ->> 'email_visible')::boolean
      else pe.email_visible
    end,
    photo_path = case when 'photo' = any(v_show) then d ->> 'photo_path' end,
    photo_crop = case when 'photo' = any(v_show) then d -> 'photo_crop' end,
    placeholder_number = null,
    -- Theirs, as a fill-in makes it, unless the child has claimed it.
    owner_user_id = case
      when private.person_owner_member(p_person) is null then v_uid
      else pe.owner_user_id
    end
  where pe.id = p_person;
end;
$$;

-- ---------------------------------------------------------------------------
-- Filling in the blanks: where someone living lives, when nothing is recorded
-- ---------------------------------------------------------------------------

create or replace function public.fill_person_blanks(p_person uuid, p_fields jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.people%rowtype;
  v_filled text[] := '{}';
  v_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'FILL_BLANKS: nothing to fill in' using errcode = '22023';
  end if;
  if not (private.can_edit_person(p_person) or private.can_fill_person(p_person)) then
    raise exception 'FILL_BLANKS: not yours to fill in' using errcode = '42501';
  end if;

  select * into v_row from public.people where id = p_person for update;
  if not found then
    raise exception 'FILL_BLANKS: that entry no longer exists' using errcode = '42501';
  end if;

  -- Names.
  v_value := private.fill_value(p_fields, 'first_name', 120);
  if v_value is not null and nullif(btrim(v_row.first_name), '') is null then
    v_row.first_name := v_value;
    v_filled := v_filled || 'first_name'::text;
  end if;
  v_value := private.fill_value(p_fields, 'middle_name', 120);
  if v_value is not null and nullif(btrim(v_row.middle_name), '') is null then
    v_row.middle_name := v_value;
    v_filled := v_filled || 'middle_name'::text;
  end if;
  v_value := private.fill_value(p_fields, 'preferred_name', 120);
  if v_value is not null and nullif(btrim(v_row.preferred_name), '') is null then
    v_row.preferred_name := v_value;
    v_filled := v_filled || 'preferred_name'::text;
  end if;
  v_value := private.fill_value(p_fields, 'maiden_name', 120);
  if v_value is not null and nullif(btrim(v_row.maiden_name), '') is null then
    v_row.maiden_name := v_value;
    v_filled := v_filled || 'maiden_name'::text;
  end if;

  -- Sex (`people_sex_check` holds it to the three answers).
  v_value := private.fill_value(p_fields, 'sex', 20);
  if v_value is not null and v_row.sex is null then
    v_row.sex := v_value;
    v_filled := v_filled || 'sex'::text;
  end if;

  -- Birth: a date, or a birthday with no year (Step 63), where there's
  -- neither; and a place where none is recorded at all.
  if v_row.date_of_birth is null and v_row.birth_month is null then
    v_value := private.fill_value(p_fields, 'date_of_birth', 10);
    if v_value is not null then
      v_row.date_of_birth := v_value::date;
      v_row.date_of_birth_precision :=
        coalesce(private.fill_value(p_fields, 'date_of_birth_precision', 5), 'day');
      v_row.date_of_birth_circa :=
        coalesce(private.fill_value(p_fields, 'date_of_birth_circa', 5), 'false')::boolean;
      v_filled := v_filled || 'date_of_birth'::text;
    elsif private.fill_value(p_fields, 'birth_month', 2) is not null then
      v_row.birth_month := private.fill_value(p_fields, 'birth_month', 2)::smallint;
      v_row.birth_day := private.fill_value(p_fields, 'birth_day', 2)::smallint;
      v_filled := v_filled || 'date_of_birth'::text;
    end if;
  end if;
  v_value := private.fill_value(p_fields, 'place_id_birth', 20);
  if v_value is not null
     and v_row.place_id_birth is null
     and nullif(btrim(v_row.city_of_birth), '') is null
     and nullif(btrim(v_row.country_of_birth), '') is null then
    v_row.place_id_birth := v_value::bigint;
    v_row.city_of_birth := private.fill_value(p_fields, 'city_of_birth', 120);
    v_row.country_of_birth :=
      coalesce(private.fill_value(p_fields, 'country_of_birth', 120), '');
    v_filled := v_filled || 'place_of_birth'::text;
  end if;

  -- Death, for someone already marked as having died.
  if v_row.is_deceased then
    v_value := private.fill_value(p_fields, 'date_of_death', 10);
    if v_value is not null and v_row.date_of_death is null then
      v_row.date_of_death := v_value::date;
      v_row.date_of_death_precision :=
        coalesce(private.fill_value(p_fields, 'date_of_death_precision', 5), 'day');
      v_row.date_of_death_circa :=
        coalesce(private.fill_value(p_fields, 'date_of_death_circa', 5), 'false')::boolean;
      v_filled := v_filled || 'date_of_death'::text;
    end if;
    v_value := private.fill_value(p_fields, 'place_id_death', 20);
    if v_value is not null
       and v_row.place_id_death is null
       and nullif(btrim(v_row.place_of_death), '') is null then
      v_row.place_id_death := v_value::bigint;
      v_row.place_of_death := private.fill_value(p_fields, 'place_of_death', 160);
      v_filled := v_filled || 'place_of_death'::text;
    end if;
  end if;

  -- Where they live now, for someone living (Step 153).
  if not v_row.is_deceased then
    v_value := private.fill_value(p_fields, 'place_id_residence', 20);
    if v_value is not null
       and v_row.place_id_residence is null
       and nullif(btrim(v_row.place_of_residence), '') is null then
      v_row.place_id_residence := v_value::bigint;
      v_row.place_of_residence := private.fill_value(p_fields, 'place_of_residence', 160);
      v_filled := v_filled || 'place_of_residence'::text;
    end if;
  end if;

  -- A photo where there's none, already uploaded into this entry's folder.
  v_value := private.fill_value(p_fields, 'photo_path', 300);
  if v_value is not null and v_row.photo_path is null then
    if private.uuid_or_null(split_part(v_value, '/', 2)) is distinct from p_person
       or not exists (
         select 1 from storage.objects o
         where o.bucket_id = 'photos' and o.name = v_value
       ) then
      raise exception 'FILL_BLANKS: that photo isn''t in this entry''s folder'
        using errcode = '42501';
    end if;
    v_row.photo_path := v_value;
    v_row.photo_crop := case
      when jsonb_typeof(p_fields -> 'photo_crop') = 'object' then p_fields -> 'photo_crop'
    end;
    v_filled := v_filled || 'photo'::text;
  end if;

  if array_length(v_filled, 1) is null then
    return v_filled;
  end if;

  perform set_config('ancestree.filling_blanks', 'on', true);
  update public.people set
    first_name = v_row.first_name,
    middle_name = v_row.middle_name,
    preferred_name = v_row.preferred_name,
    maiden_name = v_row.maiden_name,
    sex = v_row.sex,
    date_of_birth = v_row.date_of_birth,
    date_of_birth_precision = v_row.date_of_birth_precision,
    birth_month = v_row.birth_month,
    birth_day = v_row.birth_day,
    date_of_birth_circa = v_row.date_of_birth_circa,
    place_id_birth = v_row.place_id_birth,
    city_of_birth = v_row.city_of_birth,
    country_of_birth = v_row.country_of_birth,
    date_of_death = v_row.date_of_death,
    date_of_death_precision = v_row.date_of_death_precision,
    date_of_death_circa = v_row.date_of_death_circa,
    place_id_death = v_row.place_id_death,
    place_of_death = v_row.place_of_death,
    place_id_residence = v_row.place_id_residence,
    place_of_residence = v_row.place_of_residence,
    photo_path = v_row.photo_path,
    photo_crop = v_row.photo_crop
  where id = p_person;
  perform set_config('ancestree.filling_blanks', '', true);

  return v_filled;
end;
$$;

-- ---------------------------------------------------------------------------
-- Suggestions: a detail of its own
-- ---------------------------------------------------------------------------

create or replace function private.suggestion_columns()
returns table (detail text, columns text[])
language sql
immutable
set search_path = ''
as $$
  values
    ('first_name'::text, array['first_name']::text[]),
    ('middle_name', array['middle_name']),
    ('preferred_name', array['preferred_name']),
    ('maiden_name', array['maiden_name']),
    ('last_name', array['last_name']),
    ('sex', array['sex']),
    ('date_of_birth', array['date_of_birth', 'date_of_birth_precision', 'birth_month', 'birth_day', 'date_of_birth_circa']),
    ('place_of_birth', array['place_id_birth', 'city_of_birth', 'country_of_birth']),
    ('is_deceased', array['is_deceased']),
    ('date_of_death', array['date_of_death', 'date_of_death_precision', 'date_of_death_circa']),
    ('place_of_death', array['place_id_death', 'place_of_death']),
    ('place_of_residence', array['place_id_residence', 'place_of_residence'])
$$;

-- ---------------------------------------------------------------------------
-- Suggesting it, said as "current home"
-- ---------------------------------------------------------------------------

create or replace function public.suggest_entry_change(
  p_person uuid,
  p_tree uuid,
  p_values jsonb,
  p_note text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.people%rowtype;
  v_next public.people%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_detail text;
  v_columns text[];
  v_column text;
  v_changes jsonb := '{}';
  v_before jsonb := '{}';
  v_details text[] := '{}';
  v_words text[] := '{}';
  v_note text := nullif(btrim(p_note), '');
  v_name text;
  v_label text;
  v_id uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'SUGGEST: nothing to suggest' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not exists (
      select 1 from private.suggestion_columns() s where v_key = any (s.columns)
    ) then
      raise exception 'SUGGEST: % can''t be suggested', v_key using errcode = '22023';
    end if;
  end loop;
  if length(v_note) > 500 then
    raise exception 'SUGGEST: the note is longer than 500 characters'
      using errcode = '22001';
  end if;

  -- A member of a tree the entry is shown on, who can't edit it themselves.
  if not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, p_person)) then
    raise exception 'SUGGEST: not on your tree' using errcode = '42501';
  end if;
  if private.can_edit_person(p_person) then
    raise exception 'SUGGEST: yours to edit' using errcode = '42501';
  end if;

  select * into v_row from public.people where id = p_person;
  if not found then
    raise exception 'SUGGEST: that entry no longer exists' using errcode = '42501';
  end if;

  -- The entry as it would be. Going through its row type refuses a date, a
  -- number or a yes-or-no that isn't one.
  v_next := jsonb_populate_record(v_row, p_values);
  v_next.first_name := nullif(btrim(v_next.first_name), '');
  v_next.middle_name := nullif(btrim(v_next.middle_name), '');
  v_next.preferred_name := nullif(btrim(v_next.preferred_name), '');
  v_next.maiden_name := nullif(btrim(v_next.maiden_name), '');
  v_next.last_name := btrim(v_next.last_name);
  v_next.city_of_birth := nullif(btrim(v_next.city_of_birth), '');
  v_next.country_of_birth := coalesce(btrim(v_next.country_of_birth), '');
  v_next.place_of_death := nullif(btrim(v_next.place_of_death), '');
  v_next.place_of_residence := nullif(btrim(v_next.place_of_residence), '');
  v_next.is_deceased := coalesce(v_next.is_deceased, v_row.is_deceased);
  if greatest(
       length(v_next.first_name), length(v_next.middle_name),
       length(v_next.preferred_name), length(v_next.maiden_name),
       length(v_next.last_name), length(v_next.city_of_birth),
       length(v_next.country_of_birth)
     ) > 120
     or greatest(length(v_next.place_of_death), length(v_next.place_of_residence)) > 160 then
    raise exception 'SUGGEST: longer than a detail may be' using errcode = '22001';
  end if;
  -- Someone living has no death details, someone who has died no home
  -- now (Step 153), and a precision means something only beside its date:
  -- without one, the entry's stays as it is.
  if not v_next.is_deceased then
    v_next.date_of_death := null;
    v_next.place_id_death := null;
    v_next.place_of_death := null;
  else
    v_next.place_id_residence := null;
    v_next.place_of_residence := null;
  end if;
  if v_next.date_of_birth is null then
    v_next.date_of_birth_precision := v_row.date_of_birth_precision;
  end if;
  if v_next.date_of_death is null then
    v_next.date_of_death_precision := v_row.date_of_death_precision;
  end if;

  v_old := to_jsonb(v_row);
  v_new := to_jsonb(v_next);
  for v_detail, v_columns in
    select s.detail, s.columns from private.suggestion_columns() s
  loop
    if exists (
      select 1 from unnest(v_columns) c where v_old -> c is distinct from v_new -> c
    ) then
      v_details := array_append(v_details, v_detail);
      foreach v_column in array v_columns loop
        v_changes := v_changes || jsonb_build_object(v_column, v_new -> v_column);
        v_before := v_before || jsonb_build_object(v_column, v_old -> v_column);
      end loop;
    end if;
  end loop;
  if array_length(v_details, 1) is null then
    raise exception 'SUGGEST: nothing changed' using errcode = '22023';
  end if;

  -- It has to fit the entry: tried against every check on people, then
  -- undone, whatever happened.
  begin
    update public.people set
      first_name = v_next.first_name,
      middle_name = v_next.middle_name,
      preferred_name = v_next.preferred_name,
      maiden_name = v_next.maiden_name,
      last_name = v_next.last_name,
      sex = v_next.sex,
      date_of_birth = v_next.date_of_birth,
      date_of_birth_precision = v_next.date_of_birth_precision,
      birth_month = v_next.birth_month,
      birth_day = v_next.birth_day,
      place_id_birth = v_next.place_id_birth,
      city_of_birth = v_next.city_of_birth,
      country_of_birth = v_next.country_of_birth,
      is_deceased = v_next.is_deceased,
      date_of_death = v_next.date_of_death,
      date_of_death_precision = v_next.date_of_death_precision,
      place_id_death = v_next.place_id_death,
      place_of_death = v_next.place_of_death,
      place_id_residence = v_next.place_id_residence,
      place_of_residence = v_next.place_of_residence
    where id = p_person;
    raise exception using errcode = 'SG000';
  exception
    when sqlstate 'SG000' then
      null;
    when check_violation or not_null_violation or foreign_key_violation then
      raise exception 'SUGGEST: that doesn''t fit the entry' using errcode = '23514';
  end;

  -- Their earlier suggestion for this entry, still waiting, gives way.
  delete from public.entry_suggestions
  where person_id = p_person and suggested_by = v_uid and status = 'pending';

  v_name := private.member_label(v_uid);
  insert into public.entry_suggestions
    (person_id, tree_id, suggested_by, suggested_by_name, changes, before, note)
  values (p_person, p_tree, v_uid, v_name, v_changes, v_before, v_note)
  returning id into v_id;

  -- Said the way an edit's notice says it.
  if v_details && array['first_name', 'middle_name', 'preferred_name'] then
    v_words := array_append(v_words, 'name');
  end if;
  if v_details && array['last_name', 'maiden_name'] then
    v_words := array_append(v_words, 'family name');
  end if;
  if 'date_of_birth' = any (v_details) then
    v_words := array_append(v_words, 'date of birth');
  end if;
  if 'place_of_birth' = any (v_details) then
    v_words := array_append(v_words, 'birthplace');
  end if;
  if v_details && array['is_deceased', 'date_of_death', 'place_of_death'] then
    v_words := array_append(v_words, 'death details');
  end if;
  if 'place_of_residence' = any (v_details) then
    v_words := array_append(v_words, 'current home');
  end if;
  if 'sex' = any (v_details) then
    v_words := array_append(v_words, 'sex');
  end if;

  -- Asked: whoever owns the entry, the Roots of its home tree and the
  -- Branches there who tend it (Step 68), in that tree's inbox.
  v_label := private.person_label(p_person);
  for v_recipient in
    select v_row.owner_user_id
    union
    select m.user_id from public.tree_members m
    where m.tree_id = v_row.tree_id and m.role = 'admin'
    union
    select b.user_id from private.tending_branches(p_person) as b(user_id)
  loop
    if v_recipient is not null and v_recipient <> v_uid then
      insert into public.notifications
        (recipient_user_id, actor_user_id, type, person_id, body, tree_id, suggestion_id)
      values (
        v_recipient, v_uid, 'change_suggested', p_person,
        coalesce(v_name, 'A relative') || ' suggested a change to ' || v_label
          || ': ' || array_to_string(v_words, ', ') || '.',
        v_row.tree_id, v_id
      );
    end if;
  end loop;

  return v_details;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accepting it
-- ---------------------------------------------------------------------------

create or replace function public.decide_entry_suggestion(
  p_suggestion uuid,
  p_accept boolean,
  p_reason text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_suggestion public.entry_suggestions%rowtype;
  v_row public.people%rowtype;
  v_old jsonb;
  v_detail text;
  v_columns text[];
  v_applied text[] := '{}';
  -- Why it was declined (Step 69); accepting keeps none.
  v_reason text := case when not p_accept then nullif(btrim(p_reason), '') end;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'SUGGESTION: accept or decline it' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'SUGGESTION: the reason is longer than 500 characters'
      using errcode = '22001';
  end if;

  select * into v_suggestion
  from public.entry_suggestions where id = p_suggestion
  for update;
  if not found then
    raise exception 'SUGGESTION: withdrawn' using errcode = 'P0002';
  end if;
  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION: already answered' using errcode = '55000';
  end if;
  if not private.can_edit_person(v_suggestion.person_id) then
    raise exception 'SUGGESTION: not yours to answer' using errcode = '42501';
  end if;

  if p_accept then
    select * into v_row from public.people where id = v_suggestion.person_id for update;
    v_old := to_jsonb(v_row);
    v_row := jsonb_populate_record(v_row, v_suggestion.changes);
    -- As their own edit: `person_edit_notify` tells the owner and maker,
    -- and records a Branch's change to a Root's entry for the Root's undo.
    begin
      update public.people set
        first_name = v_row.first_name,
        middle_name = v_row.middle_name,
        preferred_name = v_row.preferred_name,
        maiden_name = v_row.maiden_name,
        last_name = v_row.last_name,
        sex = v_row.sex,
        date_of_birth = v_row.date_of_birth,
        date_of_birth_precision = v_row.date_of_birth_precision,
        birth_month = v_row.birth_month,
        birth_day = v_row.birth_day,
        date_of_birth_circa = v_row.date_of_birth_circa,
        place_id_birth = v_row.place_id_birth,
        city_of_birth = v_row.city_of_birth,
        country_of_birth = v_row.country_of_birth,
        is_deceased = v_row.is_deceased,
        date_of_death = v_row.date_of_death,
        date_of_death_precision = v_row.date_of_death_precision,
        date_of_death_circa = v_row.date_of_death_circa,
        place_id_death = v_row.place_id_death,
        place_of_death = v_row.place_of_death,
        place_id_residence = v_row.place_id_residence,
        place_of_residence = v_row.place_of_residence
      where id = v_suggestion.person_id;
    exception
      when check_violation or not_null_violation or foreign_key_violation then
        raise exception 'SUGGESTION: no longer fits the entry' using errcode = '23514';
    end;

    for v_detail, v_columns in
      select s.detail, s.columns from private.suggestion_columns() s
    loop
      if exists (
        select 1 from unnest(v_columns) c
        where v_suggestion.changes ? c
          and v_old -> c is distinct from v_suggestion.changes -> c
      ) then
        v_applied := array_append(v_applied, v_detail);
      end if;
    end loop;
  end if;

  update public.entry_suggestions
  set status = case when p_accept then 'accepted' else 'declined' end,
      decided_at = now(),
      decided_by = v_uid,
      decline_reason = v_reason
  where id = p_suggestion;

  -- The suggester hears, in the inbox of the tree they suggested from, with
  -- the suggestion itself, so a declined one can be opened again to edit and
  -- resend (Step 71).
  if v_suggestion.suggested_by <> v_uid then
    insert into public.notifications
      (recipient_user_id, actor_user_id, type, person_id, body, tree_id, suggestion_id)
    values (
      v_suggestion.suggested_by, v_uid,
      case when p_accept then 'suggestion_accepted' else 'suggestion_declined' end,
      v_suggestion.person_id,
      coalesce(private.member_label(v_uid), 'A relative')
        || case when p_accept then ' accepted' else ' declined' end
        || ' your suggested change to '
        || private.person_label(v_suggestion.person_id)
        || coalesce(': “' || v_reason || '”', '.'),
      v_suggestion.tree_id,
      p_suggestion
    );
  end if;

  return v_applied;
end;
$$;

-- ---------------------------------------------------------------------------
-- A Root's undo
-- ---------------------------------------------------------------------------

create or replace function private.revision_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'first_name', 'preferred_name', 'middle_name', 'last_name', 'maiden_name',
    'sex', 'date_of_birth', 'date_of_birth_precision', 'birth_month', 'birth_day',
    'date_of_birth_circa', 'city_of_birth', 'country_of_birth', 'place_id_birth',
    'is_deceased', 'date_of_death', 'date_of_death_precision', 'date_of_death_circa',
    'place_of_death', 'place_id_death', 'place_of_residence', 'place_id_residence',
    'photo_path', 'photo_crop'
  ]::text[];
$$;

-- ---------------------------------------------------------------------------
-- The edit notice says "current home"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.person_edit_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := (select auth.uid());
  v_label text;
  v_changes text[] := '{}';
  v_body text;
  v_old jsonb;
  v_new jsonb;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_field text;
  v_revision uuid;
begin
  if new.first_name is distinct from old.first_name
     or new.preferred_name is distinct from old.preferred_name
     or new.middle_name is distinct from old.middle_name then
    v_changes := v_changes || 'name'::text;
  end if;
  if new.last_name is distinct from old.last_name
     or new.maiden_name is distinct from old.maiden_name then
    v_changes := v_changes || 'family name'::text;
  end if;
  if new.date_of_birth is distinct from old.date_of_birth
     or new.date_of_birth_precision is distinct from old.date_of_birth_precision
     or new.birth_month is distinct from old.birth_month
     or new.birth_day is distinct from old.birth_day
     or new.date_of_birth_circa is distinct from old.date_of_birth_circa then
    v_changes := v_changes || 'date of birth'::text;
  end if;
  if new.city_of_birth is distinct from old.city_of_birth
     or new.country_of_birth is distinct from old.country_of_birth
     or new.place_id_birth is distinct from old.place_id_birth then
    v_changes := v_changes || 'birthplace'::text;
  end if;
  if new.is_deceased is distinct from old.is_deceased
     or new.date_of_death is distinct from old.date_of_death
     or new.date_of_death_precision is distinct from old.date_of_death_precision
     or new.date_of_death_circa is distinct from old.date_of_death_circa
     or new.place_of_death is distinct from old.place_of_death
     or new.place_id_death is distinct from old.place_id_death then
    v_changes := v_changes || 'death details'::text;
  end if;
  if new.place_of_residence is distinct from old.place_of_residence
     or new.place_id_residence is distinct from old.place_id_residence then
    v_changes := v_changes || 'current home'::text;
  end if;
  if new.sex is distinct from old.sex then
    v_changes := v_changes || 'sex'::text;
  end if;
  if new.lineage_type is distinct from old.lineage_type then
    v_changes := v_changes || 'lineage'::text;
  end if;
  if new.photo_path is distinct from old.photo_path
     or new.photo_crop is distinct from old.photo_crop then
    v_changes := v_changes || 'photo'::text;
  end if;

  if array_length(v_changes, 1) is null then
    return new;
  end if;

  v_label := private.person_label(new.id);
  v_body := v_label || ' was updated: ' || array_to_string(v_changes, ', ') || '.';

  -- A Branch of the home tree changing what one of its Roots owns or added,
  -- or anyone filling in what's missing on it (`fill_person_blanks`).
  if v_actor is not null
     and old.placeholder_number is null
     and (
       private.is_branch_of(new.tree_id)
       or coalesce(current_setting('ancestree.filling_blanks', true), '') = 'on'
     )
     and v_actor is distinct from new.owner_user_id
     and v_actor is distinct from new.created_by
     and exists (
       select 1 from public.tree_members m
       where m.tree_id = new.tree_id and m.role = 'admin'
         and m.user_id in (new.owner_user_id, new.created_by)
     )
  then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_field in array private.revision_fields() loop
      if v_old -> v_field is distinct from v_new -> v_field then
        v_before := v_before || jsonb_build_object(v_field, v_old -> v_field);
        v_after := v_after || jsonb_build_object(v_field, v_new -> v_field);
      end if;
    end loop;

    if v_before <> '{}'::jsonb then
      insert into public.entry_revisions (person_id, editor_user_id, before, after)
      values (new.id, v_actor, v_before, v_after)
      returning id into v_revision;

      v_body := coalesce(private.member_label(v_actor), 'A Branch')
        || ' updated ' || v_label || ': ' || array_to_string(v_changes, ', ') || '.';
    end if;
  end if;

  perform private.notify_edit(new.owner_user_id, v_actor, new.id, v_body, v_revision);
  if new.created_by is distinct from new.owner_user_id then
    perform private.notify_edit(new.created_by, v_actor, new.id, v_body, v_revision);
  end if;
  return new;
end;
$function$;
