-- Step 202.4: a member with no email adds one later.
--
-- Someone who joined without an email (Step 202.2) can add one in their
-- account: a 6-digit code goes to it, and entering it makes it their
-- account's address. From then on they're an ordinary member: they sign in
-- with codes, get the emails members get, and sign-in links (Step 202.3)
-- no longer work for them (`spend_sign_in_link` wants no email).
--
-- Not Supabase's own email change: the hosted project confirms a change on
-- the old address as well as the new, and theirs reads nothing. The app
-- makes the code and sends it; only its hash is kept here, and the service
-- role alone reaches these functions, so a member can't read a code back.

create table private.email_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  code_hash text not null,
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  attempts integer not null default 0
);

-- A code is checked against at most this many tries.
create or replace function private.email_claim_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 5;
$$;

-- The address a no-email account asks to add, with the code the app made
-- for it (hashed with the account's id). One a minute; a new one replaces
-- the last. Refused for an account that has an email, or an address that
-- is already someone's.
create or replace function public.begin_add_email(p_user uuid, p_email text, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if not exists (
    select 1 from auth.users u where u.id = p_user and private.is_no_email(u.email)
  ) then
    raise exception 'HAS_EMAIL: this account has an email already' using errcode = '22023';
  end if;
  if v_email = '' or private.is_no_email(v_email) then
    raise exception 'INVALID_EMAIL: not an address' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'EMAIL_TAKEN: that address has an account' using errcode = '23505';
  end if;
  if exists (
    select 1 from private.email_claims c
    where c.user_id = p_user and c.sent_at > now() - interval '1 minute'
  ) then
    raise exception 'TOO_SOON: a code went a moment ago' using errcode = '22023';
  end if;

  insert into private.email_claims (user_id, email, code_hash)
  values (p_user, v_email, encode(extensions.digest(p_user::text || ':' || p_code, 'sha256'), 'hex'))
  on conflict (user_id) do update
    set email = excluded.email,
        code_hash = excluded.code_hash,
        sent_at = now(),
        expires_at = now() + interval '1 hour',
        attempts = 0;
end;
$$;

revoke all on function public.begin_add_email(uuid, text, text) from anon, authenticated, public;
grant execute on function public.begin_add_email(uuid, text, text) to service_role;

-- The code entered: the address it was for when it's right, `null` when
-- it isn't (a wrong try is counted, so this answers rather than raising).
-- Run out — an hour gone, or five wrong tries — it's refused.
create or replace function public.confirm_add_email(p_user uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim private.email_claims;
begin
  select * into v_claim from private.email_claims c where c.user_id = p_user for update;
  if not found or v_claim.expires_at <= now()
     or v_claim.attempts >= private.email_claim_attempts() then
    raise exception 'CODE_EXPIRED: send a new code' using errcode = '22023';
  end if;
  if v_claim.code_hash
     <> encode(extensions.digest(p_user::text || ':' || btrim(p_code), 'sha256'), 'hex') then
    update private.email_claims set attempts = attempts + 1 where user_id = p_user;
    return null;
  end if;
  delete from private.email_claims where user_id = p_user;
  return v_claim.email;
end;
$$;

revoke all on function public.confirm_add_email(uuid, text) from anon, authenticated, public;
grant execute on function public.confirm_add_email(uuid, text) to service_role;
