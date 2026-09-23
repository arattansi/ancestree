-- Step 41.5 — Asking a relative: count every ask, let members opt out, let
-- asks lapse.
--
-- Step 30.5 (20260923074000_invite_relays) left three gaps. An ask to an
-- address that isn't a member's was never stored, so it counted toward no
-- cap, and the lookup ran for every address anyone tried. A member couldn't
-- opt out of being asked. And an ask nobody answered waited for ever.
--
-- 1. `public.invite_relay_asks`: a note of every ask, whoever the address
--    belongs to, holding the address asking and when, and nothing else:
--    never the relative's address. The server notes each ask with the
--    service role before anything else (lib/invite-relays.server.ts), and
--    the caps per address asking and across the site count these notes
--    before the lookup runs, so an ask past one looks nobody up. Its note
--    is taken back, so an ask past a cap is never kept. No cap looks back
--    further than a day, so older notes are deleted as new asks come in.
-- 2. `profiles.relatives_can_ask`: "Relatives can ask me to invite them" on
--    account settings, on unless the member turns it off. Off, the lookup
--    below finds nobody at their address, so the newcomer is told what
--    everyone is told and nothing is filed or sent. Asks already waiting
--    stay until they're answered or lapse.
-- 3. `invite_relay_recipient(email)`: as before, now honouring (2).
--
-- An ask left pending for 30 days lapses. The app stops showing it and
-- refuses to answer it, and deletes it as new asks come in (pg_cron isn't
-- enabled, so there's no schedule), which lets the same address ask that
-- member again. `invite_relays_created_idx` already serves that delete.

-- ---------------------------------------------------------------------------
-- 1. A note of every ask
-- ---------------------------------------------------------------------------
create table public.invite_relay_asks (
  id uuid primary key default gen_random_uuid(),
  -- The address asking, as the newcomer typed their own on request access.
  email text not null
    check (char_length(email) between 3 and 254 and email = lower(email)),
  created_at timestamptz not null default now()
);

comment on table public.invite_relay_asks is
  'Every ask to a relative (Step 41.5): the address asking and when, for the caps per address and across the site. Never the relative''s address. Service role only; notes older than a day are deleted as new asks come in.';

-- The caps: asks from one address, and every ask on the site, each counted
-- over the last day; and the clean-up of older notes.
create index invite_relay_asks_email_idx
  on public.invite_relay_asks (email, created_at);
create index invite_relay_asks_created_idx
  on public.invite_relay_asks (created_at);

alter table public.invite_relay_asks enable row level security;
-- No policies: only the server, with the service role, notes and counts
-- asks. Nobody signed in or out can read or write a note.
revoke all on table public.invite_relay_asks from anon, authenticated, public;
grant all on table public.invite_relay_asks to service_role;

-- ---------------------------------------------------------------------------
-- 2. "Relatives can ask me to invite them"
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column relatives_can_ask boolean not null default true;

comment on column public.profiles.relatives_can_ask is
  'Whether a newcomer''s ask to a relative (invite_relays) may reach this member (Step 41.5). Off, invite_relay_recipient finds nobody at their address.';

-- ---------------------------------------------------------------------------
-- 3. Whose address is it
-- ---------------------------------------------------------------------------
-- A member: a profile on at least one tree, who lets relatives ask. Their
-- sign-in address comes back too, for the server to email; neither ever
-- reaches a browser.
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
    and p.relatives_can_ask
    and exists (select 1 from public.tree_members m where m.user_id = u.id)
  limit 1;
$$;

revoke all on function public.invite_relay_recipient(text) from anon, authenticated, public;
grant execute on function public.invite_relay_recipient(text) to service_role;
