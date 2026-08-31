-- Step 4.5b — add canonical place FKs to people.
-- The old free-text columns (city_of_birth / country_of_birth / place_of_death)
-- are kept for now: backfill (scripts/backfill-places.ts) may leave rows
-- unmatched, and they are only dropped in a later follow-up once Aalim has
-- reconciled the unmatched-rows CSV. Both new columns are nullable.

alter table public.people
  add column place_id_birth bigint references public.places(id),
  add column place_id_death bigint references public.places(id);

comment on column public.people.place_id_birth is
  'Canonical GeoNames place (birth). Backfilled from city_of_birth/country_of_birth; nullable while migration is incomplete.';
comment on column public.people.place_id_death is
  'Canonical GeoNames place (death). Backfilled from place_of_death; nullable.';

create index if not exists people_place_id_birth_idx on public.people (place_id_birth);
create index if not exists people_place_id_death_idx on public.people (place_id_death);
