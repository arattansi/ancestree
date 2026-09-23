-- Step 42 — A member can't make someone else's entry their own.
--
-- `authenticated` held INSERT and UPDATE on every column of `profiles`, and
-- `profiles_update` only asks that the row be the member's own. So a member
-- could point their own `self_person_id` at any entry, and everything that
-- asks "is this the person themselves" (`private.self_person_id()`) believed
-- it: `can_edit_person` let them edit it on any tree they're on, the
-- document rule and the photo and document storage policies let them read
-- its private documents and replace its photo on any tree at all, and
-- `profiles_seed_self_email` copied their address onto it. A signed-in
-- account with no profile yet could insert one naming any entry, and any
-- inviter. Found during Step 41.5.
--
-- Only these set the two links, all security definer: onboarding
-- (`add_people_with_connections`, and `claim_person_as_self` through
-- `private.claim_as_self`), "This is me" (`claim_person`), accepting an
-- invite (`redeem_invite`, which makes the profile and names the inviter,
-- and claims a claim invite's entry through `private.claim_as_self`),
-- `resolve_claim` reversing a claim, and `delete_tree`. `ensure_profile`
-- makes a profile with neither. The database clears them when the entry or
-- the inviter's profile is deleted (on delete set null). A member changes
-- only their name (`updateDisplayName`) and whether relatives can ask them
-- for an invite (`setRelativesCanAsk`, Step 41.5).
--
-- 1. The grants say so: a member updates those two columns of their own
--    row, and never inserts a profile.
-- 2. `profiles_guard` holds the links even if a grant comes back.

-- ---------------------------------------------------------------------------
-- 1. A member updates their name and whether relatives can ask, nothing else
-- ---------------------------------------------------------------------------
revoke insert, update on table public.profiles from anon, authenticated;
grant update (display_name, relatives_can_ask) on table public.profiles to authenticated;

-- Profiles are made by `redeem_invite` and `ensure_profile`.
drop policy if exists profiles_insert on public.profiles;

-- ---------------------------------------------------------------------------
-- 2. The links hold whatever the grants say
-- ---------------------------------------------------------------------------
-- Security invoker on purpose, unlike the other guards: `current_user` is
-- whoever makes the write. A member's own request runs as `authenticated`.
-- The RPCs above run as their owner, the service role as itself, and
-- `on delete set null` as the table's owner, so none of them is stopped.
-- `ancestree.privileged_profile_write` can't tell them apart: most of those
-- RPCs never set it, and `remove_tree_member` clears it before the profile
-- delete whose cascade clears `invited_by_user_id`.
create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'A profile is made by accepting an invite' using errcode = '42501';
  end if;
  if new.self_person_id is distinct from old.self_person_id then
    raise exception 'OWN_ENTRY: your own entry is set by adding yourself or claiming an entry'
      using errcode = '42501';
  end if;
  if new.invited_by_user_id is distinct from old.invited_by_user_id then
    raise exception 'Who invited a member is recorded when they join' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function private.profiles_guard();

comment on column public.profiles.self_person_id is
  'The member''s own entry. Set only by the onboarding, claim and invite RPCs, and cleared when the entry is deleted; never by the member (Step 42).';
comment on column public.profiles.invited_by_user_id is
  'Who invited this account, recorded by redeem_invite when the profile is made; never set by the member (Step 42).';
