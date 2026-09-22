# Pending migrations

Migrations that must wait for a deploy. They live outside `migrations/` so
`supabase db push` can't apply them early.

| File | Apply when |
|---|---|
| `20260922120000_drop_legacy_single_tree.sql` | The Step 25 code is live on production. Until then the deployed app reads `profiles.role` and drags `people.pos_*`, which Step 25 keeps mirrored. Move the file into `migrations/`, run `supabase db push --dry-run`, then push, then regenerate `lib/database.types.ts`. |
