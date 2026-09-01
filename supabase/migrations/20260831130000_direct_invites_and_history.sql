-- Step 13 — Direct invites + invite history
--
-- 1. `source` distinguishes a public ask (`request`, the existing flow) from
--    an admin sending an invite straight to someone they already know
--    (`direct`, new). Both flow through the same invite_requests row so a
--    single query gives the admin a full history of every invite that has
--    gone out, however it started.
-- 2. `email_sent` records whether the branded email actually left the
--    building — best-effort delivery is not the same as a bounce, but it
--    tells the admin "the app tried" vs "you still need to copy this link".
-- 3. Admins can now INSERT directly (source = 'direct'), not just
--    UPDATE/SELECT/DELETE existing rows.

alter table public.invite_requests
  add column source text not null default 'request'
    check (source in ('request', 'direct')),
  add column email_sent boolean;

create policy invite_requests_insert on public.invite_requests
  for insert to authenticated
  with check ((select private.is_admin()));
