-- Companion animals
--
-- A pet is *not* a relative. It is a much thinner concept than `people`: a
-- name, a species, a couple of years, and a photo. It has no lineage, no
-- generation, no claims, comments, documents, places, verification, or
-- notifications, and it is never anybody's child. Instead it hangs off one or
-- more *companions* — the people it lived with — which is why the link table is
-- many-to-many rather than a `relationships` row.
--
-- Keeping pets out of `people` / `relationships` is deliberate: the layout
-- engine, the bloodline gate, the claim system, and the generation bands all
-- assume every row in `people` is a human relative, and none of them should
-- ever have to special-case a dog.

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Cats and dogs are first-class; everything else is 'other' plus a label.
  species text not null check (species in ('cat', 'dog', 'other')),
  species_label text check (species_label is null or length(btrim(species_label)) between 1 and 40),
  -- Years, not dates: nobody remembers a pet's exact birthday, and asking for
  -- one would make this feel like a person entry.
  year_born integer check (year_born is null or year_born between 1900 and 2200),
  is_deceased boolean not null default false,
  year_died integer check (year_died is null or year_died between 1900 and 2200),
  photo_path text,
  photo_crop jsonb,
  -- Manual nudge from the computed spot below the companions, like `people`.
  pos_dx integer,
  pos_dy integer,
  created_by uuid not null references public.profiles (auth_user_id)
    on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pets_species_label_only_for_other check (
    species = 'other' or species_label is null
  ),
  constraint pets_death_year_after_birth check (
    year_born is null or year_died is null or year_died >= year_born
  ),
  constraint pets_death_year_needs_deceased check (
    is_deceased or year_died is null
  ),
  constraint pets_photo_crop_shape check (
    photo_crop is null
    or (
      jsonb_typeof(photo_crop -> 'zoom') = 'number'
      and jsonb_typeof(photo_crop -> 'focus_x') = 'number'
      and jsonb_typeof(photo_crop -> 'focus_y') = 'number'
      and (photo_crop ->> 'zoom')::numeric between 1 and 4
      and (photo_crop ->> 'focus_x')::numeric between 0 and 1
      and (photo_crop ->> 'focus_y')::numeric between 0 and 1
    )
  )
);

comment on table public.pets is
  'Companion animals. Pared-down, non-human canvas entries linked to one or more people via pet_companions; never a child, never part of a bloodline.';

create index pets_tree_idx on public.pets (tree_id);

create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function private.set_updated_at();

-- A pet can be shared by any number of people: the household dog belongs to
-- both partners and their kids, not to one "owner".
create table public.pet_companions (
  pet_id uuid not null references public.pets (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_by uuid not null references public.profiles (auth_user_id)
    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pet_id, person_id)
);

comment on table public.pet_companions is
  'Which people a pet lived with. Many-to-many, undirected, and carries no lineage meaning.';

create index pet_companions_person_idx on public.pet_companions (person_id);

-- ---------------------------------------------------------------------------
-- Both sides of a companion link must live in the same tree.
-- ---------------------------------------------------------------------------

create or replace function private.pet_companions_same_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.pets pt
    join public.people pe on pe.tree_id = pt.tree_id
    where pt.id = new.pet_id
      and pe.id = new.person_id
  ) then
    raise exception 'A pet and its companion must be in the same tree.';
  end if;
  return new;
end;
$$;

create trigger pet_companions_same_tree
  before insert or update on public.pet_companions
  for each row execute function private.pet_companions_same_tree();

-- A pet with nobody left to belong to has nowhere to sit on the canvas, so the
-- last companion leaving (usually a person entry being deleted) takes the pet
-- with it. The UI refuses to unlink the last companion, so in practice this
-- only fires on a cascade.
create or replace function private.pets_prune_orphans()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.pets p
  where p.id = old.pet_id
    and not exists (
      select 1 from public.pet_companions c where c.pet_id = p.id
    );
  return old;
end;
$$;

create trigger pet_companions_prune_orphans
  after delete on public.pet_companions
  for each row execute function private.pets_prune_orphans();

-- ---------------------------------------------------------------------------
-- Who may change a pet: an admin, whoever added it, or anyone who can already
-- edit one of its companions' entries. Deliberately looser than `people`
-- (deletes there are admin-only) — a pet carries no ownership or claim weight.
-- ---------------------------------------------------------------------------

create or replace function private.can_edit_pet(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.pets pt
      where pt.id = p_pet_id
        and pt.created_by = (select auth.uid())
    )
    or exists (
      select 1
      from public.pet_companions c
      where c.pet_id = p_pet_id
        and private.can_edit_person(c.person_id)
    );
$$;

create or replace function private.pet_tree_id(p_pet_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tree_id from public.pets where id = p_pet_id;
$$;

grant execute on function private.can_edit_pet(uuid) to authenticated, service_role;
grant execute on function private.pet_tree_id(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.pets enable row level security;
alter table public.pet_companions enable row level security;

create policy pets_select on public.pets
  for select to authenticated
  using ((select private.is_tree_member(tree_id)));

create policy pets_insert on public.pets
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(tree_id))
  );

create policy pets_update on public.pets
  for update to authenticated
  using ((select private.can_edit_pet(id)))
  with check (
    (select private.can_edit_pet(id))
    and (select private.is_tree_member(tree_id))
  );

create policy pets_delete on public.pets
  for delete to authenticated
  using ((select private.can_edit_pet(id)));

create policy pet_companions_select on public.pet_companions
  for select to authenticated
  using ((select private.is_tree_member(private.pet_tree_id(pet_id))));

create policy pet_companions_insert on public.pet_companions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_edit_pet(pet_id))
  );

create policy pet_companions_delete on public.pet_companions
  for delete to authenticated
  using ((select private.can_edit_pet(pet_id)));

revoke all on table public.pets from anon, public;
revoke all on table public.pet_companions from anon, public;
grant select, insert, update, delete on table public.pets to authenticated;
grant select, insert, delete on table public.pet_companions to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: pet photos live in the same private `photos` bucket, under
-- {tree_id}/pets/{pet_id}/{filename}. The existing select policy already
-- covers reads (it keys on the tree folder); writes need their own policies
-- because the person policies read folder[2] as a person id.
-- ---------------------------------------------------------------------------

create policy storage_photos_insert_pets on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'pets'
    and (select private.can_edit_pet(private.uuid_or_null((storage.foldername(name))[3])))
  );

create policy storage_photos_update_pets on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'pets'
    and (select private.can_edit_pet(private.uuid_or_null((storage.foldername(name))[3])))
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'pets'
    and (select private.can_edit_pet(private.uuid_or_null((storage.foldername(name))[3])))
  );

create policy storage_photos_delete_pets on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[2] = 'pets'
    and (select private.can_edit_pet(private.uuid_or_null((storage.foldername(name))[3])))
  );
