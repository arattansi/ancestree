-- Step 28 — Raiya Suleman answers requests to start a tree too.
--
-- A second beta reviewer beside the build owner (20260923040000). She sees
-- "Requests to Start a Tree" on the admin console of any tree she runs, and,
-- like any reviewer, may start a tree herself without asking.

insert into private.beta_reviewers (email, note) values
  ('raiya.786@hotmail.com', 'Ancestree co-admin (Raiya Suleman)')
on conflict (email) do nothing;
