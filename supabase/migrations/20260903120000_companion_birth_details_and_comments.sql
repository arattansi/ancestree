-- Companions — a fuller birthday, a birthplace, and a comment thread
--
-- Three optional additions to the deliberately thin pet concept. All of them
-- live in the companion's panel only: the canvas chip, its dimensions, the
-- layout engine, the bloodline gate, and the claim system are untouched.
--
--   * birth_date — an exact date, for the people who know it, kept alongside
--     year_born (most pets only ever get a year).
--   * birthplace — free text, not a GeoNames place. A dog needs no gazetteer.
--   * pet_comments — a plain conversation. No flags, no open/resolved
--     lifecycle, no verification, and no notifications: a companion carries no
--     owner to notify and should not grow the machinery a person entry has.

alter table public.pets
  add column birth_date date,
  add column birthplace text
    check (birthplace is null or length(btrim(birthplace)) between 1 and 160);

-- When both are given they must agree, so the panel can show the exact date
-- and fall back to the bare year without ever contradicting itself.
alter table public.pets
  add constraint pets_birth_date_matches_year check (
    birth_date is null
    or year_born is null
    or extract(year from birth_date)::int = year_born
  );

-- ---------------------------------------------------------------------------
-- pet_comments — a plain thread on a companion
-- ---------------------------------------------------------------------------

create table public.pet_comments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_by uuid not null references public.profiles (auth_user_id)
    on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.pet_comments is
  'A plain comment thread on a companion. No flags, no resolve lifecycle, no verification, no notifications — a companion stays a thin concept.';

create index pet_comments_pet_created_idx
  on public.pet_comments (pet_id, created_at desc);

alter table public.pet_comments enable row level security;

-- Any tree member can read and post; the author or anyone who can edit the
-- companion can delete a comment (mirrors can_edit_pet's loose rule).
create policy pet_comments_select on public.pet_comments
  for select to authenticated
  using ((select private.is_tree_member(private.pet_tree_id(pet_id))));

create policy pet_comments_insert on public.pet_comments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(private.pet_tree_id(pet_id)))
  );

create policy pet_comments_delete on public.pet_comments
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.can_edit_pet(pet_id))
  );

revoke all on table public.pet_comments from anon, public;
grant select, insert, delete on table public.pet_comments to authenticated;
