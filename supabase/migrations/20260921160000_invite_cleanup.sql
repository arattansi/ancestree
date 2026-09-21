-- Step 24 — Invites clean up after themselves
--
-- The admin console kept every invite forever: ones that had done their job
-- ("Joined") and ones that had quietly run out ("Expired, unused") sat among
-- the live links. Now:
--
-- 1. Joining deletes the invite, and the "Sent invites" record that named it.
--    The member keeps everything the invite gave them — `profiles` records who
--    invited them and what they joined as — so nothing is lost with it.
-- 2. An invite that expires unused is archived (`archived_at`), not deleted:
--    it leaves the live lists but stays on record under "Archived invites".
--    There is no scheduler here, so /admin archives whatever has lapsed each
--    time it loads; a lapsed link is dead either way (`redeem_invite` checks
--    `expires_at`), so the timing is cosmetic.
--
-- The one thing an accepted invite still did was vouch for its entry: a claim
-- invite lets whoever redeemed it claim that entry without the name match
-- (`private.person_invited_to_claim`). That vouch moves into its own table
-- before the invite goes, so deleting it can't cost anyone their claim.

-- ---------------------------------------------------------------------------
-- The vouch, outliving the invite
-- ---------------------------------------------------------------------------

-- In `private`, out of PostgREST's reach: a row here waives the name match,
-- so only `redeem_invite` may write one.
create table private.claim_vouches (
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, person_id)
);

insert into private.claim_vouches (user_id, person_id)
select accepted_by_user_id, person_id
from public.invites
where status = 'accepted'
  and accepted_by_user_id is not null
  and person_id is not null
on conflict do nothing;

create or replace function private.person_invited_to_claim(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.claim_vouches v
    where v.person_id = p_person_id
      and v.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Archiving
-- ---------------------------------------------------------------------------

alter table public.invites add column archived_at timestamptz;

comment on column public.invites.archived_at is
  'When the invite was archived for expiring unused. Set by /admin as it loads; an archived invite is already dead.';

create index invites_archived_at_idx on public.invites (archived_at)
  where archived_at is not null;

update public.invites
set archived_at = now()
where status = 'active'
  and expires_at is not null
  and expires_at <= now();

-- ---------------------------------------------------------------------------
-- redeem_invite: joining uses the invite up entirely
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(
  p_token text,
  p_display_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_invite public.invites;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if found then
    return v_profile;
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  v_email := private.current_email();

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  insert into public.profiles (auth_user_id, display_name, role, invited_by_user_id)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    v_invite.joins_as,
    v_invite.created_by
  )
  returning * into v_profile;

  -- Keep the invite's vouch for its entry before the invite goes.
  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;
  end if;

  -- The record first: its `invite_id` would only be nulled, leaving a
  -- nameless "Approved" row behind.
  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- The invites that already did their job
-- ---------------------------------------------------------------------------

delete from public.invite_requests r
using public.invites i
where r.invite_id = i.id
  and i.status = 'accepted';

delete from public.invites where status = 'accepted';
