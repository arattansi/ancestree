-- Step 30.1 — Tell Roots and reviewers the moment someone asks.
--
-- A request to join a tree now emails that tree's Roots, and a request to
-- start one emails the beta reviewers (lib/request-alerts.server.ts). Their
-- addresses live where the app can't read them: a Root's in auth.users, a
-- reviewer's in private.beta_reviewers. Two lookups, for the service role
-- only, so no browser ever sees an address:
--
-- 1. `tree_root_emails(tree)` — the sign-in address of every Root of a tree.
-- 2. `beta_reviewer_emails()` — every beta reviewer who runs a tree. The
--    queue lives on an admin console, so one who runs none couldn't answer
--    from the email's link; the header counts the queue only for those who
--    run a tree, too.

create or replace function public.tree_root_emails(p_tree_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct lower(u.email)
  from public.tree_members m
  join auth.users u on u.id = m.user_id
  where m.tree_id = p_tree_id
    and m.role = 'admin'
    and u.deleted_at is null
    and coalesce(u.email, '') <> '';
$$;

revoke all on function public.tree_root_emails(uuid) from anon, authenticated, public;
grant execute on function public.tree_root_emails(uuid) to service_role;

create or replace function public.beta_reviewer_emails()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct lower(u.email)
  from private.beta_reviewers r
  join auth.users u on lower(u.email) = lower(r.email)
  where u.deleted_at is null
    and exists (
      select 1 from public.tree_members m
      where m.user_id = u.id and m.role = 'admin'
    );
$$;

revoke all on function public.beta_reviewer_emails() from anon, authenticated, public;
grant execute on function public.beta_reviewer_emails() to service_role;
