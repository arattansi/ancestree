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
- `lib/database.types.ts` — generated Supabase types (placeholder until Step 2)

## Conventions

- shadcn primitives + semantic tokens only (no raw hex). Mobile-first, WCAG AA.
- All DB DDL via the Supabase MCP (`apply_migration`, sanity-checked with `execute_sql`).
- Every table RLS-scoped via `profiles.auth_user_id = auth.uid()`.
- Private storage buckets (`photos`, `documents`) served via signed URLs.
- Commit prefix: `Ancestree v1 (step/total): <subject>`.

## Data model (target — built in Step 2)

`trees`, `profiles`, `people`, `relationships` (parent | spouse), `invites`,
`claims`, `entry_comments`, `documents`. See the Notion Product Brief for the
full ERD and field list.

## Changelog

- **Step 1 — Repo & infra bootstrap**: Next.js 16 + Tailwind v4 + shadcn/ui
  scaffold; Public Sans; Supabase client/server/middleware helpers (env-guarded);
  `.env.example`; landing page + `/tree` placeholder; this doc.
