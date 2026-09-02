-- Migration drift fix: 20260901030000_canvas_interest_register re-declared
-- notifications_type_check without carrying forward the entry-comment and
-- verification types added in 20260830230000_entry_comments_and_verification.
--
-- Effect in production: private.entry_comment_notify() and
-- public.set_entry_verified() emit 'entry_commented' / 'entry_flagged' /
-- 'flag_resolved' / 'entry_verified', which the narrowed constraint rejects.
-- Because entry_comments_notify is an AFTER INSERT trigger with no exception
-- handling in private.notify(), the constraint violation rolls back the whole
-- comment/flag insert — so commenting on or flagging an entry fails outright,
-- and the entry's creator never hears about changes to entries they made.
--
-- Restore the full set of notification types.

alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'claim_approved',
      'claim_disputed',
      'claim_upheld',
      'claim_reversed',
      'canvas_interest',
      'entry_commented',
      'entry_flagged',
      'flag_resolved',
      'entry_verified'
    )
  );
