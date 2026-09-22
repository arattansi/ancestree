# Pending migrations

Migrations that must wait for a deploy. They live outside `migrations/` so
`supabase db push` can't apply them early.

None right now. The last one, `20260922120000_drop_legacy_single_tree.sql`,
was applied on 2026-09-22 as
`migrations/20260923050000_drop_legacy_single_tree.sql`.

When a file here is ready:

1. Give it a version after the newest applied migration. Check
   `supabase_migrations.schema_migrations` as well as `migrations/`, since
   other sessions apply migrations before their files reach main. Keeping
   the original version would put it before migrations that landed while it
   waited, so `db push` would refuse it and a rebuild from scratch would run
   it out of order.
2. Re-check every function it replaces against the latest version of that
   function. Migrations written while it waited may have changed them too.
3. Move it into `migrations/`, apply it, then regenerate
   `lib/database.types.ts`.
