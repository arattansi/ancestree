-- Step 30.5 — Give "no match" a way to reach family.
--
-- Request access looks for someone's family by the name they type (Step
-- 28). When it finds nobody, they can now ask a relative who's already on
-- ancestree: they type the relative's address, and if it belongs to a
-- member, that member is emailed an invite already filled in with the
-- newcomer's name and email (lib/invite-relays.server.ts). The screen
-- answers the same either way, so it never tells anyone who's a member.
--
-- 1. `public.invite_relays` — one row per ask passed on: the newcomer as
--    they typed themselves, and the member it went to. The server files it
--    with the service role (the newcomer isn't signed in); only that member
--    reads it — to fill in the invite — and answers it, invited or
--    dismissed. The rows are what the caps count (per address asking, per
--    member, and across the site), so an ask past a cap is never kept.
--    An open or dismissed ask stops the same address asking the same member
--    again.
-- 2. `invite_relay_recipient(email)` — the member an address belongs to,
--    for the service role only: the address lives in auth.users, and the
--    answer must never reach a browser.

-- ---------------------------------------------------------------------------
-- 1. Asks passed on to a member
-- ---------------------------------------------------------------------------
create table public.invite_relays (
  id uuid primary key default gen_random_uuid(),
  -- The member it was passed to.
  recipient_user_id uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  -- The newcomer, as they typed themselves on request access.
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text not null
    check (char_length(email) between 3 and 254 and email = lower(email)),
  status text not null default 'pending'
    check (status in ('pending', 'invited', 'dismissed')),
  -- The tree the member invited them to, once they have.
  tree_id uuid references public.trees (id) on delete set null,
  answered_at timestamptz,
  -- Whether the email to the member left the building.
  email_sent boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Asking again emails nobody: one ask per address and member while it's
-- open, or once the member has dismissed it. Once they've invited them, a
-- fresh ask may follow (an invite that lapsed unused, say).
create unique index invite_relays_one_per_member
  on public.invite_relays (recipient_user_id, email)
  where status <> 'invited';

-- The caps: asks to one member (and the member's own list), asks from one
-- address, and every ask on the site, each counted over recent days.
create index invite_relays_recipient_idx
  on public.invite_relays (recipient_user_id, created_at);
create index invite_relays_email_idx
  on public.invite_relays (email, created_at);
create index invite_relays_created_idx
  on public.invite_relays (created_at);
create index invite_relays_tree_idx on public.invite_relays (tree_id);

create trigger invite_relays_set_updated_at
  before update on public.invite_relays
  for each row execute function private.set_updated_at();

alter table public.invite_relays enable row level security;

-- The member it was passed to, and nobody else: not the tree's Roots, not a
-- beta reviewer.
create policy invite_relays_select on public.invite_relays for select to authenticated
  using (recipient_user_id = (select auth.uid()));
-- They answer it — invited, or dismissed — and it stays theirs, naming only
-- a tree they're on. Only the answer's columns are granted (below): what the
-- newcomer typed can't be changed.
create policy invite_relays_update on public.invite_relays for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (
    recipient_user_id = (select auth.uid())
    and (tree_id is null or private.is_tree_member(tree_id))
  );
-- No insert or delete policy: asks are filed, and dropped past a cap, by the
-- server with the service role.

revoke all on table public.invite_relays from anon, authenticated, public;
grant select on table public.invite_relays to authenticated;
grant update (status, tree_id, answered_at) on table public.invite_relays to authenticated;
grant all on table public.invite_relays to service_role;

-- ---------------------------------------------------------------------------
-- 2. Whose address is it
-- ---------------------------------------------------------------------------
-- A member: a profile on at least one tree. Their sign-in address comes back
-- too, for the server to email; neither ever reaches a browser.
create or replace function public.invite_relay_recipient(p_email text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, lower(u.email)
  from auth.users u
  join public.profiles p on p.auth_user_id = u.id
  where lower(u.email) = lower(btrim(p_email))
    and u.deleted_at is null
    and exists (select 1 from public.tree_members m where m.user_id = u.id)
  limit 1;
$$;

revoke all on function public.invite_relay_recipient(text) from anon, authenticated, public;
grant execute on function public.invite_relay_recipient(text) to service_role;
