-- Step 4.5a — GeoNames `places` reference table for birthplace autocomplete.
--
-- Public reference data (not tree-scoped): every authenticated member may read
-- it; only the service role (used by scripts/import-geonames.ts) writes to it.
-- Source dump + import command are documented in ANCESTREE.md.

create extension if not exists pg_trgm;

create table if not exists public.places (
  id            bigint primary key,          -- GeoNames geonameid, kept as-is (stable external ID)
  name          text not null,               -- GeoNames "name" (UTF-8, modern/local form)
  ascii_name    text,                        -- GeoNames "asciiname" — accent-insensitive search
  country_code  text,                        -- ISO-3166 alpha-2
  admin1_code   text,                        -- state / province
  feature_class text,                        -- 'P' populated place, 'A' admin area, ...
  feature_code  text,                        -- PPL, PPLA, ADM1, ...
  latitude      double precision,
  longitude     double precision,
  population    bigint,
  search_name   text generated always as (lower(ascii_name)) stored
);

comment on table public.places is
  'GeoNames populated places + admin areas for birthplace autocomplete. Imported via scripts/import-geonames.ts; see ANCESTREE.md.';

-- Fuzzy autocomplete: trigram indexes for ILIKE / similarity on both the
-- normalised search_name and the raw ascii_name.
create index if not exists places_search_name_trgm
  on public.places using gin (search_name gin_trgm_ops);
create index if not exists places_ascii_name_trgm
  on public.places using gin (ascii_name gin_trgm_ops);

-- Country-scoped lookups (e.g. constrain autocomplete to country of birth).
create index if not exists places_country_code_idx
  on public.places (country_code);

alter table public.places enable row level security;

-- Reference data: readable by any signed-in member. No write policies — writes
-- go through the service role only.
drop policy if exists places_select_authenticated on public.places;
create policy places_select_authenticated
  on public.places for select
  to authenticated
  using (true);
