-- Step 73 — Dismiss a declined suggestion from the card
--
-- Aalim asked to "let the suggester dismiss a declined suggestion from the
-- card". Since Step 72 the entry's card lists a suggester's own declined
-- suggestions. Dismissing one takes it off their card, and off the form's
-- "Your last suggestion was declined." hint (Step 71), and changes nothing
-- for anyone else. It isn't deleted: the notices of those who were asked
-- point at it (`notifications.suggestion_id`, on delete cascade), and it
-- stays the record of what was suggested and declined.
--
-- 1. `entry_suggestions.dismissed_at`: when its suggester dismissed it, only
--    ever on a declined suggestion.
-- 2. The suggester may set it on their own declined suggestions, and set
--    nothing else: a column grant, and an update policy held to their own
--    rows that are declined. Everything else still goes through the
--    functions, and nobody else may update a suggestion at all.

-- 1. Dismissed from the suggester's card.
alter table public.entry_suggestions
  add column dismissed_at timestamptz,
  add constraint entry_suggestions_dismissed
    check (dismissed_at is null or status = 'declined');

-- 2. Theirs to dismiss.
grant update (dismissed_at) on table public.entry_suggestions to authenticated;

create policy entry_suggestions_dismiss on public.entry_suggestions
  for update to authenticated
  using (suggested_by = (select auth.uid()) and status = 'declined')
  with check (suggested_by = (select auth.uid()) and status = 'declined');
