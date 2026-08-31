-- Step 4.6 — soft layout offsets.
--
-- `pos_x` / `pos_y` pinned a card to an absolute canvas point, so one drag
-- froze that person forever and the auto-layout had to work around it. The
-- canvas now computes an anchored position for everybody and stores a drag as
-- a *delta* from that position, so a nudged card keeps its nudge while still
-- following the tree as relatives are added.
--
-- Legacy absolute pins are left in place and still honoured; the first drag of
-- a person converts them (the client clears `pos_x` / `pos_y` as it writes the
-- offset), and "Auto-arrange" clears both.

alter table public.people
  add column pos_dx numeric,
  add column pos_dy numeric;

comment on column public.people.pos_dx is
  'Horizontal nudge from the auto-layout position, in canvas units.';
comment on column public.people.pos_dy is
  'Vertical nudge from the auto-layout position, in canvas units.';
comment on column public.people.pos_x is
  'Deprecated absolute pin (pre Step 4.6). Honoured until the card is dragged.';
