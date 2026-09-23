-- Step 33 — Count a share-link view with one atomic update.
--
-- /shared/<token> records each view once the page has gone out
-- (lib/share-links.server.ts). The database adds the one, so two visitors
-- opening a link at once can't both write back the same count, as a
-- read-then-write from the server could.
--
-- It runs with the caller's rights: the server calls it with the service
-- role, which may already update any link. anon and members can't call it.

create or replace function public.record_share_link_view(p_link_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.share_links
  set view_count = view_count + 1,
      last_viewed_at = now()
  where id = p_link_id;
$$;

revoke all on function public.record_share_link_view(uuid) from anon, authenticated, public;
grant execute on function public.record_share_link_view(uuid) to service_role;
