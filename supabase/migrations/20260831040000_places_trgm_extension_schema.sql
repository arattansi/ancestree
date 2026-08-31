-- Move pg_trgm out of `public` (Supabase linter 0014 — extension_in_public) so
-- it sits alongside the other extensions. `extensions` is on the search_path for
-- postgres/anon/authenticated/service_role, so the existing gin_trgm_ops indexes
-- on public.places (and the app's ILIKE / % queries) keep working unchanged.
alter extension pg_trgm set schema extensions;
