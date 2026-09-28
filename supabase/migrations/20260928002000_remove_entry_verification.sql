-- Step 62 — Verification removed.
--
-- Aalim asked for "verification" to go altogether. Since Step 8 a Root could
-- mark an entry verified: its card showed a ✓, its details a badge and the
-- date, the admin console counted the entries that weren't, and the owner
-- and creator were told. The app stopped reading and writing any of it in
-- this step; this removes the rest: the function, the two columns and
-- tree_people's copy of one, the notices it sent and their type. Two entries
-- were marked verified on live, and one notice had been sent.
--
-- Apply only once the step's code is live: the code before it reads
-- tree_people.verified_at on every load of the tree.

drop function public.set_entry_verified(uuid, boolean);

-- A view can't lose a column in place, and tree_people names verified_at,
-- so it's dropped and made again without it, keeping the birthday columns
-- Step 63 (20260928001000) put at its end. Nothing depends on it; the
-- schema's default privileges give it the same grants as before.
drop view public.tree_people;

alter table public.people
  drop column verified_at,
  drop column verified_by;

create view public.tree_people
with (security_invoker = true) as
select
  pl.tree_id,
  pl.id as placement_id,
  pl.status as placement_status,
  pl.pos_x,
  pl.pos_y,
  pl.pos_dx,
  pl.pos_dy,
  (pe.tree_id = pl.tree_id) as is_home,
  pl.person_id as id,
  pe.tree_id as home_tree_id,
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
  (pe.id is null) as blurred,
  -- Shown to other members only when the person says so; otherwise it is
  -- the entry's owner's alone — not even a Root's.
  case
    when pe.id is not null and (pe.email_visible or pe.owner_user_id = (select auth.uid())) then pe.email
  end as email,
  pe.email_visible,
  pe.birth_month,
  pe.birth_day
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

grant select on public.tree_people to authenticated, service_role;

-- The notices it sent, then their type.
delete from public.notifications where type = 'entry_verified';

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placement_accepted', 'placement_declined',
    'tree_request_approved', 'placed_on_join', 'joined_by_link'
  )
);
