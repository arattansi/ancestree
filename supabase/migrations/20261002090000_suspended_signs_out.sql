-- Step 103.4 follow-up: a suspended account is signed out at once (Aalim:
-- "make suspend sign them out immediately"). Suspending bans the account
-- in Supabase Auth, which stops new sign-ins and token refreshes, but the
-- app checks a session's token locally (Step 61), so an open session lasted
-- until its token lapsed. The app now reads this alongside the member's own
-- profile, a computed field on the query every page and action already
-- makes (`select *, suspended`), and signs a suspended account out.
--
-- It answers only for the caller's own profile: anyone else's reads false.
create or replace function public.suspended(p public.profiles)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.auth_user_id = (select auth.uid())
    and exists (
      select 1 from auth.users u
      where u.id = p.auth_user_id and u.banned_until > now()
    );
$$;

revoke all on function public.suspended(public.profiles) from public, anon;
grant execute on function public.suspended(public.profiles) to authenticated;
