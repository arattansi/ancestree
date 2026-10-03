-- Step 119: anyone can start a tree.
--
-- Aalim asked (2026-10-03): "turn off the waitlist and remove beta tag
-- from 'start a tree' on home page. just let users start using ancestree".
--
--   * `private.may_found_tree()`: anyone signed in may found a tree, no
--     request or approval (Step 28 asked a beta reviewer first). Still one
--     founded tree each (`private.found_tree_for`). So `found_tree` no
--     longer refuses with TREE_REQUEST_NEEDED, and `my_tree_request` says
--     `approved` to anyone who hasn't founded one: their "start a tree" is
--     a link to naming it.
--   * Someone signed out signs up through the home page's own campaign link
--     (Step 103.3's open sign-up, which starts their tree at once): code
--     `df9590fa4260`, "Home page". Its opens, sign-ups and trees show on
--     /admin with the other links, and pausing it there closes sign-ups
--     from the home page.

create or replace function private.may_found_tree()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null;
$$;

insert into public.campaigns (code, name, placement)
values ('df9590fa4260', 'Home page', 'start a tree, on the home page and in join a tree')
on conflict (code) do nothing;
