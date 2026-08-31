-- Step 11.1 — Marriage/divorce fields + connection_suggestions table
--
-- 1. `relationships` gains optional marriage/divorce tracking. These columns
--    only ever carry data on `type = 'spouse'` rows; parent-child rows keep
--    them NULL / false (enforced by a CHECK).
-- 2. New `connection_suggestions` table records implied-connection prompts the
--    add-person flow surfaces, with a UNIQUE key that guarantees a given
--    (subject, related, type, source) is never re-prompted once resolved.
--
-- Down script (for the PR description — not run here):
--   drop table public.connection_suggestions;
--   alter table public.relationships
--     drop constraint relationships_divorce_requires_flag,
--     drop constraint relationships_divorce_after_marriage,
--     drop constraint relationships_marriage_fields_spouse_only,
--     drop column marriage_date, drop column is_divorced, drop column divorce_date;

-- ---------------------------------------------------------------------------
-- 1. Marriage / divorce on spouse relationships
-- ---------------------------------------------------------------------------

alter table public.relationships
  add column marriage_date date,
  add column is_divorced boolean not null default false,
  add column divorce_date date;

-- A divorce date is only meaningful once the pair is marked divorced.
alter table public.relationships
  add constraint relationships_divorce_requires_flag
  check (divorce_date is null or is_divorced = true);

-- If both dates are known, the divorce cannot predate the marriage.
alter table public.relationships
  add constraint relationships_divorce_after_marriage
  check (
    marriage_date is null
    or divorce_date is null
    or divorce_date >= marriage_date
  );

-- Marriage/divorce data belongs only on spouse rows.
alter table public.relationships
  add constraint relationships_marriage_fields_spouse_only
  check (
    type = 'spouse'
    or (marriage_date is null and divorce_date is null and is_divorced = false)
  );

-- ---------------------------------------------------------------------------
-- 2. connection_suggestions
-- ---------------------------------------------------------------------------

create table public.connection_suggestions (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  subject_person_id uuid not null references public.people (id) on delete cascade,
  related_person_id uuid not null references public.people (id) on delete cascade,
  suggested_type text not null
    check (suggested_type in ('spouse', 'parent', 'sibling_check')),
  source text not null
    check (source in ('co_parent', 'unlinked_spouse_child', 'name_dob_match')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  created_by uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  resolved_by uuid references public.profiles (auth_user_id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint connection_suggestions_distinct_people
    check (subject_person_id <> related_person_id),
  -- The no-reprompt guarantee: one row per (pair, type, source), any status.
  constraint connection_suggestions_unique_key
    unique (subject_person_id, related_person_id, suggested_type, source)
);

create index connection_suggestions_tree_pending_idx
  on public.connection_suggestions (tree_id)
  where status = 'pending';
create index connection_suggestions_subject_idx
  on public.connection_suggestions (subject_person_id);
create index connection_suggestions_related_idx
  on public.connection_suggestions (related_person_id);

alter table public.connection_suggestions enable row level security;

-- Read: any member of the tree the suggestion belongs to.
create policy connection_suggestions_select on public.connection_suggestions
  for select to authenticated
  using ((select private.is_tree_member(tree_id)));

-- Insert: a member of the tree, as themselves.
create policy connection_suggestions_insert on public.connection_suggestions
  for insert to authenticated
  with check (
    (select private.is_tree_member(tree_id))
    and created_by = (select auth.uid())
  );

-- Update (resolving): the suggestion's original creator, or a tree admin.
create policy connection_suggestions_update on public.connection_suggestions
  for update to authenticated
  using (
    (select private.is_admin())
    or created_by = (select auth.uid())
  )
  with check (
    (select private.is_admin())
    or created_by = (select auth.uid())
  );

revoke all on table public.connection_suggestions from anon, public;
grant select, insert, update on table public.connection_suggestions to authenticated;
