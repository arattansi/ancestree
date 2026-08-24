# Ancestree

Invite-only, auth-required, collaborative family-tree web app. Relatives add
themselves and their connections into a shared, editable, canvas-style tree.

Product brief and build plan live in the **🌳 Ancestree** Notion teamspace.

## Tech stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui (base color: neutral)
- **Font**: Public Sans (`--font-sans`)
- **Backend**: Supabase (Auth / Postgres / Storage) — free tier
- **Hosting**: Vercel (Hobby) at `ancestree.space`
- **Tree UI**: React Flow (`@xyflow/react`) + dagre auto-layout (added in Step 6)

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `supabase db push` — apply local migrations to the linked remote project
- `supabase start` — local stack (requires Docker Desktop)

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + server
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never sent to the client
- `NEXT_PUBLIC_SITE_URL` — base URL for magic-link redirects and invite links

Until Supabase env is set, `middleware.ts` no-ops so the app still boots.

## Project structure

- `app/` — App Router pages (`/` landing, `/tree` canvas placeholder)
- `components/ui/` — shadcn primitives
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (session refresh)
- `lib/database.types.ts` — generated Supabase types (regenerate after schema changes)
- `supabase/` — local CLI project linked to `kkmemshpkxrzogijxgnb` (`Product-Ancestree`)

## Conventions

- shadcn primitives + semantic tokens only (no raw hex). Mobile-first, WCAG AA.
- All DB DDL via the Supabase MCP (`apply_migration`, sanity-checked with `execute_sql`).
- Every table RLS-scoped via `profiles.auth_user_id = auth.uid()`.
- Private storage buckets (`photos`, `documents`) served via signed URLs.
- Commit prefix: `Ancestree v1 (step/total): <subject>`.

## Data model

Applied on Product-Ancestree (`kkmemshpkxrzogijxgnb`). Local source of truth:
`supabase/migrations/`.

| Table | Purpose |
|---|---|
| `trees` | Multi-tree-ready container (v1 uses one shared tree) |
| `profiles` | `auth.users` row: `role` (`admin` \| `member`), `can_invite`, `self_person_id` |
| `people` | Demographic nodes; `owner_user_id` starts as `created_by` and moves on claim |
| `relationships` | Directed `parent` edges; undirected `spouse` pairs; siblings inferred |
| `invites` | Shareable tokens (`active` \| `accepted` \| `revoked`) |
| `claims` | Auto-approve / dispute / reject a person entry |
| `entry_comments` | Comments and flags (`open` \| `resolved`) |
| `documents` | Metadata for private file uploads |

**Checks:** `people` requires given **or** preferred name, family name, country of
birth, and `is_deceased` (NOT NULL). `lineage_type` is writable by admins only.

**RLS:** every public table. Members read rows in trees they belong to (admin,
tree creator, accepted invite, or `self_person`). Writes use
`profiles.auth_user_id = auth.uid()`. Person edits: owner (or admin). Deletes:
admin only.

**Storage:** private buckets `photos` and `documents`. Object path
`{tree_id}/{person_id}/{filename}`. Members can read via signed URLs; only the
entry owner/admin can write.

Helpers live in the unexposed `private` schema (`is_admin`, `is_tree_member`,
`can_edit_person`).

## Changelog

- **Step 2 — Data model, RLS & storage**: `supabase init` + link to
  Product-Ancestree; first migrations for all tables, RLS, and private
  `photos` / `documents` buckets; generated `lib/database.types.ts`.
- **Step 1 — Repo & infra bootstrap**: Next.js 16 + Tailwind v4 + shadcn/ui
  scaffold; Public Sans; Supabase client/server/middleware helpers (env-guarded);
  `.env.example`; landing page + `/tree` placeholder; this doc.
