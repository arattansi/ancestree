-- Step 103.4 follow-up: a suspended account is refused by the database
-- itself (Aalim: "close the direct-database gap too"). The app already
-- signs one out at its next page or action (20261002090000), but its
-- access token still checks out until it lapses, so whoever holds it could
-- call the Data API, Storage or Realtime directly for up to an hour.
--
-- - Data API (tables, views, RPCs, GraphQL): PostgREST runs
--   `public.refuse_suspended()` before every request, which raises for a
--   suspended caller. In `public` because PostgREST calls it as the
--   request's role, and anon has no usage on `private`.
-- - Storage: a restrictive policy on `storage.objects`, so no upload,
--   download, signed URL or delete.
-- - Realtime: a restrictive policy on `realtime.messages`, so no joining a
--   tree's room.
--
-- The app's computed field (`public.suspended`) goes once the code that
-- reads the refusal instead is deployed (20261002110000).

create or replace function private.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid()) and u.banned_until > now()
  );
$$;

revoke all on function private.is_suspended() from public, anon;
grant execute on function private.is_suspended() to authenticated, service_role;

create or replace function public.refuse_suspended()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and private.is_suspended() then
    raise exception 'ACCOUNT_SUSPENDED'
      using errcode = '42501', hint = 'This account is suspended.';
  end if;
end;
$$;

revoke all on function public.refuse_suspended() from public;
grant execute on function public.refuse_suspended() to anon, authenticated, service_role;

create policy suspended_refused on storage.objects
  as restrictive for all to authenticated
  using (not (select private.is_suspended()))
  with check (not (select private.is_suspended()));

create policy suspended_refused on realtime.messages
  as restrictive for all to authenticated
  using (not (select private.is_suspended()))
  with check (not (select private.is_suspended()));

alter role authenticator set pgrst.db_pre_request = 'public.refuse_suspended';
notify pgrst, 'reload config';
