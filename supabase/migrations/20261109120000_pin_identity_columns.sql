-- Identity columns can't be rewritten through the Data API (codebase audit,
-- 2026-11-09).
--
-- `authenticated` held INSERT and UPDATE on every column of these tables, and
-- the row policies say only WHO may write a row, not WHICH columns. So a
-- member could, with their own token and a plain PATCH:
--
--   * invites: point an invite they made at another family's tree
--     (`tree_id`) and redeem it — `redeem_invite` trusts the row — or clear
--     `invited_email` / push `expires_at` out on one;
--   * claims: insert a claim already `approved` on any entry they can see,
--     past the name match, the deceased check and the daily limit in
--     `claim_as_self`; or, as an entry's creator, rewrite whose claim it is;
--   * relationships: turn a line they drew into "I am this child's parent"
--     (`from_person` / `to_person` / `type`), which `is_own_child` then
--     believes (Step 98's rules for under-18s);
--   * people: set `owner_user_id` to themselves on an entry they can edit,
--     and read its owner-only email (Step 156);
--   * trees: set `created_by`, which the one-tree-each rule keys on.
--
-- The fix is the grant, not another trigger: `authenticated` keeps UPDATE
-- only on the columns the app writes as the member. Everything else already
-- goes through SECURITY DEFINER functions or the service role, which column
-- grants don't touch (checked live: no SECURITY INVOKER function updates
-- these tables or inserts a claim).
--
-- What the app writes as the member, and so what stays:
--   invites        archived_at            (`archiveExpiredInvites`, a Root)
--   relationships  the marriage columns   (`updateSpouseDates`)
--   people         every column of an entry's own details
--                                         (`updatePerson`, `addPeople`, the
--                                         phone's edit and scribe)
--   claims, trees  nothing
--
-- A column added to `people` later needs its own UPDATE grant here, as it
-- already needs a SELECT one (Step 156).

-- Invites ------------------------------------------------------------------

revoke update on public.invites from authenticated;
grant update (archived_at) on public.invites to authenticated;

-- Claims: made and decided by `claim_person`, `claim_person_as_self`,
-- `redeem_invite` and `decide_claim_dispute`. DELETE stays with its policy.

revoke insert, update on public.claims from authenticated;

-- Relationships: drawn by `connect_people` and `add_people_with_connections`.

revoke update on public.relationships from authenticated;
grant update (marriage_date, marriage_month, marriage_day, is_divorced, divorce_date)
  on public.relationships to authenticated;

-- People: everything but who made it, who owns it, and its id.
-- `people_before_write` still hands a filled-in placeholder to its parent:
-- a trigger's own assignment needs no grant.

revoke update on public.people from authenticated;
grant update (
  tree_id, first_name, preferred_name, last_name, date_of_birth,
  city_of_birth, country_of_birth, photo_path, is_deceased, date_of_death,
  place_of_death, lineage_type, updated_at, maiden_name, middle_name,
  place_id_birth, place_id_death, sex, photo_crop, date_of_birth_precision,
  date_of_death_precision, hidden_from_visitors, email, email_visible,
  birth_month, birth_day, date_of_birth_circa, date_of_death_circa,
  placeholder_number, place_id_residence, place_of_residence
) on public.people to authenticated;

-- Trees: renamed by `rename_tree`.

revoke update on public.trees from authenticated;
