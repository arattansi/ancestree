-- Companions — a place of birth that matches human relatives
--
-- The free-text `pets.birthplace` shipped in 20260903120000 is replaced with
-- the same GeoNames-backed shape a person entry uses: a `place_id_birth` FK
-- into `places`, plus the denormalised `city_of_birth` / `country_of_birth`
-- text pair that the panel reads without a join. Still fully optional — a pet
-- needs no birthplace, where a person does.

alter table public.pets
  drop column birthplace,
  add column place_id_birth integer
    references public.places (id) on delete set null,
  add column city_of_birth text
    check (city_of_birth is null or length(btrim(city_of_birth)) between 1 and 120),
  add column country_of_birth text
    check (country_of_birth is null or length(btrim(country_of_birth)) between 1 and 120);

create index pets_place_id_birth_idx on public.pets (place_id_birth);
