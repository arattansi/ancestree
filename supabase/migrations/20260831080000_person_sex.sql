-- Add an optional sex selector to people: Male / Female / Prefer not to
-- disclose. Nullable so existing rows stay untouched (backfilled by hand).
alter table public.people
  add column if not exists sex text
    check (sex in ('male', 'female', 'undisclosed'));

comment on column public.people.sex is
  'Optional self-reported sex: male | female | undisclosed. Null = not set.';
