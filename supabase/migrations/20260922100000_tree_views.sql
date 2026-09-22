-- Step 25.1b — What a tree shows, as two views
--
-- `tree_people`: every active placement on a tree with the person's details
-- and the card position for that canvas. `tree_edges`: every connection both
-- of whose ends are placed on the tree. Both are `security_invoker`, so the
-- caller's row-level access to `people`, `relationships` and
-- `tree_placements` still applies; they only save the app from joining
-- placements by hand on every read.

create or replace view public.tree_people
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
  pe.id,
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
  pe.verified_at,
  pe.hidden_from_visitors,
  pe.created_at,
  pe.updated_at
from public.tree_placements pl
join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

grant select on public.tree_people to authenticated, service_role;

create or replace view public.tree_edges
with (security_invoker = true) as
select
  a.tree_id,
  r.id,
  r.from_person,
  r.to_person,
  r.type,
  r.created_by,
  r.marriage_date,
  r.is_divorced,
  r.divorce_date,
  r.tree_id as drawn_on_tree_id,
  r.created_at
from public.relationships r
join public.tree_placements a
  on a.person_id = r.from_person and a.status = 'active'
join public.tree_placements b
  on b.person_id = r.to_person and b.status = 'active' and b.tree_id = a.tree_id;

grant select on public.tree_edges to authenticated, service_role;

-- The trees a member belongs to, with their type in each, and the trees that
-- can be reached from one they belong to (Step 25.4 viewing).
create or replace view public.my_trees
with (security_invoker = true) as
select
  t.id,
  t.name,
  t.slug,
  t.created_by,
  t.created_at,
  m.role,
  m.created_at as joined_at,
  (select count(*) from public.tree_members x where x.tree_id = t.id) as member_count,
  (select count(*) from public.tree_placements p where p.tree_id = t.id and p.status = 'active') as person_count
from public.tree_members m
join public.trees t on t.id = m.tree_id
where m.user_id = (select auth.uid());

grant select on public.my_trees to authenticated, service_role;
