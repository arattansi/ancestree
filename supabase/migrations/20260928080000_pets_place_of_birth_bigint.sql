-- Step 65 — A hand-added place can be a companion's place of birth.
--
-- pets.place_id_birth has been integer since 20260903130000, but places.id
-- is bigint, and a place a Root adds by hand (requestNewPlace, "Add a
-- place") takes an id from 10,000,000,000 up, past integer's 2,147,483,647.
-- So choosing one as a companion's place of birth failed on save with
-- "value out of range for type integer". The first such place is Shishang,
-- India (10000000000, added 2026-09-28). people's place ids have been
-- bigint from the start; this brings pets in line.
--
-- Only the FK (pets_place_id_birth_fkey, on delete set null) and the index
-- (pets_place_id_birth_idx) depend on the column. No view, policy, trigger
-- or function names it, so the rewrite rebuilds both under their own names
-- and nothing else changes. The app reads and writes the column as a
-- number either way, so this needs no code change.

alter table public.pets
  alter column place_id_birth type bigint;
