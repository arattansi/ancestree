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
- **Tree UI**: React Flow (`@xyflow/react`) + a purpose-built anchored auto-layout
  (Step 6; replaced dagre in Step 4.6)

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
  (first-run: fuzzy name search → claim your entry, else self entry +
  connect), `/people/new` (add a connected relative),
  `/people/[id]/edit` (owner/creator/admin entry edit), `/tree` (React Flow
  canvas), `/account` (profile + in-app notifications + delete-account),
  `/admin` (admin-only: overview stats + members + invite requests + disputes +
  JSON export + view-only share links), `/request-invite` (public: ask an admin
  for an invite), `/shared/[token]` (public: read-only tree canvas behind an
  admin-minted share link, with a "request edit access" CTA), `/privacy`
  (public PIPEDA-minded privacy notice), `/trees/new` (Step 9 seam, flagged)
- `app/actions/` — server actions (`auth.ts`: magic link (+ consent gate) +
  sign out; `privacy.ts`: `exportTreeData` (admin JSON export) / `deletePerson`
  (admin erasure + storage cleanup) / `deleteAccount` (self-serve, reassigns
  contributions to a founding admin);
  `trees.ts`: `startOwnTree` (Step 9 multi-tree seam);
  `invites.ts`: mint invite link, `sendDirectInvites` (bulk name+email
  invites), `sendClaimInvite` (invite someone to claim one entry);
  `invite-requests.ts`: `requestInvite` (public, service-role write) /
  `approveInviteRequest` (mints the link) / `declineInviteRequest`;
  `people.ts`: `addPeopleWithConnections` (transactional multi-person + edge
  create), update person, drag-to-pin position, photo + document writes,
  signed URLs; `claims.ts`: `claimPerson` / `disputeClaim` / `resolveClaim` /
  `markNotificationsRead`; `entry-comments.ts`: `getEntryComments` /
  `addEntryComment` / `resolveEntryFlag` / `setEntryVerified`)
- `components/tree/` — `family-tree.tsx` React Flow canvas (generation lanes
  behind the cards; a child's descent line starts from a junction *derived from
  its parents' live positions* — not a node — so it follows them as they are
  dragged, and all of a couple's children bend at a shared horizontal bus, so a
  marriage shows one trunk rather than one line per parent; admin
  "Auto-arrange" clears every manual nudge), `person-node.tsx`
  custom node (name, then `née` maiden name / birth year / birthplace;
  open-flag badge + verified `✓`), `person-panel.tsx` detail Sheet
  (edit link + claim / dispute + admin verify), `entry-comments.tsx` (comment /
  flag thread + resolve), `claim-suggestions.tsx` "Is this you?" canvas prompt
- `components/tree/pet-node.tsx` — the companion chip (a third the height of a
  person card, a pill, led by a species glyph, joined by a dotted lead) +
  `pet-panel.tsx` (name / animal / years / optional full birthday + a GeoNames
  place of birth, the same picker a person uses / photo / who it belongs to /
  a plain comment thread),
  `pet-comments.tsx` (`pet_comments` — comments only, no flags / resolve /
  verify / notifications; `lib/pet-comments.ts` + `app/actions/pet-comments.ts`),
  `companion-fields.tsx`, `companion-picker.tsx` (multi-select
  people), `add-companion-dialog.tsx` (opened from a person's panel);
  `lib/pet-schema.ts` (pure zod + species labels; `birth_date` implies
  `year_born`), `lib/pet-layout.ts` — pets
  are laid out **after** the humans, hung in the gap below their companions and
  swept apart on a row (`.test.ts`); `lib/pets.ts` — `getTreePets`;
  `app/actions/pets.ts` — add / update / link / unlink / remove / photo /
  position. Pets are read separately from `getTreeGraph` so nothing in the
  layout, bloodline, generation, or claim code ever sees one
- `components/notifications-list.tsx` (account) + `admin-disputed-claims.tsx`
  (admin uphold / reverse); `lib/claims.ts` — claim candidates, notifications,
  disputed-claim queries; `lib/entry-comments.ts` — comment/flag thread reads
- `components/ui/` — shadcn primitives (incl. `form` = react-hook-form + zod)
- `components/person-fields.tsx` — shared demographic fieldset; `person-form.tsx` —
  edit an existing entry; `add-person-flow.tsx` — self / relative add with chain
  connect; `relationship-picker.tsx` — search-select an existing member;
  `place-autocomplete.tsx` — `places`-backed birth/death location picker
  (+ admin "add a place"); `components/person-documents.tsx`
- `lib/places.ts` — server-only `searchPlaces` / `getPlacesByIds` /
  `formatPlaceLabel`; `lib/country-names.ts` — `countryName` (ISO→name) +
  `ALPHA2`; `app/actions/places.ts` — `searchPlacesAction` / `requestNewPlace`
  (admin) / `listCountryOptions`; `lib/historical-names.ts` — pure
  `resolveHistoricalName` / `formatHistoricalPlace` (Step 4.5d, `.test.ts`)
- `lib/person-schema.ts` — shared zod schema; `lib/connections.ts` — chain/edge
  types + `buildChainEdges`; `lib/connection-suggestions.ts` — implied-connection
  detection engine (+ `.server.ts` loader, `.test.ts`); `lib/siblings.ts` — sibling inference; `lib/tree.ts` —
  shared-tree + member lookups + `getTreeGraph` (canvas data);
  `lib/tree-layout.ts` — the anchored auto-layout engine (Step 4.6, `.test.ts`):
  generations relative to the founding admins fix `y`, the anchor couple is
  translated to the origin, each admin's bloodline is pushed to its own side of
  it, median sweeps cut edge crossings, and a separation sweep guarantees a
  minimum gap between cards. Couple partners sit side by side eldest-left and a
  sibling set runs oldest→youngest. Also emits generation bands and per-couple
  descent points (`descentGeometry`, shared with the canvas so the drawn line
  and the laid-out one follow one rule); `lib/person-name.ts` — display
  name + lifespan + initials; `lib/image.ts` — client-side photo downscale;
  `lib/flags.ts` — build-time feature flags (`multiTreeEnabled`)
- `components/start-tree-form.tsx` — Step 9 "start your own tree" form;
  `components/ui/skeleton.tsx` + `app/{tree,admin,account}/loading.tsx` skeletons
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
| `profiles` | `auth.users` row: `role` (`admin` \| `branch_admin` \| `member` \| `leaf` — shown as Root / Branch / Canopy / Leaf, see **Account types**), `self_person_id` |
| `people` | Demographic nodes; `owner_user_id` starts as `created_by` and moves on claim. `date_of_birth_precision` / `date_of_death_precision` (`day` \| `month` \| `year`, Step 17) say how much of each date is known — a partial date is stored on the first day of its period, CHECK-enforced, so year-only readers need no change. `place_id_birth` / `place_id_death` → `places(id)` (Step 4.5b; nullable, backfilled — legacy `city_of_birth` / `country_of_birth` / `place_of_death` text kept until reconciled) |
| `relationships` | Directed `parent` edges; undirected `spouse` pairs (optional `marriage_date` / `is_divorced` / `divorce_date`, spouse-only by CHECK); siblings inferred |
| `connection_suggestions` | Implied-connection prompts surfaced by the add-person flow (`suggested_type` spouse/parent/sibling_check, `source`, `status` pending/accepted/dismissed); UNIQUE (subject, related, type, source) = no re-prompt |
| `invites` | Shareable tokens (`active` \| `accepted` \| `revoked`) |
| `invite_requests` | Public invite asks — first/last name + email, `pending` \| `approved` \| `declined`, `invite_id` of the link minted on approval. Admin-only RLS; inserted server-side with the service role (no `anon` grant). One pending row per email |
| `claims` | Auto-approve / dispute / reject a person entry (`dispute_reason`, `resolved_by`) |
| `notifications` | In-app notices (`claim_*`, `entry_commented` \| `entry_flagged` \| `flag_resolved` \| `entry_verified`); recipient-scoped RLS |
| `entry_comments` | Comments and flags (`is_flag`, `open` \| `resolved`, `resolved_by`) |
| `documents` | Metadata for private file uploads |
| `places` | GeoNames reference data (populated places + admin areas) for birthplace autocomplete; not tree-scoped — read by any member, written only by the import script |
| `historical_names` | Curated period names for a place/country over a date range (Step 4.5d); matched by `place_id` then `country_code` against a birth/death year. Read by any member; seeded by migration |
| `tree_bridges` | Step 9 seam: links a member's own `trees` row to a tree they belong to via a spouse bridge (feature-flagged; second tree not rendered) |
| `pets` | Companion animals — a deliberately thin, non-human entry: name, species (`cat` / `dog` / `other` + `species_label`), `year_born` / `year_died`, an optional exact `birth_date` (must agree with `year_born`) and an optional GeoNames place of birth (`place_id_birth` FK + denormalised `city_of_birth` / `country_of_birth`, exactly like a person), photo, and a `pos_dx` / `pos_dy` nudge. No lineage, claims, documents, or verification |
| `pet_companions` | Which people a pet lived with (`pet_id` + `person_id`). Many-to-many, undirected, no lineage meaning; a trigger deletes a pet once its last companion goes |
| `pet_comments` | A plain comment thread on a companion (`pet_id`, `body`, `created_by`). No flags, no open/resolved lifecycle, no verification, no notifications; author or anyone who `can_edit_pet` may delete |

**Checks:** `people` requires first **or** preferred name, last name, and
`is_deceased` (NOT NULL). The form now requires a **`place_id_birth`** (GeoNames
`places` FK, Step 4.5c) rather than free-text country; `city_of_birth` /
`country_of_birth` are still written (derived from the picked place). `lineage_type` is writable by admins only.
`middle_name` and `maiden_name` are optional nullable text columns, visible to and
editable by any member who can already edit the entry.

**Companions (pets):** a pet is never a child and never a relative. It lives
outside `people` / `relationships` so the layout engine, bloodline gate, claim
system, and generation bands never have to special-case an animal; on the
canvas it is a small pill in the row gap below its companions, joined to each
of them by a dotted lead. Editable by an admin, whoever added it, or anyone who
can already edit one of its people (`private.can_edit_pet`) — looser than a
person entry, whose deletes are admin-only, because a pet carries no ownership
or claim weight. Photos share the `photos` bucket under
`{tree_id}/pets/{pet_id}/{filename}`. Its panel does carry three warm extras —
an optional full birthday, a GeoNames place of birth (the same `PlaceAutocomplete`
a person entry uses, but optional), and a plain `pet_comments` thread (no flags,
resolve, or notifications) — none of which touch the chip or its dimensions.

**RLS:** every public table. Members read rows in trees they belong to (admin,
tree creator, accepted invite, or `self_person`). Writes use
`profiles.auth_user_id = auth.uid()`. Person edits (`private.can_edit_person`):
current `owner_user_id`, an admin, the original `created_by` while the entry is
still unclaimed (owner unchanged, no approved claim), **or** a branch admin
anywhere on their own branch (Step 17). A Leaf (Step 18) gets none of that:
only their own `self_person_id` entry. Deletes: admin only. A claim moves
`owner_user_id` to the claimant, so the creator then loses edit rights until an
admin reverses the claim.

**Branches (Step 17, re-anchored in 18.1):** a `branch_admin` curates one
Root's side of the tree. A branch is measured from one person by the same
up-then-down walk as the bloodline gate (`private.branch_ids`): climb `parent`
edges to every ancestor, descend from that whole set, then add the partners
those people married — one step, never walked through. So a spouse is on the
branch and a spouse's parents are not. A Branch tends the branch of **the Root
they are related to** — every Root whose branch has the Branch's own entry on
it, by blood or marriage (`private.root_person_ids` → `private.own_branch_ids`;
`lib/branch.ts#branchReach`). Related to both Roots (their child), they tend
both sides; related to none, they tend nothing and edit like Canopy. Until
18.1 the walk started from the Branch's own entry, which left out the Root's
other grandparents' families and let in the Branch's own in-laws' side. Two limits: another member's own entry (`self_person_id` or a
settled claim) is never theirs to edit, and a connection needs **both** ends on
the branch (`private.can_edit_relationship`) — one end alone would let them
redraw a line into someone else's family. Nothing else moves: deleting people,
minting invites, setting `lineage_type` and the admin console stay admin-only.
`lib/branch.ts` mirrors the rule for the UI; the database decides.

**Account types (Step 18):** four kinds of member, named for the tree they
grow. `lib/account-types.ts` is the model — the only place a stored key becomes
a name, and where each type's reach is written down (`entries`, `connections`,
`companions`: `tree` / `branch` / `own` / `self` / `none`; `addRelatives`;
`runsTree`) — so a name or a plan's limits can change without a migration.

| Stored `role` | Name | Reach |
|---|---|---|
| `admin` | **Root** | Everything, plus running the tree: members and their account types, invites, share links, deletes, lineage, verification |
| `branch_admin` | **Branch** | Every entry and connection on the side of the Root they're related to (see **Branches**); invites relatives as Leaves, and invites someone to claim an unclaimed entry on that side |
| `member` | **Canopy** | What they add, the lines they draw, and their own entry. Invites relatives as Leaves, and invites someone to claim an entry they added. New members join as Canopy |
| `leaf` | **Leaf** | Their own entry (details, photo, documents, card position). Read, comment, flag, claim — nothing that grows or reshapes the tree |

The keys kept their old values on purpose: renaming them would rewrite every
`role = 'admin'` test in the database for no visible change. A Root switches
anyone else between Branch, Canopy and Leaf on `/admin` (`AccountTypePicker` →
`setAccountType`); making or unmaking a Root isn't on offer there. Who may
invite follows from the type alone — the per-member `can_invite` grant was
retired, and the column dropped, in Step 22.1 — and an invite link can make someone Canopy or Leaf (see
**Invite as a Leaf** under Auth & invites).

A Leaf is held to their entry in the database, not just the UI:
`can_edit_person` / `can_edit_relationship` / `can_edit_pet` and the
`pets_insert` policy check `private.is_leaf()`, and because people and lines
are mostly written by SECURITY DEFINER RPCs that RLS never sees, two table
triggers (`people_leaf_guard`, `relationships_leaf_guard`) refuse a Leaf's
insert with `LEAF_ACCOUNT`. The one exception is onboarding: a Leaf with no
entry yet may add one person — themselves — and the lines that place that
entry (remembered in the transaction-local `ancestree.leaf_seed`). Claiming
(`claim_person`) still works: it only moves lines that already run through the
Leaf's own entry. The UI follows the same model: no "Add a relative", no
connection prompts or `/tree/review`, no companions, no connection editor, and
a locked entry says why in the viewer's own terms (`lockedEntryNote`).

The brand lives in `components/account-type-badge.tsx` (a mark per type on
lucide's 24px grid — a trunk splitting into roots, a limb in leaf, a crown, a
leaf — and `AccountTypeBadge`) and `components/account-type-guide.tsx` (a card
per type listing what it can do, read off `describeAccess`), coloured by the
`--account-{root,branch,canopy,leaf}` tokens in `globals.css` (bark,
heartwood, crown, new growth; each ≥ 5:1 on its own tint in both themes).
`/account` shows the member's own card; `/admin` → Members shows all four.

**Storage:** private buckets `photos` and `documents`. Object path
`{tree_id}/{person_id}/{filename}`, served only through signed URLs. Photos are
readable by every member; only whoever can edit the entry can write either.
**Documents are private (Step 18.4):** a document's row and file are readable
only by a Root, the entry's owner (or the member whose own entry it is), and
the Branch who tends that side of the tree — including another member's own
entry, which the Branch can't edit (`private.can_see_documents`, on
`documents_select` and `storage_documents_select`; mirrored by
`lib/branch#canSeeDocuments`). Everyone who can edit an entry is in that set,
which a delete also needs. Others see a one-line "private" note in the panel
rather than an empty list.

Helpers live in the unexposed `private` schema (`is_admin`, `is_branch_admin`,
`is_leaf`, `is_tree_member`, `can_edit_person`, `branch_ids`,
`root_person_ids`, `own_branch_ids`, `is_on_own_branch`, `can_see_documents`, `person_is_someones_own`, `can_edit_relationship`,
`can_edit_pet`, `leaf_guard_people`, `leaf_guard_relationships`).

## Auth & invites (Step 3)

- **Magic-link only** (`supabase.auth.signInWithOtp`). `proxy.ts` redirects
  unauthenticated visits to protected routes → `/join`; authenticated users
  without a member profile → `/join?status=pending`.
- **`/auth/callback`** exchanges a `code`, then either `redeem_invite(token)`
  (invite flow) or `ensure_profile()` (admin bootstrap). The link in our
  sign-in emails carries a `token_hash` instead, and for that the callback
  only forwards to **`/auth/confirm`**, whose button POSTs to `confirmSignIn`
  — the one place `verifyOtp` runs. Opening the link must never spend the
  token: mail scanners (Outlook/Hotmail Safe Links) open every link before
  the recipient does, which is what left Raiya with "link already used" on
  every fresh link (Step 20).
- **An emailed invite is the sign-in link (Step 20)**: approving a request,
  a direct invite, and a claim invite all set `invites.invited_email`.
  `/join/<token>` then shows one "Accept & open the tree" button
  (`AcceptInviteForm` → `acceptInvite` → `signInWithInvite` in
  `lib/sign-in.server.ts`): with the service role it creates the confirmed
  auth user, mints a one-time token (`auth.admin.generateLink`), spends it on
  the spot with the cookie-bound client, and redeems the invite with the
  recipient's name — no second email. It refuses an address that already has
  a profile, so an invite is never a 14-day key to a live account. Because
  the token holder becomes that address, only a Root or the service role may
  set `invited_email` (`invites_guard`); a bare link (`createInvite`) has no
  address and still asks for one and verifies it by email. The privacy
  checkbox sits on `/request-invite` for people who ask, and on the accept
  page for people invited cold.
- **Invite tokens** (`public.invites`): whoever may invite mints a
  single-use, 14-day link `"/join/<token>"` by inserting a row directly under RLS
  (`can_invite_as`). `redeem_invite` (SECURITY DEFINER) creates the member
  `profiles` row with `invited_by_user_id = invite.created_by` and flips the
  invite to `accepted`. `invite_preview(token)` is the only pre-auth RPC.
- **Invite as a Leaf (Step 18.2)**: every invite carries `invites.joins_as`
  (`member` | `leaf`, default `member`) and `redeem_invite` creates the
  profile with that role. Who may mint which is `private.can_invite_as`
  (mirrored by `lib/account-types#invitableTypes`): a Root either; a Branch or
  a Canopy member Leaves; a Leaf nobody (Step 22.1 — before it, Canopy needed a
  Root's `can_invite` grant, which also widened a Branch to Canopy). Branch and
  Root are never given by link. The `invites_guard` trigger keeps changing a
  link's `joins_as` or claim target (`person_id`) to Roots, so nobody can mint
  a Leaf link and widen it afterwards, or aim a link at someone else's entry.
- **Invite someone to claim an entry** (`20260904100000_invite_to_claim_entry`,
  widened in Step 22.1): an invite with
  `person_id` set names the entry on `/join/<token>` and lets whoever redeems
  it claim that entry without the name match. `private.can_invite_to_claim`
  says whose entry that may be: one the inviter can edit (`can_edit_person`)
  that nobody is behind yet — owner still the creator, no approved claim, no
  member's own — and whose person is living. So a Root anywhere, a Branch on
  their side or among their additions, Canopy among their additions, a Leaf
  nowhere; `lib/branch#canInviteToClaim` mirrors it for the entry panel. A Root
  picks Canopy or Leaf; from anyone else it joins as a Leaf, enforced by
  `invites_guard`. `sendClaimInvite` asks `public.can_invite_to_claim` as the
  inviter, then writes with the service role, since the link is bound to the
  address (`invited_email`) and signs it in. Roots choose on
  `/admin` (both invite forms, `JoinsAsChoice`); everyone else who can invite
  gets an "Invite a relative" card on `/account`. `/join/<token>` tells a Leaf
  what that means before they sign up, and a Leaf's onboarding form offers no
  in-between people and only the suggestions about them (`selfOnly`), since
  the Leaf guards would refuse anything else. Leaf links are marked in
  `/admin`'s sent-invites and bare-links lists.
- **Invite requests** (`public.invite_requests`): anyone can ask from `/` →
  `/request-invite` with first name, last name, and email. The row is written
  by the `requestInvite` server action using the service-role client, so the
  table needs no `anon` grant or insert policy and cannot be read or enumerated
  from the browser. Admins review pending requests on `/admin`; approving mints
  a normal single-use invite link (attributed to the reviewing admin) and
  emails it to the requester via Resend (`lib/email.ts` +
  `lib/emails/invite-approved.ts`, needs `RESEND_API_KEY`) — if the send
  fails, the invite is still valid and the admin can copy the link and send it
  themselves; declining just closes the request.
- **Direct invites**: from the same `/admin` card — and, since Step 20, from
  the "Invite a relative" card on `/account` for anyone who may invite, as
  whatever `invitableTypes` lets them give — the inviter can skip the
  request queue and send invites straight to people they already know — a
  `useFieldArray` row-per-person form (first name, last name, email;
  `components/direct-invite-form.tsx`) posting to `sendDirectInvites`
  (`app/actions/invites.ts`). Each row mints an invite the same way
  `createInvite` does, emails it with `lib/emails/invite-sent.ts` (same visual
  shell as `invite-approved.ts`, via `lib/emails/shared.ts`, but worded for
  "you were invited" rather than "your request was approved"), and — purely so
  it shows up in the same history — inserts an already-`approved`,
  `source = 'direct'` row into `invite_requests`. Both writes use the
  service-role client after the action has checked the inviter's permission:
  a Branch may not bind an email through RLS, and never sees the token.
- **Invite history**: `/admin`'s "Sent invites" card (`listInviteHistory` in
  `lib/invites.ts`, `components/admin-invite-history.tsx`) is every non-
  pending `invite_requests` row — request-driven or direct — joined to its
  `invites` row so it can show whether the link was ever used, is still
  active, expired, or was revoked, and whether the email actually sent
  (`email_sent`, best-effort — a `false` doesn't mean it bounced, just that
  Resend's API call didn't return success).
- **Share links** (`public.share_links`): admins mint any number of view-only
  links `"/shared/<token>"` from `/admin` (server actions `createShareLink` /
  `revokeShareLink`, each optionally 30-day-expiring and independently
  revocable). The `/shared/[token]` route resolves the token with the
  service-role client (`lib/share-links.server.ts`) — RLS is admins-only, no
  `anon` grant — and renders `<FamilyTree readOnly>` (no drag-persist, no add /
  claim / flag / comment / manage affordances) with a "request edit access" CTA
  pointing at `/request-invite`. `lib/share-links.ts` holds the pure
  usable/expired/revoked logic (`.test.ts`).
- **Admin bootstrap**: `private.admin_allowlist(email)` — seeded with both
  co-admins (Aalim Rattansi, Raiya Suleman). First login by an
  allowlisted email runs `ensure_profile`, which creates the single shared
  `trees` row and an `admin` profile. Non-allowlisted users
  without an invite get `needs_invite`.
- **`profiles_protect_role`** trigger still pins the role for
  non-admins; the SECURITY DEFINER helpers set a `LOCAL`
  `ancestree.privileged_profile_write` GUC to bypass it during bootstrap only.
- **`public.member_directory`** view (`security_invoker`) = profiles + resolved
  `invited_by_name`; drives `/admin` and `/account`.

**Supabase dashboard config (do once):** Authentication → URL Configuration →
Site URL `https://ancestree.space`; Redirect URLs allowlist
`http://localhost:3000/**`, `https://ancestree.space/**`,
`https://*-arattansi.vercel.app/**`. Email provider = built-in for now (free
tier ~3–4/hour) — swap to an SMTP provider before wider testing.

## Privacy & compliance (Step 10)

Family data (living people, DOB, photos, documents) is treated as sensitive PII;
Canadian context → PIPEDA-minded.

- **Consent at registration**: the magic-link form has a required consent
  checkbox linking to `/privacy`; `requestMagicLink` rejects the request without
  it. `/privacy` is in `proxy.ts`'s public prefixes so it is readable pre-auth.
- **All PII behind auth + RLS**: every table is RLS-scoped by tree membership;
  nothing is public or indexed. Photos/documents live in private buckets and are
  only ever served through short-lived signed URLs (unchanged from Step 2).
- **Admin data export**: `/admin` → "Download JSON export"
  (`exportTreeData`, service-role read of every table scoped to the shared tree;
  `components/admin-export.tsx` streams it as a client-side download).
- **Delete a person**: `PersonPanel` → "Delete entry" (admins only,
  `deletePerson`) removes the row (edges cascade) plus its photo and document
  objects from storage.
- **Delete your account**: `/account` → "Delete my account" (`deleteAccount`)
  removes the auth user + `profiles` row after reassigning the member's
  `created_by` / `owner_user_id` / `uploaded_by` references to a founding admin,
  so the shared record stays intact. Blocked if the caller is the only admin.
- **Free-tier headroom**: photos are downscaled client-side to ≤1280px JPEG
  (`lib/image.ts#compressImage`, wired in the add + edit forms); documents are
  capped at 10MB/file client-side (`person-documents.tsx`), well under the
  Supabase Free limits (50MB/file, 1GB storage, 500MB DB). No `console.*` calls
  anywhere in `app/` `lib/` `components/` — no PII in logs.

## Reference data — GeoNames `places`

Birthplace autocomplete is backed by `public.places`, imported from the
[GeoNames](https://www.geonames.org/) `cities500` export (all populated places
with population ≥ 500).

- **Source dump:** `cities500.zip` → `cities500.txt`, GeoNames "geoname" table
  layout (19 tab-separated columns, no header).
  **Version imported:** `cities500.txt` dated **2024-11-04** (latest
  `modification_date` in the file; re-download from
  `https://download.geonames.org/export/dump/cities500.zip` for a fresher cut).
- **Import command** (needs `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`):

  ```
  npm run import:geonames -- /path/to/cities500.txt
  ```

  `scripts/import-geonames.ts` streams the file, keeps `feature_class IN ('P','A')`,
  and batch-upserts (1000/batch) on `id` via the PostgREST endpoint
  (`Prefer: resolution=merge-duplicates` — no `supabase-js`, so it runs on
  Node 20), so it is safe to re-run. It prints the final `places` row count.
- **Imported:** 2026-08-31 — 235,552 rows (cities500 is entirely
  `feature_class = 'P'`; it contains no `'A'` admin areas — those would need the
  full `allCountries` dump or a dedicated admin export). Spot-checked against
  New York, London, Tokyo, Paris, Buenos Aires; trigram fuzzy search verified
  (e.g. `search_name LIKE '%zurich%'` → index scan, matches `Zürich`).
- **Free-tier size:** `places` measures **58 MB** total (table + the two
  `pg_trgm` GIN indexes + the `country_code` btree); whole DB **70 MB**, well
  under the Supabase Free 500 MB limit. **`allCountries` (~13M rows, ~55×) is
  multiple GB and must not be imported on the free tier.**
- `pg_trgm` lives in the `extensions` schema (not `public`), per the Supabase
  linter — migration `20260831040000_places_trgm_extension_schema`.

## v1 acceptance checklist

All Product Brief items pass as of Step 10: invite-gated magic-link auth with
inviter-attributed links; onboarding self-entry + connection (chain-add);
demographic form with required-field + conditional-deceased validation; private
photo + multi-document upload via signed URLs; admin-only lineage; React Flow
canvas with custom nodes, anchored auto-layout, pan/zoom, detail panel; edit gating
(creator/owner/admin) + admin delete; claim flow (detect on register,
auto-approve, notify creator, creator lockout); flag/comment + resolve/verify;
multi-tree "start your own tree" stub; mobile-first + WCAG AA. Deploy to
`ancestree.space` via Vercel (`git push` → production on `main`).

## Changelog

- **Step 23 — Search & filters, connections, and pets on request** (ad-hoc,
  no migration): the search bar on the canvas is now a **Search & filters**
  button (`components/tree/tree-search.tsx`) that opens a card with three
  functions and closes itself once it has put something on the canvas; a badge
  on the button counts what is switched on. (1) The old search and demographic
  filters, unchanged. (2) **Show a connection**: pick two people
  (`person-picker.tsx`, name-only type-ahead via `matchesName`) and
  `connectionPath` in `lib/connection-path.ts` finds the shortest chain of
  recorded relationships between them — blood before marriage on a tie, a
  stored `sibling` row only where no shared parent is on the tree. The chain is
  pulled out through the same spotlight machinery as one person's tree
  (`spotlight.anchorId` / `brackets` generalise it), both ends ringed, plus the
  partner of the ancestor it turns round on. `connectionLabel` names it for
  the pill — "Second cousins", "Uncle & niece by marriage" — using `sex` where
  recorded and neutral words otherwise; a pair nothing joins says so. Opening
  someone from a search result puts "How is … connected to…" at the top of
  their details (`connectionPrompt` on `PersonPanel`, so it works on a phone
  where the sheet covers the canvas). (3) **Pets & companions** toggle
  (`use-show-companions.ts`): companions are **off the canvas by default for
  everyone**, returning viewers included, and switching them on is remembered
  per browser in `localStorage` (`ancestree:companions-shown`) — not per
  account. Hidden companions still list in a person's details and open from
  there. Checked on a fixture tree and on the live one; 15 new tests.

- **Step 22.1 — Branches and Canopy invite someone to claim an entry**
  (migrations `20260921130000_claim_invites_by_reach`,
  `20260921140000_drop_can_invite`): inviting someone to
  claim a particular entry was a Root's alone. It now follows edit reach — a
  Branch on the side they tend, Canopy on the entries they added — for entries
  nobody is behind yet, and never for someone who has died. From anyone but a
  Root the newcomer joins as a Leaf; a Root's claim invite now offers Canopy or
  Leaf, where it always made a Canopy member before. The per-member invite
  grant is retired: every Branch and Canopy member invites Leaves from
  `/account`, a Root invites either, a Leaf never invites, and `/admin`'s
  "Can invite" toggle is now a read-only "Invites as" column. Only the two
  Roots held the grant, so nobody lost anything; `profiles.can_invite` was
  dropped once the app that no longer read it was live. First of the Step 22
  permissions work.

- **Step 21.3 — The trunk meets the bar in the middle**: parents often sit
  off to one side of their children in the overview, so the trunk met the
  siblings' bar off-centre, sometimes right over one child, and the family
  read as lopsided. Now no card moves; only the line does. The trunk leaves the
  parents where it did, jogs sideways a quarter-gap below them, and drops onto
  the bar halfway between the first and last child. It is routed by
  `descentRoute` and `trunkStep` in `lib/tree-layout.ts` from the live cards, so
  it follows drags. Each descent edge carries its `siblings`, and every child
  of a union draws the identical trunk, step and bar, so the faint line never
  doubles. One child, or a trunk within a pixel of the middle, keeps the old
  single bend, byte for byte. One change: a child dragged up close now raises
  the whole family's bar, not just its own line. The spotlight uses the same
  route: the leaves pulled out share one bar, and the children left behind
  keep another. On the live tree, Sonbhai and Karmali's four children now step
  about 630 units across. Dragging a child moved the midpoint by exactly half
  the drag, and both test drags were undone. Phases 21.1 (where a line lands
  on a leaf) and 21.2 (centring the spotlight so the step disappears) follow.

- **Step 20 — One link in** (migration `20260921120000_invite_email_signs_in`):
  two sign-in problems from onboarding real relatives. *Bug:* Raiya got
  "link already used" on every fresh sign-in link. The auth logs show each
  token verified once and then failing seconds later — her Hotmail's link
  scanner opened the email's link first, and our GET spent the one-time token.
  `/auth/callback` now forwards a `token_hash` link to `/auth/confirm`, and
  only that page's button (a POST) verifies; a second tap in a browser that is
  already signed in carries on to the tree, not to an error. Emails
  already sent keep working, and the templates are unchanged. *Redundancy:*
  Ashif asked to join, was approved, got an invite email, typed his email
  again, and waited for a second email to finally sign in. An emailed invite
  is now the sign-in link: request → approve → one email → one button → the
  tree, greeted by name. Same for direct and claim invites, and Branches can
  now email invites from `/account`. `invites_guard` keeps binding an email to
  an invite to Roots and the service role. Checked end to end against the live
  project with a throwaway address (then removed), signed out on `127.0.0.1`
  (`allowedDevOrigins`) beside a signed-in `localhost`.

- **Step 19.4 — Siblings' partners as pills**: in a spotlight, the partner
  of each sibling from 19.3 is a small neutral pill with only their name, so
  blood relatives (leaves) and people who married in read differently by
  shape, not colour. `layoutTree` takes `compactIds` and packs them at pill
  size (`PILL_W` × `PILL_H`) on the side of their partner away from the
  focused person. Without it the layout is unchanged, which a test holds to
  exact recorded positions. Partners of people on the line keep their leaves.
  A pill is focusable, says "Spouse of …", and clicking it (or Enter) moves
  the spotlight to them. On the live tree Arzu's row narrows from 1,440 to
  1,352 units, and Aly's from 696 to 608.

- **Step 19.3 — Siblings in the spotlight**: the first thing a tester asked
  on clicking themselves was "where are my siblings?" `personSpotlight` now
  returns roles: the line, the focused person's siblings (by shared parent,
  including half-siblings, or by a stored `sibling` row) and those siblings'
  partners. All are lit as leaves on the person's row, eldest first, and the
  person doesn't move. A sibling who shares no parent on the tree gets a
  dashed bracket to the person instead of a bus. There are none on the live
  tree yet: all 8 stored sibling pairs also share a parent. The bracket was
  checked against an in-memory row. Siblings' children, ancestors' siblings
  and a partner's siblings stay dark, and companions still follow the line
  alone.

- **Step 19.2 — Land on who you added; Add in reach**: a successful add opens
  `/tree?person=<new id>` on the new person's spotlight, where it used to
  open the bare canvas. The canvas seeds its selection once per `person`
  value, not once per mount. Add a relative is a 44px button with its label
  showing. It sits beside the details sheet rather than under it, is repeated
  inside the sheet on a phone, and starts the flow connected to whoever is
  selected (`/people/new?relatedTo=`, checked against the tree server-side).

- **Step 19.1 — Whose entry is whose**: every entry that belongs to a member
  shows their account type: a small Root/Branch/Canopy/Leaf mark on the card
  (bottom-right), hung under the leaf in a spotlight, and spelled out in the
  panel. An entry is a member's through `profiles.self_person_id` or an
  approved claim. Onboarding writes no claim, so on the live tree claims
  alone found 1 of the 4. `getTreeGraph` loads types only when `/tree` asks
  (`withAccountTypes`); a share link never reads profiles. Tester feedback
  also redrew two leaves: the maple is now the Canadian flag's, and the
  baobab no longer crosses the name with its leaflets' outlines.

- **Step 18.4 — Documents are private** (migration
  `20260919150000_documents_private`): every member could list and download
  every document on the tree. Now only a Root, the entry's owner and the
  Branch for its side can; everyone else sees that they are private instead
  of "No documents yet". The account-type cards gained a "See documents" row,
  and `/privacy` says who can see them. Checked in a rolled-back transaction
  against the one live document: Roots and its owner see the row and the
  file; a Canopy member or Leaf who doesn't own it sees neither; a Branch on
  Raiya's side (where it is) sees both, one on Aalim's side neither.

- **Step 18.3 — Document controls follow edit rights**: an entry's panel
  offered "Add documents" and Remove to everyone, and the database refused
  anyone who couldn't edit the entry — a Remove even looked like it worked,
  because RLS filters a refused delete instead of raising, until the list
  reloaded. `PersonDocuments` now takes `canEdit` and shows the uploader and
  Remove only to editors; everyone keeps the list and Download, since every
  member can read documents. `removeDocument` reports a refused delete. The
  uploader's note said "Only you and admins can see these", which was never
  true; it now says everyone on the tree can see and download them.

- **Step 18.2 — Invite someone straight in as a Leaf** (migration
  `20260919140000_invite_as_leaf`): an invite now says what it makes someone,
  Canopy or Leaf, and a Branch can send Leaf links from `/account` without an
  invite grant — Arzu's first use. Roots pick on `/admin`. The same migration
  closes two gaps in who can edit an invite: a link's type and its claim
  target are now a Root's alone. Checked in a rolled-back transaction: a
  Branch mints a Leaf link but not a Canopy one, can't widen or retarget it,
  can still revoke it; a Root mints either; the signed-out preview says Leaf;
  a new user redeeming it becomes a Leaf credited to the Branch. A Leaf's
  onboarding drops "add someone in between", which the Leaf guards would have
  refused at the last step.

- **Step 18.1 — A Branch tends their Root's side** (migration
  `20260919130000_branch_on_related_root`): a Branch's reach was measured from
  their own entry; it is now the branch of the Root they are related to, so a
  Branch looks after a founder's side of the tree rather than their own corner
  of it. On the live tree Arzu's reach grows from 14 entries to 17 (Raiya's
  mother's family) and loses none. A child of both Roots tends both sides; a
  member related to no Root tends nothing. `/admin` says whose side each Branch
  tends, and `/account` tells a Branch theirs. Checked in a rolled-back
  transaction: the new entries and the lines between them editable, Aalim's
  side and Raiya's own entry still refused, no reach while onboarding.

- **Step 18 — Account types** (migration `20260919120000_account_types`):
  the seed of a model that could one day be sold as plans. The three roles
  became four named account types — **Root** (`admin`), **Branch**
  (`branch_admin`), **Canopy** (`member`) and the new **Leaf** (`leaf`), a
  member who keeps their own entry and can read, comment on and flag the
  rest. `lib/account-types.ts` describes each by how far its rights reach,
  and `lib/branch.ts` now reads that instead of testing role strings. The
  database holds a Leaf to their entry through the edit helpers, the pets
  insert policy and two table triggers that also cover the SECURITY DEFINER
  RPCs (exercised in a rolled-back transaction: own entry editable; add
  relative, connect, accept a prompt and add a pet all refused; onboarding
  self-add allowed; Canopy unchanged). Each type has a mark, a colour and a
  card; `/admin` swaps the "make branch admin" button for a Branch / Canopy /
  Leaf picker and lists all four, and `/account` shows the member's own. See
  **Account types** above.

- **Step 17 — Feedback round 1 (Arzu)** (migrations
  `20260913090000_branch_admin_role`, `20260918120000_partial_person_dates`):
  the first member outside the admin pair sent seven notes, and three were
  permission effects admins never see. *Branch admins* (see **Branches**
  above) let a member curate their own side of the tree — the relatives
  someone else entered, their own parents included — without being handed
  the whole tree. Writes that RLS filters out (it doesn't raise on an UPDATE)
  now report "only the owner / a branch admin / an admin can…" instead of
  "Changes saved.", a refused drag puts the card back, and cards the viewer
  can't move aren't draggable at all. The place picker stopped searching for
  its own label after a pick (Base UI reports filling the input as an input
  change; that search found nothing and knocked the pick back to "Selected
  place"). Dates are typed as Day / Month / Year (`DateField`) instead of a
  phone's date wheel, and birth and death dates may be a year or a month and
  year: `people.date_of_{birth,death}_precision`, a partial date stored on the
  first day of its period, shown by `formatPartialDate` ("May 1950", "1950").
  Marriage and divorce dates use the same field but stay whole for now. The
  canvas gained a dismissible tip explaining the two click-to-focus views,
  and a clicked line now dims every card it doesn't run through. The rest of
  the round — "how are we related?", birthdays and anniversaries, the
  married-in layout, group drag — is on the Notion board under Step 17.

- **Step 15.1 — Nickname matching** (migration `20260901050000_name_nicknames`):
  the Step 15 scorer compares how names are spelled and how they sound, so
  Bob/Robert, Bill/William and Peggy/Margaret — which share neither — scored
  near zero, and a relative entered under their formal name never surfaced for
  someone who types the name they actually go by. Those pairs are data, not a
  string metric, so `name_nicknames` holds folded `(variant, canonical)` rows
  and `private.nickname_match` asks whether two names share a canonical;
  `private.name_score` floors a hit at 0.9 (curated, so it counts as a strong
  match). A variant can belong to several roots — "Alex" reaches Alexander and
  Alexandra without joining those two to each other. Seeded with ~90 English
  given names; the table is member-readable and admin-writable. Because that
  seed is English and this family's names aren't, `/admin` carries a
  **Nicknames** panel (`AdminNicknames`) to extend it: add a root + nickname
  pair (folded on the way in, and the root's identity row written alongside so
  a brand-new group works from its first nickname), filter the groups, and
  drop a single nickname or a whole root.

- **Step 15 — Fuzzy first-run onboarding** (migration
  `20260901030000_onboarding_name_match`): `/onboarding` used to open straight
  onto the full add-yourself form, so a member a relative had already entered
  created a duplicate and only met the "is this you?" claim prompt afterwards —
  and that prompt keys off an *exact* first/last name match, which a single
  typo defeats. Onboarding now starts with two fields (first + last name) and
  searches the shared tree for unclaimed entries that look like them:
  `search_self_candidates` scores each entry with `private.name_score`, which
  folds accents and punctuation away (`private.fold_name`, `unaccent`) and then
  takes the best of trigram similarity, normalised Levenshtein distance, a
  double-metaphone match (0.85 — Catherine / Katherine) and a prefix match
  (0.75 — Ali / Alimah). First and last are scored separately against
  `first_name`/`preferred_name` and `last_name`/`maiden_name`; both halves must
  clear 0.4 and the mean 0.55, so "Rohen Sueman" finds "Roshen Suleman" but
  nothing unrelated. Candidates are filtered to entries nobody stands behind
  yet (`private.person_is_claimable`) and carry their parents' names, the
  clearest "is this me?" cue in a family tree; anything under 0.85 is labelled
  **close match**. Picking one calls `claim_person_as_self`, which — unlike
  `claim_person` — has no stub to merge: it moves ownership, points
  `profiles.self_person_id` at the entry, and auto-approves a claim the
  creator can still dispute (same rate limit, 5/24h). "None of these are me"
  falls through to the old `AddPersonFlow`, pre-filled with the typed name.

- **Step 14 — Bloodline growth gate** (migrations
  `20260901000000_bloodline_growth_gate`, `20260901020000_bloodline_gate_own_descendants`,
  `20260901030000_canvas_interest_register`): growth used to require only
  that a new entry reach *someone* already in the tree, and spouse edges
  counted — so anyone who married in could hang their whole birth family off
  themselves. The bloodline is now derived from an explicit anchor set
  (`bloodline_anchors`, seeded from the founding admins' own entries, the same
  anchors `getTreeAnchors()` numbers generations from): climb `parent` edges
  **up** from the anchors to every ancestor, then descend from that whole set.
  Direction is the point — walking parent edges undirected leaks from a blood
  member down to their child and back up to the child's other parent, putting
  every married-in partner inside. Up-then-down keeps cousins, great-aunts and
  half-siblings in and married-in partners out; `lineage_type` sits on the
  person, not the edge, so adoptive children descend like anyone else. The gate
  in `add_people_with_connections` (step 5b, recomputed *after* the edges land)
  lets a member outside the bloodline create only people inside it **or
  descending from them**: their children and grandchildren pass, their parents,
  siblings and in-laws do not. Admins, onboarding (no `self_person_id` yet) and
  trees with no anchors are exempt, so the rule bites only on new growth — all
  20 current entries are blood. `people_insert` / `relationships_insert` are now
  admin-only so the SECURITY DEFINER RPCs are the only creation path and the
  gate can't be stepped around via the Data API. A refusal raises
  `BLOODLINE_GATE`, which the add flow answers with **"Looks like you're
  building a new family tree"**. That prompt provisions nothing — whether we
  build second trees at all is post-proof-of-concept, so its only job is to
  register interest (`canvas_interest`, one row per member, surfaced on `/admin`
  as **Wants their own tree** with the email joined from `auth.users` by an
  admin-only RPC, a copy-addresses button and new/contacted/dismissed outreach
  states). It is the market signal and the outreach list, not an approval queue.
  Migration `20260901010000` briefly shipped an approve-into-a-real-tree flow;
  `20260901030000` dropped it before it ever held a row. `lib/bloodline.ts`
  mirrors the derivation as pure functions (15 vitest cases), including the
  co-parent leak.

- **Step 4.6 — Anchored tree layout** (migration
  `20260831070000_person_layout_offsets`): replaced the dagre pass with a
  purpose-built engine in `lib/tree-layout.ts` (24 vitest cases). Generations are
  numbered *relative to the founding admins* (`getTreeAnchors()` reads their
  `self_person_id`s), so generation fixes `y` and adding a great-grandparent
  extends the chart upward instead of reflowing it; the anchor couple is
  translated to the canvas origin. Ancestors reachable from only one anchor —
  and their collaterals — are pushed to that anchor's side of the origin, so the
  two bloodlines never interleave. Within a row: seed order by side then degree
  (hubs innermost), four median sweeps to cut crossings, barycentre coordinate
  passes to centre parents over children, then a **separation sweep that
  guarantees** no two cards on a row are closer than `GUTTER` — overlap is
  impossible at any size (tested on a 105-person tree). Couples stay adjacent
  eldest-left; sibling runs go oldest→youngest. The canvas draws generation
  lanes (`ViewportPortal`) labelled by *generation number* rather than by
  relationship — a row also holds the aunts, uncles and in-laws born into it, so
  "Grandparents" would mislabel most of it. Numbers count outward from the
  founders: ancestors up ("Generation One" = parents, "Generation Two" =
  grandparents), descendants down ("Generation minus One" = children); row 0 is
  "Founders' generation". Captioned with the decade span the row actually covers
  ("b. 1950s–1960s" when two sets of parents are a decade apart). Routes every
  child of a parent set through a shared `busY` so a marriage shows one trunk
  plus stubs (`DescentEdge`). That junction is computed by the pure
  `descentGeometry(parentRects, childTop)` from the parents' **live** card
  positions read out of the React Flow store — an invisible junction *node*
  would stay where the layout first put it and detach the moment a parent was
  dragged. It also handles a lone parent and partners dragged apart by dropping
  the start below the cards rather than across a face. Spouse lines are drawn
  level through both cards' vertical middles (`lateralGeometry`), stepping at
  right angles rather than sloping if a partner is dragged off the row; the
  person card is a fixed `NODE_H` tall so cards with different amounts of detail
  can no longer tilt the line between them. Drags now persist as a **nudge** (`pos_dx`/`pos_dy`)
  from the computed position rather than an absolute pin, so a moved card follows
  the tree as it grows; legacy `pos_x`/`pos_y` still win until that card is next
  dragged, and an admin-only **Auto-arrange** (`autoArrangeTree`) clears every
  nudge and pin at once. Dropped dep: `dagre` (+ `@types/dagre`).
- **Step 4.5d — Historical place-name resolution** (migrations
  `20260831060000_historical_names` + `..._seed_east_africa`): new
  `historical_names` table (`place_id` **or** `country_code`, `name`,
  `start_date`/`end_date`, `source`) — a curated, **not** global set. Seeded for
  the regions this tree spans (Tanganyika/German East Africa, Sultanate of
  Zanzibar (place-scoped, GeoNames 148730), Kenya Colony / British East Africa
  Protectorate, Uganda Protectorate, Union of South Africa). `lib/historical-
  names.ts` — pure `resolveHistoricalName(rows, {placeId, countryCode,
  eventDate})` (place-scoped beats country-scoped; `end_date` exclusive) +
  `formatHistoricalPlace` ("Nairobi, Kenya Colony · now Kenya"; no label when
  the period name already equals the modern country). `getTreeGraph` loads the
  table once and sets `birth_place_historical` / `death_place_historical` per
  person from the birth/death year; `PersonPanel` shows those in place of the
  plain birth/death place when present. Vitest: `lib/historical-names.test.ts`.
  Verified against real rows — e.g. Zanzibar 1925 → "Sultanate of Zanzibar",
  Nairobi 1936 → "Kenya Colony", Nairobi 1965 → (modern). Add regions by
  appending to the seed migration.

- **Step 4.5c — Places autocomplete in the person form** (no migration):
  `components/place-autocomplete.tsx` — a Base UI `Combobox` bound to `places`
  via `searchPlacesAction` (debounced trigram search, `app/actions/places.ts`),
  showing "City, ST, Country" (`lib/places.ts#formatPlaceLabel`; `admin1` only
  when GeoNames stored a letter code). `PersonFields` now has a **Place of
  birth** (required — `personSchema` rejects a null `place_id_birth`) and
  **Place of death** picker instead of the free-text city/country/place-of-death
  inputs; picking a place also fills the legacy `city_of_birth` /
  `country_of_birth` / `place_of_death` text (derived, kept until 4.5b's
  columns are dropped). `updatePerson` writes the FKs directly;
  `addPeopleWithConnections` sets them on the new rows right after the RPC (RPC
  signature unchanged). Admin-only escape hatch: "Add a place" dialog →
  `requestNewPlace` (service-role insert, ids ≥ `10_000_000_000` mark
  admin-added). Edit form pre-loads the selected place label via
  `getPlacesByIds`. Detail/canvas views keep rendering the (now canonical)
  text columns. `lib/country-names.ts` — `countryName` + `ALPHA2`. Known gap:
  the flagged `start_own_tree` seam still writes only text (no `place_id`).

- **Step 4.5b — `people` place FKs + backfill** (migration
  `20260831050000_people_place_id_fks`): `people` gains nullable
  `place_id_birth` / `place_id_death` bigint FKs to `places(id)` (+ btree
  indexes). The legacy `city_of_birth` / `country_of_birth` / `place_of_death`
  text columns are **kept** — dropped only in a later follow-up once the
  unmatched rows are reconciled. No CHECK/RLS change (new columns nullable;
  `people` row access already governs them). `scripts/backfill-places.ts`
  (`npm run backfill:places`) fuzzy-matches the free text against `places`
  (trigram-style Dice similarity, ISO-country-filtered via
  `scripts/lib/country-codes.ts`), sets the FK at ≥0.6 confidence, and writes
  the rest to `scripts/out/backfill-places-unmatched.csv` for manual review.
  First run: 12/12 birth + 5/5 death matched, 0 unmatched — but "Scarborough,
  Canada" resolved to *Scarborough Village* (cities500 has no plain
  "Scarborough" for CA), worth a manual check. Types regenerated.

- **Step 4.5a — GeoNames `places` table + importer** (migrations
  `20260831020000_places_geonames`, `20260831040000_places_trgm_extension_schema`):
  new `public.places` reference table (GeoNames `geonameid` PK, `name`,
  `ascii_name`, `country_code`, `admin1_code`, `feature_class` / `feature_code`,
  lat/lon, `population`, and a stored `search_name = lower(ascii_name)` generated
  column). `pg_trgm` enabled in the `extensions` schema; GIN trigram indexes on
  `search_name` and `ascii_name` for fuzzy autocomplete, plus a btree on
  `country_code`. RLS on: `SELECT` for any `authenticated` member, no write
  policies (service-role only). `scripts/import-geonames.ts` (run via
  `npm run import:geonames`) streams the tab-delimited GeoNames dump, filters to
  `feature_class IN ('P','A')`, and idempotently batch-upserts on `id` through
  the PostgREST endpoint. New devDep `tsx`. Imported `cities500` (2024-11-04) =
  235,552 rows, `places` at 58 MB / DB at 70 MB. `lib/database.types.ts`
  regenerated. See **Reference data — GeoNames `places`**.

- **Step 11.5 — Marriage & divorce UI** (no migration; uses the 11.1 columns):
  spouse links in the add-person flow (base "How they connect" rows +
  Task 11.4's extra-connection rows) reveal an optional **Marriage date** +
  **They later divorced** checkbox → **Divorce date**, mirroring the
  Deceased/Date-of-death pattern (`SpouseDatesFields`); the values ride the
  `ConnectionEdge` into `add_people_with_connections`. `getTreeGraph` now
  carries `id / created_by / marriage_date / is_divorced / divorce_date` on
  each edge. `PersonPanel` gains a **Family** section — spouse rows show
  "Married {date}" and a "Divorced {date}" badge, with inline editing of all
  three fields (`updateRelationshipMarriage` server action, gated by the
  existing `relationships_update` RLS = admin or the edge's creator; DB CHECKs
  keep dates coherent). The canvas draws a divorced pair with a sparser,
  fainter dash than a current marriage. The Step 11.3 modal's "Yes" still
  creates the spouse edge without dates — they're added afterwards from the
  panel (fields stay fully optional, never block save).

- **Step 11.4 — Multi-connection add-person flow** (no migration): once the
  base connection resolves, `add-person-flow` offers "connects to more people
  on the tree" — up to `MAX_EXTRA_CONNECTIONS` (10) repeatable rows, each a
  `RelationshipPicker` + parent/child/spouse select. Zod `superRefine` rejects
  a duplicate (person, type) row inline. All edges (chain + extras) go in the
  one `add_people_with_connections` transaction; detection + the Step 11.3
  modal run over the combined set. Cross-tree targets are impossible (member
  list is tree-scoped) and re-rejected by `resolve_person_ref`; the
  parent-child/spouse pair guard from 11.3 covers the new cycle case.

- **Step 11.3 — Blocking approval modal** (migration
  `20260831010000_add_person_suggestions_rpc`):
  `add_people_with_connections` gains a 4th arg `p_suggestions` — the implied
  connections the adder resolved. Each is written to `connection_suggestions`
  (`accepted` / `dismissed` / `pending` from Yes / No / Skip); an `accepted`
  spouse/parent suggestion also creates its edge, all in the one transaction
  with the new person + base edges. New guard: a pair can't be both a
  parent-child and a spouse edge (also covers Step 11.4). `add-person-flow`
  now runs `detectConnections` (server action → `detectImpliedConnections`)
  after form validation; 1+ suggestions open `ConnectionApprovalDialog` — a
  non-dismissible shadcn `Dialog`, one Yes/No/Skip row each, entry blocked
  until all answered. Still-pending suggestions surface inline on the person's
  detail panel (`PendingConnectionPrompts` in `PersonPanel`, fed by
  `listPanelSuggestions`), resolvable by the suggestion's author or an admin
  via `resolveConnectionSuggestion` → `resolve_connection_suggestion()` RPC.

- **Step 11.2 — Connection-suggestion detection engine** (no migration):
  `lib/connection-suggestions.ts#computeImpliedConnections` is a pure, read-only
  function over the pending edge set (`{ kind: "new" | "existing" }` refs) that
  proposes three patterns — `co_parent` (shared child, no edge between the
  parents → suggest `spouse`), `unlinked_spouse_child` (a pending spouse edge
  where one side has children unlinked to the other → suggest `parent`, one per
  child), and `name_dob_match` (a new person shares a surname + birth-year
  within `SIBLING_CHECK_WINDOW_YEARS` (40) with an unconnected existing person →
  suggest `sibling_check`, never an edge). It never re-emits a pair already in
  `connection_suggestions` (dedupe via `suggestionDedupeKey`, mirroring the DB
  unique key). `lib/connection-suggestions.server.ts#detectImpliedConnections`
  loads the tree's people/edges/recorded suggestions and runs it. Vitest added
  (`npm test`); `lib/connection-suggestions.test.ts` covers each pattern +
  dedupe + the never-an-edge guarantee.

- **Step 11.1 — Marriage/divorce fields + `connection_suggestions` table**
  (migration `20260831000000_marriage_divorce_and_connection_suggestions`):
  `relationships` gains `marriage_date date`, `is_divorced boolean NOT NULL
  DEFAULT false`, `divorce_date date`, with CHECKs — `divorce_date` only when
  `is_divorced`, `divorce_date >= marriage_date` when both set, and all three
  NULL/false unless `type = 'spouse'`. New `connection_suggestions` table
  (id, tree_id, subject_person_id, related_person_id, `suggested_type`
  spouse|parent|sibling_check, `source` co_parent|unlinked_spouse_child|
  name_dob_match, `status` pending|accepted|dismissed, created_by, resolved_by,
  resolved_at, created_at) with `UNIQUE (subject_person_id, related_person_id,
  suggested_type, source)` as the no-reprompt guarantee. RLS: SELECT/INSERT by
  tree membership (as self), UPDATE by the suggestion's creator or a tree admin.
  Types regenerated. Down: drop the table + the three columns/constraints.

- **Step 11 — Optional maiden name** (migration
  `20260830250000_person_maiden_name`): new nullable `people.maiden_name text`
  column (no default; existing rows stay NULL). `add_people_with_connections`
  re-created to persist it on create. Shared zod schema
  (`lib/person-schema.ts`) gains an optional `maiden_name` (≤120 chars, blank OK)
  wired into `toPersonPayload` + `emptyPersonValues`; `PersonFields` shows a
  "Maiden name" input beside the other name fields (not admin-gated), so it
  appears in both the edit form and the add-a-relative flow. `updatePerson`
  writes it. Detail panel (`PersonPanel`) shows "Maiden name" when set and — for
  an editor of an entry with no maiden name — a subtle dashed inline prompt
  linking to the edit form (opt-in, per-person, non-blocking; gated by the same
  creator/owner/admin `canEdit`). The **canvas `PersonNode` does not** display
  it. Search: `listTreeMembers` + `TreeMemberOption` carry `maidenName`, and the
  `RelationshipPicker` search box matches it alongside the display name (and
  shows "· née …" on matching rows). `lib/database.types.ts` regenerated.

- **Step 10 — Privacy, acceptance & ship**: no migration. Consent gate on the
  magic-link form + `/privacy` notice; admin JSON export, admin delete-person
  (+ storage cleanup), self-serve delete-account (`app/actions/privacy.ts`,
  `components/{admin-export,delete-account}.tsx`); 10MB document cap; full v1
  acceptance checklist verified. `proxy.ts` public prefixes gain `/privacy`.
- **Step 9 — Multi-tree seam, polish & admin dashboard** (migration
  `20260830240000_multi_tree_seam`): new `tree_bridges` table (RLS: members of
  either side) + `start_own_tree(name, bridge_person_id, person)` SECURITY
  DEFINER RPC that creates a member's own `trees` row, their root `people` row
  in it, and one spouse bridge back to a person on a tree they already belong
  to (one per member). Gated by `NEXT_PUBLIC_ENABLE_MULTI_TREE` via
  `lib/flags.ts#multiTreeEnabled`; the second tree is **not** drawn — this is a
  clean seam for v2. UI: `/trees/new` (`components/start-tree-form.tsx`,
  `app/actions/trees.ts#startOwnTree`), plus a flagged "Start your own tree"
  button on the canvas. Polish: `components/ui/skeleton.tsx` +
  `app/{tree,admin,account}/loading.tsx` route skeletons, wrapping/focus-ring
  fixes in `site-header.tsx`. Admin dashboard (`/admin`): an Overview stat grid
  (members, entries, relationships, claimed, unverified, open flags, disputes,
  bridges) and a per-member "Entries created" column.
- **Step 8 — Entry comments, flags & verification** (migration
  `20260830230000`): `people` gains `verified_at` / `verified_by`;
  `entry_comments` gains `resolved_at` / `resolved_by`. Any tree member can
  comment or raise a flag (`is_flag`) — inserted directly under the existing
  `entry_comments` RLS (optimistic UI). An `AFTER INSERT/UPDATE` trigger
  (`private.entry_comment_notify`) posts an in-app `notifications` row to the
  entry's `owner_user_id` + `created_by` on every comment/flag, and to the
  flag's author when it is resolved (new notification types `entry_commented`,
  `entry_flagged`, `flag_resolved`, `entry_verified`). `resolve_entry_flag()`
  (owner / admin / flag author) toggles a flag open↔resolved; the
  `entry_comments_update` policy is widened so the entry owner can moderate.
  `set_entry_verified()` (admins only) stamps verification and notifies. UI:
  `EntryComments` panel section (thread + composer + resolve), open-flag badge
  on `PersonNode` + panel header, `✓` verified marker on the node, admin
  "Mark verified" in the panel. `getTreeGraph` now also loads open-flag counts;
  `lib/entry-comments.ts` resolves author/resolver names.
- **Step 7 — Claiming & permissions** (migration `20260830220000`): edit gating
  is now owner / admin / unclaimed-creator (`private.can_edit_person` +
  `private.person_is_claimed`), enforced by the existing `people_update` policy
  and re-checked in the `/people/[id]/edit` route. `person_claim_candidates()`
  surfaces unclaimed same-name entries; `claim_person()` (SECURITY DEFINER)
  auto-approves — moves `owner_user_id`, repoints `profiles.self_person_id`,
  merges the caller's onboarding stub (relationships / documents / comments /
  photo) and deletes it, writes an `approved` `claims` row, and notifies the
  creator. `dispute_claim()` (creator only) → `disputed`, routed to admins;
  `resolve_claim(uphold|reverse)` (admin) restores ownership + detaches the
  claimant on reverse. New `notifications` table + `private.notify()`; abuse
  controls: 5 claims / 24h / user, server-side name-match re-check, admin-only
  reversal. UI: `ClaimSuggestions` canvas prompt, claim/dispute in
  `PersonPanel`, account `NotificationsList` (+ header unread badge), admin
  `AdminDisputedClaims`.
- **Step 6 — Tree visualization (canvas)**: `/tree` is now a React Flow
  (`@xyflow/react`) + dagre canvas. `lib/tree.ts#getTreeGraph` loads all people
  (with 1h signed photo URLs) + relationship edges for the shared tree;
  `lib/tree-layout.ts#layoutTree` is a pure, client-safe dagre pass — top-down by
  generation, with invisible "union" nodes tying couples to one rank and hanging
  their children from a shared point; pinned `people.pos_x/pos_y` override the
  auto position. `components/tree/`: `family-tree.tsx` (canvas + pan/zoom /
  minimap / controls, drag-to-pin via `setPersonPosition` server action),
  `person-node.tsx` (photo/initials, name + `née` maiden name / birth year
  / birthplace, dashed deceased styling, self-highlight), `person-panel.tsx` (shadcn Sheet — full details,
  documents, disabled Edit/Claim stubs for Steps 7–8). Empty state links into
  the Step 5 onboarding / add-relative flow. New dep: `dagre`.
- **Step 5 — Connections & add-person flow**: `add_people_with_connections`
  SECURITY DEFINER RPC (migration `20260830210000`) creates one or more people
  plus their `parent`/`spouse` edges in a single transaction, links the caller's
  `self_person_id` when `p_self_index` is set, guards against parent/child cycles
  (recursive walk), and — for non-admins — rejects the write unless every new
  person reaches a pre-existing tree member (admins seed roots freely). Replaces
  `create_self_person` (dropped). `sibling_edges` security-invoker view exposes
  sibling pairs from shared parents; `lib/siblings.ts` mirrors it client-side.
  New `AddPersonFlow` (self + relative modes) with `RelationshipPicker`
  search-select and inline chain-add of missing in-between people; `/onboarding`
  now requires a connection, `/people/new` adds relatives. `PersonForm` is now
  edit-only; demographic fields extracted to `PersonFields`.
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
