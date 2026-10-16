-- Step 156 (2 of 2) — Members can't read an entry's email from `people`.
--
-- Row security says which rows a member reads; it can't hold back one
-- column. So `authenticated` loses SELECT on the table and gets it back
-- on every column but `email`. A direct read naming `email` (or `*`) is
-- refused (42501), and so is a filter on it, so it can't be guessed
-- either. What still gives an email out:
--
--   tree_people              its CASE: the owner's own, or one shown to
--                            members of that tree (Step 155).
--   owned_entry_email        the owner's own (20261015140000).
--   person_claim_candidates  masked as tree_people (20261015140000).
--
-- Definer functions and views (owned by postgres) and the service role
-- are unaffected, and writing `email` still works: the app writes it only
-- for the owner (`updatePerson`). The app no longer selects `email` or `*`
-- from `people` as a member; `select("*")` on `people` in
-- `app/actions/privacy.ts` is the service role's.
--
-- Applied after the deploy that stopped the app reading `people.email`
-- directly: the build before it asked for it on the account page and the
-- off-tree child's edit page, and those reads would fail outright.
--
-- A NEW `people` COLUMN IS NOT READABLE BY MEMBERS until it's granted:
-- `grant select (<column>) on public.people to authenticated;` in the same
-- migration that adds it.
--
-- Down: `grant select on public.people to authenticated;` (the column
-- grants below can stay; the table grant covers them).

revoke select on public.people from authenticated;

grant select (
  id,
  tree_id,
  first_name,
  preferred_name,
  last_name,
  date_of_birth,
  city_of_birth,
  country_of_birth,
  photo_path,
  is_deceased,
  date_of_death,
  place_of_death,
  lineage_type,
  created_by,
  owner_user_id,
  created_at,
  updated_at,
  maiden_name,
  middle_name,
  place_id_birth,
  place_id_death,
  sex,
  photo_crop,
  date_of_birth_precision,
  date_of_death_precision,
  hidden_from_visitors,
  email_visible,
  birth_month,
  birth_day,
  date_of_birth_circa,
  date_of_death_circa,
  placeholder_number,
  place_id_residence,
  place_of_residence
) on public.people to authenticated;
