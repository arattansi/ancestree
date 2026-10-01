-- Step 98.2: placeholder children.
--
-- A Root or a Branch can't add someone else's child under 18 (Step 98.1),
-- but can hold their place: a placeholder child, with no details at all,
-- shown as "First Child", "Second Child"… under their parent. Only that
-- parent (their own entry is drawn as its parent) fills it in, and filling
-- it in makes it an ordinary entry, theirs. Nobody else edits, fills in,
-- suggests a change to, claims, invites to claim, or tells a story or tags a
-- photo of a placeholder; the parent, or whoever may delete it, can remove it.
--   * `people.placeholder_number`: null on an ordinary entry; on a
--     placeholder, its number among its parents' placeholder children when
--     it was made (never renumbered). `people_placeholder_empty` keeps every
--     detail empty while it's set; `people_required_identity` asks no name of
--     a placeholder.
--   * `add_placeholder_child(tree, parents)`: a Root or a Branch of the tree,
--     one or two parents placed there, one of them living; the bloodline gate
--     applies. A parent who is a member is told (`placeholder_child`).
--   * `people_before_write`: the number is only ever set by that call and
--     only ever cleared; the parent's edit that gives a placeholder any detail
--     clears it and makes the entry theirs.
--   * `can_edit_person`: a placeholder is its parent's alone, a Root's rights
--     don't reach it; `can_fill_person` never offers it; `can_delete_person`
--     adds its parent.
--   * `person_label`: "First Child"… for a placeholder.
--   * `person_edit_notify`: a placeholder filled in is no Branch edit for a
--     Root to undo.
--   * `placeholder_entry_guard` on suggestions, claims, invites, stories and
--     album tags.
--   * `tree_people` / `basic_tree_people` carry `placeholder_number` at the end.

alter table public.people add column placeholder_number smallint;

alter table public.people add constraint people_placeholder_empty check (
  placeholder_number is null
  or (
    placeholder_number >= 1
    and first_name is null and middle_name is null and preferred_name is null
    and maiden_name is null and last_name = ''
    and date_of_birth is null and birth_month is null and birth_day is null
    and city_of_birth is null and country_of_birth = '' and place_id_birth is null
    and not is_deceased and date_of_death is null and place_of_death is null
    and place_id_death is null and sex is null and lineage_type is null
    and photo_path is null and photo_crop is null and email is null
  )
);

alter table public.people drop constraint people_required_identity;
alter table public.people add constraint people_required_identity check (
  placeholder_number is not null
  or (
    (
      (first_name is not null and length(btrim(first_name)) > 0)
      or (preferred_name is not null and length(btrim(preferred_name)) > 0)
    )
    and length(btrim(last_name)) > 0
  )
);

comment on column public.people.placeholder_number is
  'Step 98.2: set on a placeholder child (no details; shown as "First Child"…), its number among its parents'' placeholders when made; null on every other entry.';

-- "First Child", "Second Child" … "Twelfth Child", then "13th Child".
-- `lib/placeholders.ts#placeholderLabel` mirrors it.
create or replace function private.placeholder_label(p_number integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_number between 1 and 12 then
      (array['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
             'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'])[p_number]
      || ' Child'
    else
      p_number::text
      || case
           when p_number % 100 between 11 and 13 then 'th'
           when p_number % 10 = 1 then 'st'
           when p_number % 10 = 2 then 'nd'
           when p_number % 10 = 3 then 'rd'
           else 'th'
         end
      || ' Child'
  end;
$$;

-- Whether an entry is a placeholder child.
create or replace function private.is_placeholder(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.people pe
    where pe.id = p_person and pe.placeholder_number is not null
  );
$$;

revoke all on function private.placeholder_label(integer) from public, anon, authenticated;
revoke all on function private.is_placeholder(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.person_label(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when placeholder_number is not null then private.placeholder_label(placeholder_number)
    else btrim(
      concat_ws(
        ' ',
        coalesce(nullif(btrim(preferred_name), ''), nullif(btrim(first_name), '')),
        nullif(btrim(last_name), '')
      )
    )
  end
  from public.people
  where id = p_person_id;
$function$;


CREATE OR REPLACE FUNCTION private.can_edit_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select case
  -- A placeholder child is its parent's alone (Step 98.2).
  when private.is_placeholder(p_person_id) then private.is_own_child(p_person_id)
  else coalesce(
    private.is_root_of(h.tree)
    or p_person_id = private.self_person_id()
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and exists (
        select 1
        from public.people pe
        where pe.id = p_person_id
          and (
            pe.owner_user_id = (select auth.uid())
            or (
              pe.created_by = (select auth.uid())
              and pe.owner_user_id = pe.created_by
              and not private.person_is_claimed(pe.id)
            )
          )
      )
    )
    or (
      private.is_on_own_branch(p_person_id, h.tree)
      and not private.person_is_someones_own(p_person_id)
    ),
    false
  )
  end
  from h;
$function$;

CREATE OR REPLACE FUNCTION private.can_fill_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.role_in(h.tree) in ('branch_admin', 'member')
    and not private.person_is_someones_own(p_person_id)
    and not private.is_placeholder(p_person_id)
    and exists (
      select 1
      from private.line_ids(private.self_person_id(), h.tree) as l(id)
      where l.id = p_person_id
    ),
    false
  )
  from h;
$function$;

CREATE OR REPLACE FUNCTION private.can_delete_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    -- A placeholder child's parent (Step 98.2).
    or (private.is_placeholder(p_person_id) and private.is_own_child(p_person_id))
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.stories s
        where s.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.album_tags t
        join public.album_photos p on p.id = t.photo_id
        where t.person_id = p_person_id and p.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$function$;

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
       and new.lineage_type is distinct from old.lineage_type then
      raise exception 'lineage_type can only be changed by a Root' using errcode = '42501';
    end if;
    if new.tree_id is distinct from old.tree_id
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on'
       and (select auth.uid()) is not null then
      raise exception 'HOME_TREE: change a home tree through set_home_tree' using errcode = '42501';
    end if;
    -- Placeholder children (Step 98.2): the number is given only by
    -- `add_placeholder_child` and never changed. Their parent's edit that
    -- gives one any detail clears it and makes the entry theirs.
    if new.placeholder_number is distinct from old.placeholder_number
       and new.placeholder_number is not null
       and (select auth.uid()) is not null then
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
        new.photo_crop, new.email)
       is distinct from
       (old.first_name, old.middle_name, old.preferred_name, old.maiden_name,
        old.last_name, old.date_of_birth, old.birth_month, old.birth_day,
        old.city_of_birth, old.country_of_birth, old.place_id_birth,
        old.is_deceased, old.date_of_death, old.place_of_death,
        old.place_id_death, old.sex, old.lineage_type, old.photo_path,
        old.photo_crop, old.email) then
      if not private.is_own_child(new.id) then
        raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
          using errcode = '42501';
      end if;
      new.placeholder_number := null;
      new.owner_user_id := (select auth.uid());
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
  return new;
end;
$function$;

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

create or replace view private.basic_tree_people
  with (security_invoker = false)
as
SELECT pl.tree_id,
    pl.id AS placement_id,
    pl.status AS placement_status,
    pl.pos_x,
    pl.pos_y,
    pl.pos_dx,
    pl.pos_dy,
    pl.person_id AS id,
    private.placement_approval_now(pl.approval, pl.asked_at) AS approval,
    pl.detail,
    s.shown,
        CASE
            WHEN s.shown THEN pe.tree_id
            ELSE NULL::uuid
        END AS home_tree_id,
        CASE
            WHEN s.shown THEN pe.first_name
            ELSE NULL::text
        END AS first_name,
        CASE
            WHEN s.shown THEN pe.preferred_name
            ELSE NULL::text
        END AS preferred_name,
        CASE
            WHEN s.shown THEN pe.last_name
            ELSE NULL::text
        END AS last_name,
        CASE
            WHEN s.shown THEN pe.city_of_birth
            ELSE NULL::text
        END AS city_of_birth,
        CASE
            WHEN s.shown THEN pe.country_of_birth
            ELSE NULL::text
        END AS country_of_birth,
        CASE
            WHEN s.shown THEN pe.place_id_birth
            ELSE NULL::bigint
        END AS place_id_birth,
        CASE
            WHEN (private.person_owner_member(pl.person_id) IS NOT NULL) THEN 'owner'::text
            ELSE 'stewards'::text
        END AS asked_of,
    private.placement_nudge_due(pl.approval, pl.asked_at, pl.reminded_at, pl.lapse_told_at) AS nudge_due,
    pe.placeholder_number
   FROM ((tree_placements pl
     JOIN people pe ON ((pe.id = pl.person_id)))
     CROSS JOIN LATERAL ( SELECT ((NOT pe.hidden_from_visitors) OR private.is_tree_member(pl.tree_id) OR (COALESCE(( SELECT auth.role() AS role), ''::text) = 'service_role'::text)) AS shown) s)
  WHERE ((pl.status = 'active'::text) AND (pl.detail = 'basic'::text) AND (private.can_view_tree(pl.tree_id) OR (COALESCE(( SELECT auth.role() AS role), ''::text) = 'service_role'::text)));

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
    pe.placeholder_number
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
    b.placeholder_number
   FROM private.basic_tree_people b;


-- Nobody but a placeholder's parent tells a story about it or tags it in a
-- photo, and nobody suggests a change to it, claims it or is invited to.
create or replace function private.placeholder_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.person_id is not null
     and private.is_placeholder(new.person_id)
     and (
       tg_table_name in ('entry_suggestions', 'claims', 'invites')
       or not private.is_own_child(new.person_id)
     ) then
    raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.placeholder_entry_guard() from public, anon, authenticated;

create trigger entry_suggestions_placeholder_guard
  before insert on public.entry_suggestions
  for each row execute function private.placeholder_entry_guard();
create trigger claims_placeholder_guard
  before insert on public.claims
  for each row execute function private.placeholder_entry_guard();
create trigger invites_placeholder_guard
  before insert on public.invites
  for each row execute function private.placeholder_entry_guard();
create trigger stories_placeholder_guard
  before insert on public.stories
  for each row execute function private.placeholder_entry_guard();
create trigger album_tags_placeholder_guard
  before insert on public.album_tags
  for each row execute function private.placeholder_entry_guard();

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type = any (array[
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_updated',
    'person_added', 'edit_reverted', 'placement_requested',
    'placements_requested', 'placement_accepted', 'placement_declined',
    'placements_lapsed', 'tree_request_approved', 'placed_on_join',
    'joined_by_link', 'change_suggested', 'suggestion_accepted',
    'suggestion_declined', 'story_to_approve', 'story_approved',
    'story_declined', 'story_commented', 'photo_to_approve', 'photo_approved',
    'photo_declined', 'placeholder_child'
  ])
);

-- A placeholder child of `p_parents` (one or two people placed on
-- `p_tree`, at least one of them living, neither a placeholder), added by a
-- Root or a Branch of that tree. Numbered after its parents' placeholders.
-- A parent who is a member is told; the others are returned
-- (`uninvited_parents`), so whoever added it can invite them to claim their
-- own entry.
create or replace function public.add_placeholder_child(p_tree uuid, p_parents uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_parent uuid;
  v_number smallint;
  v_id uuid;
  v_outside uuid[];
  v_member uuid;
  v_uninvited uuid[] := '{}';
  v_actor text;
  v_label text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_tree is null or not private.is_tree_member(p_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;
  if private.role_in(p_tree) not in ('admin', 'branch_admin') then
    raise exception 'PLACEHOLDER: only a Root or a Branch adds a placeholder child'
      using errcode = '42501';
  end if;
  if p_parents is null or cardinality(p_parents) not between 1 and 2
     or p_parents[1] is null or p_parents[cardinality(p_parents)] is null
     or (cardinality(p_parents) = 2 and p_parents[1] = p_parents[2]) then
    raise exception 'PLACEHOLDER: name one or two parents' using errcode = '22023';
  end if;

  -- One at a time per family, so two never take the same number.
  perform 1 from public.people pe
  where pe.id = any(p_parents)
  order by pe.id
  for update;

  foreach v_parent in array p_parents loop
    if not private.is_placed(p_tree, v_parent)
       or private.is_placeholder(v_parent) then
      raise exception 'PLACEHOLDER: their parent isn''t on this tree'
        using errcode = '42501';
    end if;
  end loop;
  if not exists (
    select 1 from public.people pe
    where pe.id = any(p_parents) and not pe.is_deceased and pe.date_of_death is null
  ) then
    raise exception 'PLACEHOLDER: a placeholder needs a living parent to fill it in'
      using errcode = '23514';
  end if;

  select coalesce(max(c.placeholder_number), 0) + 1 into v_number
  from public.relationships r
  join public.people c on c.id = r.to_person
  where r.type = 'parent' and r.from_person = any(p_parents)
    and c.placeholder_number is not null;

  insert into public.people (
    tree_id, first_name, last_name, country_of_birth, is_deceased,
    placeholder_number, created_by, owner_user_id
  ) values (
    p_tree, null, '', '', false, v_number, v_uid, v_uid
  )
  returning id into v_id;

  -- Its parent lines are this call's to judge, not the "18 or older?"
  -- question a first line to a child otherwise asks (Step 98.1).
  perform private.note_new_people(array[v_id]);
  insert into public.relationships (tree_id, from_person, to_person, type, created_by)
  select p_tree, x, v_id, 'parent', v_uid
  from unnest(p_parents) as x;
  perform private.note_new_people(null);

  perform private.assert_tree_consistent(p_tree);

  v_outside := private.without_blood_tie(p_tree, array[v_id]);
  if cardinality(v_outside) > 0 then
    raise exception 'BLOODLINE_GATE: % has no blood tie to this tree',
      private.placeholder_label(v_number)
      using errcode = '42501', detail = 'new:0';
  end if;

  v_label := private.placeholder_label(v_number);
  v_actor := coalesce(private.member_label(v_uid), 'A Root');
  foreach v_parent in array p_parents loop
    continue when exists (
      select 1 from public.people pe
      where pe.id = v_parent and (pe.is_deceased or pe.date_of_death is not null)
    );
    v_member := private.person_owner_member(v_parent);
    if v_member is null then
      v_uninvited := array_append(v_uninvited, v_parent);
    else
      perform private.notify(
        v_member, v_uid, 'placeholder_child', v_id, null,
        v_actor || ' added a placeholder for your child (' || v_label
          || '). Only you can fill it in.',
        p_tree
      );
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'number', v_number,
    'uninvited_parents', to_jsonb(v_uninvited)
  );
end;
$$;

revoke all on function public.add_placeholder_child(uuid, uuid[]) from public, anon;
grant execute on function public.add_placeholder_child(uuid, uuid[]) to authenticated;
