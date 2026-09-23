-- Step 30.8 — Whether an address is a member's, without minting anything.
--
-- `signInWithInvite` (lib/sign-in.server.ts) refuses an address that
-- already has a member profile, so an emailed invite never signs anyone in
-- to a live account. It found out by minting a sign-in token for the
-- address first (`auth.admin.generateLink`) and looking up the account it
-- belonged to. Minting stamps the account (`recovery_sent_at`), and Supabase
-- then refuses to email that address a sign-in link for a minute: the very
-- link the invite page now offers a member instead (`emailInviteSignInLink`),
-- asked for seconds later. This answers the question first, touching
-- nothing.
--
-- For the service role only: the address lives in auth.users, and the
-- answer must never reach a browser.

create or replace function public.address_has_profile(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.auth_user_id = u.id
    where lower(u.email) = lower(btrim(p_email))
      and u.deleted_at is null
  );
$$;

revoke all on function public.address_has_profile(text) from anon, authenticated, public;
grant execute on function public.address_has_profile(text) to service_role;
