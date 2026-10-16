-- Step 155 — Visitors read people only through the view.
--
-- A visitor is a member of another tree a Root has opened theirs to
-- (`private.is_visitor_of`, Step 25.4). `people_select` let them read a
-- shown entry's row in `public.people` (`private.can_see_person`'s second
-- half), and row security is per row, not per column: a visitor asking
-- `/rest/v1/people` straight got the row whole, `email` and Step 153's
-- `place_id_residence` / `place_of_residence` included, though
-- `tree_people` held both back from them.
--
-- Now:
--
--   people_select            a row is read directly only by a member of a
--                            tree showing it in full, its owner, or a
--                            parent of their own child
--                            (`private.can_read_person`). Visitors no
--                            longer read it at all.
--   private.visible_people   what `tree_people` reads instead of `people`:
--                            the rows the old policy showed, under the old
--                            rule (`can_see_person` or `can_see_own_child`),
--                            so a visitor's cards and blurs are as before,
--                            and as fast. A definer view in `private`,
--                            which the API doesn't serve (PostgREST answers
--                            "Invalid schema: private"; no pg_graphql), as
--                            `private.basic_tree_people` is. Roles that
--                            bypass row security (the service role,
--                            postgres in a definer function) see every row,
--                            as they did.
--   tree_people              reads `private.visible_people`, so its CASEs
--                            are now all that stands between a visitor and
--                            these columns: an email shown to members
--                            ("Show this email to other members of the
--                            tree") goes to members of that tree only, as
--                            the current home does; the owner still sees
--                            their own. A share link or the newsletter
--                            (the service role, a member of nothing) no
--                            longer gets it either; neither used it.
--
-- Nothing in the app reads `people` as a visitor: their canvas is
-- `tree_people`, `tree_edges`, claims, anchors and pets; the sheet is
-- `tree_placements`, `my_trees` and `withheld_details`. Every direct
-- `people` read is of the reader's own entry, an entry on a tree they're a
-- member of, a parent's own child, or made with the service role.
-- `private.can_see_person` itself is unchanged: photos, stories and the
-- rest still ask it.
--
-- Down: put `people_select` back to
-- `(select private.can_see_person(id)) or (select private.can_see_own_child(id))`,
-- re-create `tree_people` from 20261015100000, then drop
-- `private.visible_people` and `private.can_read_person`.

-- ---------------------------------------------------------------------------
-- Who reads a row directly
-- ---------------------------------------------------------------------------

create function private.can_read_person(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- A member of a tree that shows them in full: `can_see_person`'s first
  -- half, without its visitors.
  select exists (
    select 1
    from public.tree_placements pl
    join public.tree_members m on m.tree_id = pl.tree_id
    where pl.person_id = p_person
      and pl.status = 'active'
      and pl.detail = 'full'
      and m.user_id = (select auth.uid())
  )
  -- Their own entry, wherever it is.
  or exists (
    select 1 from public.people pe
    where pe.id = p_person
      and pe.owner_user_id = (select auth.uid())
  )
  -- A parent's own child (Step 98.2).
  or private.can_see_own_child(p_person);
$$;

revoke all on function private.can_read_person(uuid) from public;
grant execute on function private.can_read_person(uuid) to authenticated, service_role;

-- `private.visible_people` names it for every reader, the service role
-- included, and a function a query names must be executable even where it
-- isn't reached.
grant execute on function private.can_see_own_child(uuid) to service_role;

alter policy people_select on public.people
  using ((select private.can_read_person(people.id)));

-- ---------------------------------------------------------------------------
-- What the canvas reads
-- ---------------------------------------------------------------------------

create view private.visible_people
  with (security_invoker = false)
as
select pe.id,
    pe.tree_id,
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
    pe.email,
    pe.email_visible,
    pe.birth_month,
    pe.birth_day,
    pe.date_of_birth_circa,
    pe.date_of_death_circa,
    pe.placeholder_number,
    pe.place_id_residence,
    pe.place_of_residence
from public.people pe
-- The old `people_select` rule, and every row for a role that bypasses row
-- security (`current_user` in a view is its reader). Masking the two
-- columns here as well slowed a visitor's canvas read from 64 ms to 120 ms
-- or more on a 136-card tree; `tree_people` masks them, per tree.
where (
    select ro.rolbypassrls
    from pg_catalog.pg_roles ro
    where ro.rolname = current_user
  ) is true
  or (select private.can_see_person(pe.id))
  or (select private.can_see_own_child(pe.id));

comment on view private.visible_people is
  'Step 155: the people rows public.tree_people may show its reader — people_select''s rows plus a visitor''s. Raw columns: tree_people masks email and current home. Not in the API.';

revoke all on private.visible_people from public;
grant select on private.visible_people to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The view: through private.visible_people, email to members only
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
            WHEN ((pe.id IS NOT NULL) AND ((pe.owner_user_id = ( SELECT auth.uid() AS uid)) OR (pe.email_visible AND private.is_tree_member(pl.tree_id)))) THEN pe.email
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
     LEFT JOIN private.visible_people pe ON ((pe.id = pl.person_id)))
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
