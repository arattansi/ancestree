-- Step 27.7 — Ancestral lands on a companion's place of birth.
--
-- The same as a person's (20260923041000): the family's own words for whose
-- land a companion was born on, optional. Left empty, the companion's panel
-- names the territories Native Land Digital maps at the place, looked up live
-- and never written here (NLD's Data Sovereignty Treaty forbids storing its
-- data). Companions have no place of death, so there's no death column.

alter table public.pets
  add column ancestral_lands_birth text
    check (
      ancestral_lands_birth is null
      or length(btrim(ancestral_lands_birth)) between 1 and 300
    );

comment on column public.pets.ancestral_lands_birth is
  'The family''s own wording for the ancestral lands of the place of birth (Step 27.7). Null shows Native Land Digital''s names instead, looked up live and never stored.';
