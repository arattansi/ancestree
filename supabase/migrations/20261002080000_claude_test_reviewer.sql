-- A standing test reviewer for Claude's browser checks of the admin page
-- (Aalim's yes, 2026-10-02). Resend's test inbox, so no mail reaches a
-- person; signed in only with a service-role magic link. It runs no tree,
-- so it gets no alert of a request to start a tree.

insert into private.beta_reviewers (email, note) values
  ('delivered+claude-reviewer@resend.dev', 'Claude''s test reviewer, for admin page checks')
on conflict (email) do nothing;
