-- Ancestree v1 schema: tables, RLS, and private storage buckets.
-- Lineage type is writable by admins only. Members share one Postgres role,
-- so the API can still select the column; the UI and this write trigger
-- enforce admin-only visibility/edits.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers (private, security definer — not exposed via the Data API)
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.uuid_or_null(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

grant execute on function private.set_updated_at() to authenticated, service_role;
grant execute on function private.uuid_or_null(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  can_invite boolean not null default false,
  invited_by_user_id uuid references public.profiles (auth_user_id) on delete set null,
  self_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  given_name text,
  preferred_name text,
  family_name text not null,
  date_of_birth date,
  city_of_birth text,
  country_of_birth text not null,
  photo_path text,
  is_deceased boolean not null,
  date_of_death date,
  place_of_death text,
  lineage_type text check (lineage_type in ('biological', 'adoptive', 'unknown')),
  created_by uuid not null references public.profiles (auth_user_id) on delete restrict,
  owner_user_id uuid not null references public.profiles (auth_user_id) on delete restrict,
  pos_x numeric,
  pos_y numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_required_identity check (
    (
      (given_name is not null and length(btrim(given_name)) > 0)
      or (preferred_name is not null and length(btrim(preferred_name)) > 0)
    )
    and length(btrim(family_name)) > 0
    and length(btrim(country_of_birth)) > 0
  )
);

alter table public.profiles
  add constraint profiles_self_person_id_fkey
  foreign key (self_person_id) references public.people (id) on delete set null;

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  from_person uuid not null references public.people (id) on delete cascade,
  to_person uuid not null references public.people (id) on delete cascade,
  type text not null check (type in ('parent', 'spouse')),
  created_by uuid not null references public.profiles (auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relationships_no_self_edge check (from_person <> to_person)
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  tree_id uuid not null references public.trees (id) on delete cascade,
  created_by uuid not null references public.profiles (auth_user_id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'accepted', 'revoked')),
  accepted_by_user_id uuid references public.profiles (auth_user_id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  claimant_user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  status text not null check (status in ('approved', 'disputed', 'rejected')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entry_comments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  created_by uuid not null references public.profiles (auth_user_id) on delete restrict,
  is_flag boolean not null default false,
  body text not null check (length(btrim(body)) > 0),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  uploaded_by uuid not null references public.profiles (auth_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index trees_created_by_idx on public.trees (created_by);
create index profiles_invited_by_user_id_idx on public.profiles (invited_by_user_id);
create index profiles_self_person_id_idx on public.profiles (self_person_id);
create index people_tree_id_idx on public.people (tree_id);
create index people_created_by_idx on public.people (created_by);
create index people_owner_user_id_idx on public.people (owner_user_id);
create index relationships_tree_id_idx on public.relationships (tree_id);
create index relationships_from_person_idx on public.relationships (from_person);
create index relationships_to_person_idx on public.relationships (to_person);
create unique index relationships_parent_edge_uidx
  on public.relationships (tree_id, from_person, to_person)
  where type = 'parent';
create unique index relationships_spouse_pair_uidx
  on public.relationships (tree_id, least(from_person, to_person), greatest(from_person, to_person))
  where type = 'spouse';
create index invites_tree_id_idx on public.invites (tree_id);
create index invites_created_by_idx on public.invites (created_by);
create index invites_accepted_by_user_id_idx on public.invites (accepted_by_user_id);
create index claims_person_id_idx on public.claims (person_id);
create index claims_claimant_user_id_idx on public.claims (claimant_user_id);
create unique index claims_one_approved_per_person_uidx
  on public.claims (person_id)
  where status = 'approved';
create index entry_comments_person_id_idx on public.entry_comments (person_id);
create index entry_comments_created_by_idx on public.entry_comments (created_by);
create index documents_person_id_idx on public.documents (person_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

-- ---------------------------------------------------------------------------
-- Membership / permission helpers (after tables exist)
-- ---------------------------------------------------------------------------

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = (select auth.uid())
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function private.is_tree_member(p_tree_id uuid)
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
      from public.trees t
      where t.id = p_tree_id
        and t.created_by = (select auth.uid())
    )
    or exists (
      select 1
      from public.profiles p
      join public.people pe on pe.id = p.self_person_id
      where p.auth_user_id = (select auth.uid())
        and pe.tree_id = p_tree_id
    )
    or exists (
      select 1
      from public.invites i
      where i.tree_id = p_tree_id
        and i.accepted_by_user_id = (select auth.uid())
        and i.status = 'accepted'
    );
$$;

create or replace function private.can_edit_person(p_person_id uuid)
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
      from public.people pe
      where pe.id = p_person_id
        and pe.owner_user_id = (select auth.uid())
    );
$$;

create or replace function private.can_invite_to_tree(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      private.is_tree_member(p_tree_id)
      and exists (
        select 1
        from public.profiles p
        where p.auth_user_id = (select auth.uid())
          and p.can_invite = true
      )
    );
$$;

grant execute on function private.is_member() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.is_tree_member(uuid) to authenticated, service_role;
grant execute on function private.can_edit_person(uuid) to authenticated, service_role;
grant execute on function private.can_invite_to_tree(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not private.is_admin() then
      new.role := 'member';
      new.can_invite := false;
    end if;
  elsif tg_op = 'UPDATE' then
    if not private.is_admin() then
      new.role := old.role;
      new.can_invite := old.can_invite;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.people_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := new.created_by;
    end if;
    if not private.is_admin() then
      new.lineage_type := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if not private.is_admin() and new.lineage_type is distinct from old.lineage_type then
      raise exception 'lineage_type can only be changed by an admin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

grant execute on function private.profiles_protect_role() to authenticated, service_role;
grant execute on function private.people_before_write() to authenticated, service_role;

create trigger trees_set_updated_at
  before update on public.trees
  for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger profiles_protect_role
  before insert or update on public.profiles
  for each row execute function private.profiles_protect_role();

create trigger people_set_updated_at
  before update on public.people
  for each row execute function private.set_updated_at();

create trigger people_before_write
  before insert or update on public.people
  for each row execute function private.people_before_write();

create trigger relationships_set_updated_at
  before update on public.relationships
  for each row execute function private.set_updated_at();

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function private.set_updated_at();

create trigger claims_set_updated_at
  before update on public.claims
  for each row execute function private.set_updated_at();

create trigger entry_comments_set_updated_at
  before update on public.entry_comments
  for each row execute function private.set_updated_at();

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.trees enable row level security;
alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.relationships enable row level security;
alter table public.invites enable row level security;
alter table public.claims enable row level security;
alter table public.entry_comments enable row level security;
alter table public.documents enable row level security;

-- trees
create policy trees_select on public.trees
  for select to authenticated
  using ((select private.is_tree_member(id)));

create policy trees_insert on public.trees
  for insert to authenticated
  with check ((select private.is_admin()));

create policy trees_update on public.trees
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy trees_delete on public.trees
  for delete to authenticated
  using ((select private.is_admin()));

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using ((select private.is_member()));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (auth_user_id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select private.is_admin())
  )
  with check (
    auth_user_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select private.is_admin()));

-- people
create policy people_select on public.people
  for select to authenticated
  using ((select private.is_tree_member(tree_id)));

create policy people_insert on public.people
  for insert to authenticated
  with check (
    (select private.is_tree_member(tree_id))
    and created_by = (select auth.uid())
  );

create policy people_update on public.people
  for update to authenticated
  using ((select private.can_edit_person(id)))
  with check ((select private.can_edit_person(id)));

create policy people_delete on public.people
  for delete to authenticated
  using ((select private.is_admin()));

-- relationships
create policy relationships_select on public.relationships
  for select to authenticated
  using ((select private.is_tree_member(tree_id)));

create policy relationships_insert on public.relationships
  for insert to authenticated
  with check (
    (select private.is_tree_member(tree_id))
    and created_by = (select auth.uid())
  );

create policy relationships_update on public.relationships
  for update to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
  )
  with check (
    (select private.is_admin())
    or created_by = (select auth.uid())
  );

create policy relationships_delete on public.relationships
  for delete to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
  );

-- invites
create policy invites_select on public.invites
  for select to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
    or accepted_by_user_id = (select auth.uid())
  );

create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_invite_to_tree(tree_id))
  );

create policy invites_update on public.invites
  for update to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
  )
  with check (
    (select private.is_admin())
    or created_by = (select auth.uid())
  );

create policy invites_delete on public.invites
  for delete to authenticated
  using ((select private.is_admin()));

-- claims
create policy claims_select on public.claims
  for select to authenticated
  using (
    exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and (select private.is_tree_member(pe.tree_id))
    )
  );

create policy claims_insert on public.claims
  for insert to authenticated
  with check (
    claimant_user_id = (select auth.uid())
    and exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and (select private.is_tree_member(pe.tree_id))
    )
  );

create policy claims_update on public.claims
  for update to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and pe.created_by = (select auth.uid())
    )
  )
  with check (
    (select private.is_admin())
    or exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and pe.created_by = (select auth.uid())
    )
  );

create policy claims_delete on public.claims
  for delete to authenticated
  using ((select private.is_admin()));

-- entry_comments
create policy entry_comments_select on public.entry_comments
  for select to authenticated
  using (
    exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and (select private.is_tree_member(pe.tree_id))
    )
  );

create policy entry_comments_insert on public.entry_comments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and (select private.is_tree_member(pe.tree_id))
    )
  );

create policy entry_comments_update on public.entry_comments
  for update to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
  )
  with check (
    (select private.is_admin())
    or created_by = (select auth.uid())
  );

create policy entry_comments_delete on public.entry_comments
  for delete to authenticated
  using ((select private.is_admin()));

-- documents
create policy documents_select on public.documents
  for select to authenticated
  using (
    exists (
      select 1
      from public.people pe
      where pe.id = person_id
        and (select private.is_tree_member(pe.tree_id))
    )
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (select private.can_edit_person(person_id))
  );

create policy documents_update on public.documents
  for update to authenticated
  using ((select private.can_edit_person(person_id)))
  with check ((select private.can_edit_person(person_id)));

create policy documents_delete on public.documents
  for delete to authenticated
  using (
    (select private.is_admin())
    or (select private.can_edit_person(person_id))
  );

-- ---------------------------------------------------------------------------
-- Privileges (cloud no longer auto-exposes new public tables)
-- ---------------------------------------------------------------------------

revoke all on table public.trees from anon, public;
revoke all on table public.profiles from anon, public;
revoke all on table public.people from anon, public;
revoke all on table public.relationships from anon, public;
revoke all on table public.invites from anon, public;
revoke all on table public.claims from anon, public;
revoke all on table public.entry_comments from anon, public;
revoke all on table public.documents from anon, public;

grant select, insert, update, delete on table public.trees to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.people to authenticated;
grant select, insert, update, delete on table public.relationships to authenticated;
grant select, insert, update, delete on table public.invites to authenticated;
grant select, insert, update, delete on table public.claims to authenticated;
grant select, insert, update, delete on table public.entry_comments to authenticated;
grant select, insert, update, delete on table public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private photos + documents
-- Path convention: {tree_id}/{person_id}/{filename}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'photos',
    'photos',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'documents',
    'documents',
    false,
    52428800,
    array['application/pdf', 'image/jpeg', 'image/png']
  );

create policy storage_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (select private.is_tree_member(private.uuid_or_null((storage.foldername(name))[1])))
  );

create policy storage_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  );

create policy storage_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  )
  with check (
    bucket_id = 'photos'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  );

create policy storage_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      (select private.is_admin())
      or (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
    )
  );

create policy storage_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (select private.is_tree_member(private.uuid_or_null((storage.foldername(name))[1])))
  );

create policy storage_documents_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  );

create policy storage_documents_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  )
  with check (
    bucket_id = 'documents'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  );

create policy storage_documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select private.is_admin())
      or (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
    )
  );
