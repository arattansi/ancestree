-- Step 13 — View-only share links
--
-- Admins mint any number of view-only links to the shared tree from /admin.
-- A visitor who follows one sees the tree canvas read-only at
-- /shared/<token>, with a CTA to request edit access (the existing public
-- invite-request flow).
--
-- Links are read server-side with the service-role key (no anon RLS policy,
-- no grant to anon) so tokens can't be enumerated from the browser. Each link
-- is independently revocable and can carry an optional expiry.

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique
    default encode(extensions.gen_random_bytes(32), 'hex'),
  tree_id uuid not null references public.trees (id) on delete cascade,
  created_by uuid not null references public.profiles (auth_user_id)
    on delete cascade,
  label text,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index share_links_tree_created_idx
  on public.share_links (tree_id, created_at desc);

create trigger share_links_set_updated_at
  before update on public.share_links
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — admins only. The public /shared route reads via the service role,
-- which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.share_links enable row level security;

create policy share_links_select on public.share_links
  for select to authenticated
  using ((select private.is_admin()));

create policy share_links_insert on public.share_links
  for insert to authenticated
  with check ((select private.is_admin()));

create policy share_links_update on public.share_links
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy share_links_delete on public.share_links
  for delete to authenticated
  using ((select private.is_admin()));

revoke all on table public.share_links from anon, public;
grant select, insert, update, delete on table public.share_links to authenticated;
