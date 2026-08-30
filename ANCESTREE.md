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
- **GitHub**: https://github.com/arattansi/ancestree
- **Supabase project**: `Product-Ancestree` (`kkmemshpkxrzogijxgnb`, ca-central-1, Free)
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

Until Supabase env is set, `proxy.ts` no-ops so the app still boots. With env
set, unauthenticated visits to `/tree` redirect to `/join`.

## Project structure

- `app/` — App Router pages: `/` landing, `/join` (+ `/join/[token]` invite accept),
  `/auth/callback` (magic-link handler) + `/auth/auth-code-error`, `/onboarding`
  (first-run self entry), `/tree` (authed placeholder), `/account`, `/admin`
  (admin-only)
- `app/actions/` — server actions (`auth.ts`: magic link + sign out;
  `invites.ts`: mint invite link, grant/revoke `can_invite`;
  `people.ts`: create/update person, photo + document writes, signed URLs)
- `components/ui/` — shadcn primitives (incl. `form` = react-hook-form + zod)
- `components/person-form.tsx` — reusable PersonForm; `components/person-documents.tsx`
- `lib/person-schema.ts` — shared zod schema; `lib/image.ts` — client-side photo downscale
- `lib/auth.ts` — `getUser` / `getProfile` / `requireProfile` / `requireSelfPerson` / `requireAdmin` (server-only)
- `lib/site-url.ts` — `getSiteUrl()` for magic-link redirects and invite links
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (session refresh), `admin.ts` (service role, server-only)
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

## Auth & invites (Step 3)

- **Magic-link only** (`supabase.auth.signInWithOtp`). `proxy.ts` redirects
  unauthenticated visits to protected routes → `/join`; authenticated users
  without a member profile → `/join?status=pending`.
- **`/auth/callback`** exchanges the code (or verifies the OTP hash), then either
  `redeem_invite(token)` (invite flow) or `ensure_profile()` (admin bootstrap).
- **Invite tokens** (`public.invites`): `can_invite` members + admins mint a
  single-use, 14-day link `"/join/<token>"` by inserting a row directly under RLS
  (`can_invite_to_tree`). `redeem_invite` (SECURITY DEFINER) creates the member
  `profiles` row with `invited_by_user_id = invite.created_by` and flips the
  invite to `accepted`. `invite_preview(token)` is the only pre-auth RPC.
- **Admin bootstrap**: `private.admin_allowlist(email)` — seeded with both
  co-admins (Aalim Rattansi, Raiya Suleman). First login by an
  allowlisted email runs `ensure_profile`, which creates the single shared
  `trees` row and an `admin` / `can_invite` profile. Non-allowlisted users
  without an invite get `needs_invite`.
- **`profiles_protect_role`** trigger still pins role/`can_invite` for
  non-admins; the SECURITY DEFINER helpers set a `LOCAL`
  `ancestree.privileged_profile_write` GUC to bypass it during bootstrap only.
- **`public.member_directory`** view (`security_invoker`) = profiles + resolved
  `invited_by_name`; drives `/admin` and `/account`.

**Supabase dashboard config (do once):** Authentication → URL Configuration →
Site URL `https://ancestree.space`; Redirect URLs allowlist
`http://localhost:3000/**`, `https://ancestree.space/**`,
`https://*-arattansi.vercel.app/**`. Email provider = built-in for now (free
tier ~3–4/hour) — swap to an SMTP provider before wider testing.

## Changelog

- **Step 4 — Person form & onboarding**: reusable `PersonForm` (shadcn Form +
  zod, `lib/person-schema.ts`); required = (given|preferred) + family +
  country_of_birth + explicit `is_deceased`; death fields revealed on the
  Deceased checkbox; admin-only Lineage select. Client-side photo
  downscale (`lib/image.ts`) → `photos` bucket; multi-file Documents section
  (`person-documents.tsx`) → `documents` bucket with signed-URL download +
  remove. First-run onboarding at `/onboarding` (guarded by
  `requireSelfPerson`) creates the member's own person via the
  `create_self_person` SECURITY DEFINER RPC (migration `20260830200539`) which
  also sets `profiles.self_person_id`. `next.config.ts` allows the Supabase
  Storage image host.
- **Step 3 — Auth & invite system**: magic-link auth + invite-gated
  registration; `redeem_invite` / `ensure_profile` / `invite_preview` RPCs +
  `admin_allowlist` bootstrap (both co-admins seeded) + `member_directory` view
  (migrations `20260830192758`, `20260830192832`, `20260830194512`); `/join`, `/join/[token]`,
  `/auth/callback`, `/account`, `/admin`; `lib/auth.ts`, `lib/site-url.ts`,
  `app/actions/{auth,invites}.ts`; auth-aware `SiteHeader`.
- **Step 2 — Data model, RLS & storage**: `supabase init` + link to
  Product-Ancestree; first migrations for all tables, RLS, and private
  `photos` / `documents` buckets; generated `lib/database.types.ts`.
- **Step 1 — Repo & infra bootstrap**: Next.js 16 + Tailwind v4 + shadcn/ui
  scaffold; Public Sans; Supabase client/server/middleware/admin helpers
  (env-guarded); `.env.example`; landing + `/tree` placeholder + `/join`;
  GitHub repo `arattansi/ancestree`; Product-Ancestree (`kkmemshpkxrzogijxgnb`);
  Vercel Hobby project `ancestree` (`prj_tfdWlxVA1Wu6tbiLquXMjso5wTap`) +
  `ancestree.space` / `www.ancestree.space`; this doc.

**Step 1 infra notes:** `SUPABASE_SERVICE_ROLE_KEY` is server-only. Set it in
`.env.local` and Vercel from Supabase Project Settings → API (service_role).
Do not commit it. Preview env vars may need a git branch in this CLI version.
