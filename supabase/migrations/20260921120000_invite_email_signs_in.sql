-- An emailed invite is now the recipient's sign-in link.
--
-- Until now an invite emailed to someone led to a page that asked for their
-- address and mailed a *second* link to actually sign in. Reaching the inbox
-- the invite was sent to proves exactly what that second email proved, so
-- accepting an invite with `invited_email` set now creates the account for
-- that address and signs the browser in on the spot (`signInWithInvite` in
-- lib/sign-in.server.ts — it refuses an address that is already a member).
--
-- That makes `invited_email` load-bearing: whoever holds the token becomes
-- that address. So binding an invite to an address is reserved for Roots and
-- for server-side writes (the service role, after the app has checked the
-- inviter may invite and without ever showing them the token). Anyone else
-- who may mint invites through RLS gets a bare link, which still asks for an
-- address and verifies it by email.

comment on column public.invites.invited_email is
  'Who the link was emailed to. Accepting the invite signs this address in, so only a Root or the service role may set it (invites_guard). Null for a bare link.';

create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Roots, and server-side writes with no signed-in user (the service role).
  if (select auth.uid()) is null or private.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Clearing `person_id` is allowed: it is how the entry's deletion reaches
    -- here (on delete set null), and it can only narrow the invite.
    if new.joins_as is distinct from old.joins_as
       or (new.person_id is not null
           and new.person_id is distinct from old.person_id) then
      raise exception 'Only a Root can change what an invite joins as, or whose entry it is for'
        using errcode = '42501';
    end if;
    -- Clearing the address only turns it back into a bare link.
    if new.invited_email is not null
       and new.invited_email is distinct from old.invited_email then
      raise exception 'Only a Root can change who an invite signs in'
        using errcode = '42501';
    end if;
  elsif new.person_id is not null then
    raise exception 'Only a Root can invite someone to claim a particular entry'
      using errcode = '42501';
  elsif new.invited_email is not null then
    raise exception 'Only a Root can bind an invite to an email address'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
