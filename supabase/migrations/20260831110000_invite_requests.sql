-- Step 12 — Public invite requests
--
-- Anyone can ask for an invite from the home screen with just their first
-- name, last name, and email. Requests land in a pending queue that admins
-- review on /admin: approving mints a normal single-use invite link the admin
-- can send on, declining closes the request.
--
-- Requests are inserted server-side with the service-role key (there is no
-- anon RLS insert policy and no grant to anon) so the table can never be
-- read, enumerated, or spammed directly from the browser.

create table public.invite_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  email text not null check (btrim(email) <> ''),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles (auth_user_id) on delete set null,
  reviewed_at timestamptz,
  invite_id uuid references public.invites (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open request per email; approved/declined ones stay as history.
create unique index invite_requests_pending_email_idx
  on public.invite_requests (lower(email))
  where status = 'pending';

create index invite_requests_status_created_idx
  on public.invite_requests (status, created_at desc);

create trigger invite_requests_set_updated_at
  before update on public.invite_requests
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — admins only. Inserts come from the service role, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.invite_requests enable row level security;

create policy invite_requests_select on public.invite_requests
  for select to authenticated
  using ((select private.is_admin()));

create policy invite_requests_update on public.invite_requests
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy invite_requests_delete on public.invite_requests
  for delete to authenticated
  using ((select private.is_admin()));

revoke all on table public.invite_requests from anon, public;
grant select, update, delete on table public.invite_requests to authenticated;
