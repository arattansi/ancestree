-- A companion's primary connection
--
-- A pet's companions can span generations — the dog the grandparents got, that
-- the grandchildren grew up with — and centring the chip on all of them floats
-- it into the middle of the chart, attached to nobody. So one companion is the
-- *primary*: it decides which household the pet belongs to and which row the
-- chip hangs from, while the rest only pull it sideways (see lib/pet-layout.ts).
--
-- Nullable on purpose: a pet whose primary is deleted, or one added before this
-- existed, still draws — the layout stands in the topmost companion — so a
-- missing primary is a cosmetic fallback, never a broken row.

alter table public.pets
  add column primary_person_id uuid references public.people (id) on delete set null;

comment on column public.pets.primary_person_id is
  'The companion this pet hangs from on the canvas. Always one of its pet_companions; null falls back to the topmost companion at layout time.';

create index pets_primary_person_idx on public.pets (primary_person_id);

-- Backfill: the companion the pet was linked to first, which for a pet added
-- through the dialog is the first person picked.
update public.pets p
set primary_person_id = (
  select c.person_id
  from public.pet_companions c
  where c.pet_id = p.id
  order by c.created_at asc, c.person_id asc
  limit 1
)
where p.primary_person_id is null;

-- ---------------------------------------------------------------------------
-- The primary has to be one of the pet's own companions.
--
-- UPDATE only: `addPet` inserts the pet before its companion links exist, so an
-- insert-time check would reject every new pet. The action sets the primary in
-- a follow-up update, which is exactly what this guards.
-- ---------------------------------------------------------------------------

create or replace function private.pets_primary_is_companion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.primary_person_id is not null
    and not exists (
      select 1
      from public.pet_companions c
      where c.pet_id = new.id
        and c.person_id = new.primary_person_id
    )
  then
    raise exception 'A companion''s primary connection must be one of its people.';
  end if;
  return new;
end;
$$;

create trigger pets_primary_is_companion
  before update of primary_person_id on public.pets
  for each row execute function private.pets_primary_is_companion();

-- ---------------------------------------------------------------------------
-- Unlinking the primary hands the role to whoever is left, so the pet never
-- points at someone who is no longer one of its people.
--
-- Runs after `pet_companions_prune_orphans` (same timing, alphabetical order):
-- if that dropped the pet outright there is nothing here to update.
-- ---------------------------------------------------------------------------

create or replace function private.pets_reassign_primary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pets p
  set primary_person_id = (
    select c.person_id
    from public.pet_companions c
    where c.pet_id = p.id
    order by c.created_at asc, c.person_id asc
    limit 1
  )
  where p.id = old.pet_id
    and p.primary_person_id = old.person_id;
  return old;
end;
$$;

create trigger pet_companions_reassign_primary
  after delete on public.pet_companions
  for each row execute function private.pets_reassign_primary();
