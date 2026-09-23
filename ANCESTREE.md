# Ancestree

Invite-only, auth-required, collaborative family-tree web app. Relatives add
themselves and their connections into a shared, editable, canvas-style tree.
Since Step 25 there can be many trees: a person is one entry shown on every
tree that has brought them in, and a member's account type is per tree. The
rules live in [`docs/trees-and-permissions.md`](docs/trees-and-permissions.md).
Wording and layout rules live in [`docs/design-system.md`](docs/design-system.md):
Title Case for card, section and page titles; lower-case navigation buttons.

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
- `NATIVE_LAND_API_KEY` — server-only; Native Land Digital's API key, for the
  ancestral lands under a place of birth or death (Step 27). Without it the
  tree shows only what families write themselves. See
  [Reference data — Native Land Digital](#reference-data--native-land-digital)

Until Supabase env is set, `proxy.ts` no-ops so the app still boots. With env
set, unauthenticated visits to `/tree` redirect to `/join`.

## Project structure

- `app/` — App Router pages. **Tree pages have plain addresses** and read
  the tree from a cookie (`lib/current-tree.server.ts`; the header's
  switcher, the header's admin count beside **account** (it opens the card
  that's waiting, on whichever tree it's on; Step 30.1), a notification's
  "View on tree" and "Also on" links set it via
  `app/actions/current-tree.ts`, an alert email's button sets it through
  `/account/admin`, and joining or founding a tree sets it
  too; `lib/tree-context.ts#currentAccess` resolves it, falling back to the
  member's home tree): `/tree` (React Flow canvas), `/tree/review`,
  `/people/new`, `/people/[id]/edit`, `/onboarding` (first-run on that
  tree: a member finds or adds themselves, opening on the search for the
  name they joined by when we know it, Step 30.7; the tree's founder gets four
  steps instead, `?step=invite|you|name|family` — `components/first-tree/`,
  Step 29); `/admin` redirects to the account page's Admin view, and
  `/account/admin?tree=<id>&section=<card>` is an alert email's button — a
  route that switches to that tree for a Root of it and opens its console
  at the card (Step 30.1, `lib/open-console.server.ts`). Site-wide: `/`
  landing (Step 28: signed in, **view your tree** / **start a tree
  (beta)**, which asks a beta reviewer; signed out, **sign in** / **request
  access** / **start a tree (beta)**, the last two in dialogs —
  `components/request-access.tsx`, `beta-waitlist-dialog.tsx`,
  `start-tree-button.tsx`), `/join` (`?next=` is where a signed-out visit
  was going, carried through the sign-in email and back; Step 30.1) (+
  `/join/[token]` invite accept — signed in, it adds a
  tree), `/auth/callback` + `/auth/confirm` + `/auth/auth-code-error`,
  `/trees` (every tree you're on, your type in each), `/trees/new` (found a
  tree of your own, once a beta reviewer has approved it), `/account` (sign-in address and display name under the
  title, then two-column cards: your trees, your entry's home and visitor
  hiding, your own details as an editable form — including your email,
  which lives on your entry (`people.email`, seeded from the sign-in address
  and private unless `people.email_visible`; the `tree_people` view withholds
  a hidden address from everyone but the entry's owner), one inbox per
  tree, delete-account — and, with `?view=admin`, the **admin console**
  of the current tree, or the first you run: stats, members, people from
  other trees, requests, disputes, requests to start a tree (beta
  reviewers only), invites incl. founder invites, share
  links, tree name, who else may view, export, delete the tree;
  `components/admin/admin-console.tsx`),
  `/request-invite` (public; `?tree=<slug>` asks that tree's Roots, and
  without one it's the request-access search),
  `/shared/[token]` (public read-only canvas), `/privacy`
- `app/actions/` — server actions (`auth.ts`: magic link (+ consent gate
  when it carries an invite) + sign out; `privacy.ts`: `exportTreeData` (admin JSON export) / `deletePerson`
  (admin erasure + storage cleanup) / `deleteAccount` (self-serve, reassigns
  contributions to a founding admin);
  `trees.ts`: `foundTree` / `renameTree` / `deleteTree`, `placePeople` /
  `respondToPlacement` / `removePlacement`, `setHomeTree`,
  `setHiddenFromVisitors`, `setTreeVisibility`, `joinTreeWithInvite`,
  `listPersonTrees` (Step 25);
  `invites.ts`: mint invite link, `sendDirectInvites` (bulk name+email
  invites), `sendFounderInvites` (Roots: someone founds a tree of their own),
  `sendClaimInvite` (invite someone to claim one entry); every tree-scoped
  action takes a `treeId` and checks the caller's role _there_
  (`lib/tree-context#membershipOf` / `rootOf`);
  `invite-requests.ts`: `requestInvite` (public, service-role write; a new
  request emails the tree's Roots, Step 30.1) /
  `approveInviteRequest` (mints the link, naming the entry the requester's
  name matched when the Root approves them as one, Step 30.3) /
  `declineInviteRequest`;
  `tree-requests.ts` (Step 28): `requestNewTree` (a member asks to start a
  tree), `joinBetaWaitlist` / `findFamilyTree` (public, service-role; a new
  ask or sign-up emails the beta reviewers, Step 30.1),
  `approveTreeRequest` / `declineTreeRequest` / `deleteTreeRequest` (beta
  reviewers);
  `people.ts`: `addPeopleWithConnections` (transactional multi-person + edge
  create), update person, drag-to-pin position, photo + document writes,
  signed URLs; `claims.ts`: `claimPerson` / `disputeClaim` / `resolveClaim` /
  `markNotificationsRead`; `entry-comments.ts`: `getEntryComments` /
  `addEntryComment` / `resolveEntryFlag` / `setEntryVerified`)
- `components/tree/` — `family-tree.tsx` React Flow canvas (generation lanes
  behind the cards, whose titles stay life-size when zoomed out —
  `laneTitleFit` — and pinned inside the canvas's left edge — `laneTitleLeft`;
  a child's descent line starts from a junction _derived from
  its parents' live positions_ — not a node — so it follows them as they are
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
- Ancestral lands (Step 27): `lib/native-land.ts` — pure parsing and wording
  of Native Land Digital's answer (`.test.ts`); `lib/native-land.server.ts` —
  `territoriesAt(lat, lng)`, the only caller of NLD; `app/api/ancestral-lands`
  — `GET ?place=<places.id>` for anyone signed in (members, and visitors
  from another tree); `app/shared/[token]/ancestral-lands` — the same for a
  share link, only about places its tree shows (Step 27.9);
  `lib/ancestral-lands.server.ts` — `landsAtPlace`, what both answer;
  `components/ancestral-lands.tsx` — the card's lands line and the form's
  field
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
  name + lifespan + initials, and whether someone has died
  (`personHasDied`); `lib/image.ts` — client-side photo downscale;
  `lib/first-tree.ts` — a founder's first run (Step 29): the steps and
  where each opens, the "Getting started" items, the founder's close family
  from a tree's lines, and the lines a quick-added relative gets
  (`closeRelativeEdges`; `.server.ts` loads it, `.test.ts`);
  `lib/tree-context.ts` — the per-tree context (Step 25): `requireTreeMember`
  / `requireTreeRoot` / `requireTreeSelfPerson` / `requireTreeAccess` (member
  or visitor) for pages, `membershipOf` / `rootOf` for actions, `listMyTrees`,
  `defaultTreeSlug`; `lib/tree-links.ts` — every tree path (`treeHref`,
  `adminHref`, `editPersonHref`, …); `lib/revalidate.ts` — revalidate the
  `/t/[slug]` layout after a write; `lib/placements.server.ts` — who a Root
  could bring over, and who they have
- `components/tree-bar.tsx` (tree switcher + account type + tree nav),
  `found-tree-form.tsx`, `home-tree-picker.tsx`, `join-tree-button.tsx`,
  `admin/admin-placements.tsx`, `admin/admin-tree-settings.tsx`,
  `admin/admin-delete-tree.tsx`, `tree/person-trees.tsx` ("Also on");
  `components/ui/skeleton.tsx` + `loading.tsx` skeletons
- `lib/auth.ts` — `getUser` / `getProfile` / `requireProfile` / `requireSelfPerson` (server-only; roles are per tree, see `lib/tree-context.ts`)
- `lib/site-url.ts` — `getSiteUrl()` for magic-link redirects and invite links
- Request alerts (Step 30.1): `lib/request-alerts.ts` — the caps and the
  new-ask test (`.test.ts`); `lib/request-alerts.server.ts` — emails a
  tree's Roots or the beta reviewers after the response, their addresses
  from `tree_root_emails` / `beta_reviewer_emails` (service role only);
  `lib/emails/access-requested.ts` / `tree-requested.ts`;
  `lib/admin-queue.ts` — the console's queue cards, where the header's count
  goes (`pickQueueTarget`) and the emails' button (`openConsoleHref`,
  `.test.ts`); `lib/safe-next.ts` — the same-origin `next` a signed-out
  visit carries through sign-in (`.test.ts`)
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

| Table                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trees`                  | A family's canvas (Step 25): `name`, URL `slug` (unique, follows the name), `created_by` = founder — **one founded tree per member** (partial unique index); created only by `found_tree` (once a beta reviewer has approved the member's request, Step 28) / a founder invite / the allowlist bootstrap, deleted only by `delete_tree`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tree_members`           | **The account type, per tree** (Step 25): `(tree_id, user_id, role)`, `role` ∈ `admin` \| `branch_admin` \| `member` (Root / Branch / Leaf; `leaf` retired in Step 34). Written by RPCs (`join_tree`, `set_member_role`, `remove_tree_member`) behind `tree_members_guard` (Roots set types; Root is permanent per tree)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tree_placements`        | Which trees show a person, and where the card sits there: `(tree_id, person_id, status active\|pending\|declined, pos_*)`. The home tree always has one (trigger); others come from `place_people`, and a member's own entry waits `pending` for their yes (`respond_to_placement`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tree_visibility`        | A Root opens their tree, read-only, to the members of another tree they're on: `(tree_id, viewer_tree_id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `profiles`               | `auth.users` row: `display_name`, `self_person_id` (one entry, wherever it's shown). No account type here: that is `tree_members.role`, per tree (the pre-Step-25 `profiles.role` was dropped in Step 25.6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `people`                 | Demographic nodes, **one row per person across all trees**. `tree_id` is the person's **home tree** — whose rules govern their details (Step 25; moved by `set_home_tree`). `hidden_from_visitors` blurs them to visitors. Card positions live on `tree_placements`, not here (the pre-Step-25 `people.pos_*` were dropped in Step 25.6). `owner_user_id` starts as `created_by` and moves on claim. `date_of_birth_precision` / `date_of_death_precision` (`day` \| `month` \| `year`, Step 17) say how much of each date is known — a partial date is stored on the first day of its period, CHECK-enforced, so year-only readers need no change. `place_id_birth` / `place_id_death` → `places(id)` (Step 4.5b; nullable, backfilled — legacy `city_of_birth` / `country_of_birth` / `place_of_death` text kept until reconciled). `ancestral_lands_birth` / `ancestral_lands_death` (Step 27): the family's own words for whose land each place is, ≤ 300 characters, asked for only where Native Land Digital maps no territory (Step 27.8); where NLD does, its names are shown instead, looked up live and never stored |
| `relationships`          | A fact about two people, not a tree (Step 25): a tree draws it when both ends are placed there; `tree_id` records the tree it was drawn on, and uniqueness ignores it. Directed `parent` edges; undirected `spouse` pairs (optional `marriage_date` / `is_divorced` / `divorce_date`, spouse-only by CHECK); siblings inferred                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `connection_suggestions` | Implied-connection prompts surfaced by the add-person flow (`suggested_type` spouse/parent/sibling_check, `source`, `status` pending/accepted/dismissed); UNIQUE (subject, related, type, source) = no re-prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `invites`                | Shareable tokens into one tree (`active` \| `accepted` \| `revoked`); `founds_tree` (Step 25) makes it a founder invite — redeeming plants a new tree with the redeemer as Root                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `invite_requests`        | Public invite asks — first/last name + email, `pending` \| `approved` \| `declined`, `invite_id` of the link minted on approval. Admin-only RLS; inserted server-side with the service role (no `anon` grant). One pending row per email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tree_requests`          | Asks to start a tree during the beta (Step 28): a member's (`user_id`) or a waitlist sign-up's (name + email only), `pending` \| `approved` \| `declined`, answered by a beta reviewer (`private.beta_reviewers`). A member's approval is their permission to `found_tree`; a sign-up's approval mints a founder invite (`invite_id`). Reviewers see and answer every row, a member only their own; members ask through `request_tree`, the waitlist is written with the service role. One pending ask per member and per waitlist address                                                                                                                                                                                                                                                                   |
| `claims`                 | Auto-approve / dispute / reject a person entry (`dispute_reason`, `resolved_by`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `notifications`          | In-app notices, **one inbox per tree** (`tree_id`, Step 25; `placement_requested` \| `placement_accepted` \| `placement_declined` added; `tree_request_approved`, Step 28; `placed_on_join`, Step 30.9); recipient-scoped RLS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `entry_comments`         | Comments and flags, **one board per tree** (`tree_id`, Step 25) (`is_flag`, `open` \| `resolved`, `resolved_by`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `documents`              | Metadata for private file uploads, **one bank per tree** (`tree_id`); `shared_across_trees` shows it on every tree the person is on — flipped only by the person or a Root of their home tree (`documents_guard`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `places`                 | GeoNames reference data (populated places + admin areas) for birthplace autocomplete; not tree-scoped — read by any member, written only by the import script                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `historical_names`       | Curated period names for a place/country over a date range (Step 4.5d); matched by `place_id` then `country_code` against a birth/death year. Read by any member; seeded by migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pets`                   | Companion animals — a deliberately thin, non-human entry: name, species (`cat` / `dog` / `other` + `species_label`), `year_born` / `year_died`, an optional exact `birth_date` (must agree with `year_born`) and an optional GeoNames place of birth (`place_id_birth` FK + denormalised `city_of_birth` / `country_of_birth`, exactly like a person) with `ancestral_lands_birth` (Step 27.7; as on a person, only where Native Land Digital maps nothing), photo, and a `pos_dx` / `pos_dy` nudge. No lineage, claims, documents, or verification                                                                                                                                                                                                                                                                                                                                                                |
| `pet_companions`         | Which people a pet lived with (`pet_id` + `person_id`). Many-to-many, undirected, no lineage meaning; a trigger deletes a pet once its last companion goes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pet_comments`           | A plain comment thread on a companion (`pet_id`, `body`, `created_by`). No flags, no open/resolved lifecycle, no verification, no notifications; author or anyone who `can_edit_pet` may delete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

**Trees (Step 25):** every rule below now reads _on a tree_. "A Root" means a
Root of the tree in question (`private.is_root_of(tree)`), and a Leaf adds on
their own line as the tree being written to draws it (`private.line_ids`,
Step 34). For someone not on the tree the role checks answer false, never
null (Step 35), with no exception, so a guard can safely say
`if not private.is_root_of(x) then raise`; `can_edit_relationship` and
`can_edit_pet` ask `is_tree_member` to refuse someone who has left. A
person's **details** follow
their **home tree** (`private.home_tree`): its Roots and Branches, plus the
person themselves — who controls their own entry on every tree. What another
tree may do with a person it shows is place and arrange the card, keep its
own comment board and document bank, and draw lines between people it
shows. A line may be changed by whoever drew it, or a Root (or a Branch with
both ends on their side) of any tree that shows both ends. Members of a tree
see its placements; members of a tree it's been opened to (`tree_visibility`)
see it read-only, minus anyone `hidden_from_visitors`, who comes back as a
bare placement the canvas blurs (`tree_people.blurred`). The full model and
the per-tree matrix: [`docs/trees-and-permissions.md`](docs/trees-and-permissions.md).

**RLS:** every public table. Members read rows in trees they belong to
(`tree_members`; a person when some tree they're on shows them,
`private.can_see_person`). Writes use
`profiles.auth_user_id = auth.uid()`. Person edits (`private.can_edit_person`):
current `owner_user_id`, an admin, the original `created_by` while the entry is
still unclaimed (owner unchanged, no approved claim), **or** a branch admin
anywhere on their own branch (Step 17); and anyone their own `self_person_id`
entry. Deletes (`private.can_delete_person`, Step 22.3): a Root anything; a
Branch or a Leaf an entry they created that is still theirs — owner
unchanged, no claim of any status, nobody's own entry, not their own — and
only while every connection, comment, document and companion on it is theirs
too; otherwise "ask a Root".
A claim moves
`owner_user_id` to the claimant, so the creator then loses edit rights until an
admin reverses the claim.

**Branches (Step 17, re-anchored in 18.1, narrowed in 22.2):** a
`branch_admin` curates their part of one Root's side of the tree. A branch is
measured from one person by the same up-then-down walk as the bloodline gate
(`private.branch_ids`): climb `parent` edges to every ancestor, descend from
that whole set, then add the partners those people married — one step, never
walked through. So a spouse is on the branch and a spouse's parents are not. A
Branch tends **the part of a Root's side they are related through**: their own
branch, kept to the branches of every Root whose branch has the Branch's own
entry on it, by blood or marriage (`private.root_person_ids` →
`private.own_branch_ids`; `lib/branch.ts#branchReach`). So Arzu tends Raiya's
father's family, not her mother's, and a Branch's own in-laws' families never
come in. Related to both Roots (their child), they tend their part of both
sides; related to none, they tend nothing and edit like a Leaf. (18.1 had
given a Branch the Root's whole side; 22.2 took the other grandparents'
families back out.) Two limits: another member's own entry (`self_person_id` or a
settled claim) is never theirs to edit, and a connection needs **both** ends on
the branch (`private.can_edit_relationship`) — one end alone would let them
redraw a line into someone else's family. When a Branch changes an entry a
Root created or owns, the edit publishes at once and the Root can undo it
(**Branch edits and the Root's undo**, below). Nothing else moves: deleting
what others added, setting `lineage_type` and the admin console stay
admin-only.
`lib/branch.ts` mirrors the rule for the UI; the database decides.

**Account types (Step 18; three since Step 34):** three kinds of member,
named for the tree they grow. `lib/account-types.ts` is the model — the only
place a stored key becomes a name, and where each type's reach is written
down (`entries`, `connections`, `companions`: `tree` / `branch` / `own`;
`addRelatives`: `tree` / `line`; `claimInvites`; `deletes`; `runsTree`) — so
a name or a plan's limits can change without a migration.

| Stored `role`  | Name       | Reach                                                                                                                                                                                                                                                                                              |
| -------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`        | **Root**   | Everything, plus running the tree: members and their account types, invites, share links, deletes, lineage, verification                                                                                                                                                                           |
| `branch_admin` | **Branch** | Every entry and connection on their part of the side of the Root they're related to (see **Branches**); invites relatives as Leaves, and invites someone to claim an unclaimed entry on that side                                                                                                  |
| `member`       | **Leaf**   | Adds relatives on their own line — their ancestors, everyone descended from them, and the people those relatives married; edits what they add, the lines they draw, and their own entry. Invites relatives as Leaves, and invites someone to claim an entry they added. New members join as Leaves |

The keys kept their old values on purpose: renaming them would rewrite every
`role = 'admin'` test in the database for no visible change. So `member`,
Canopy's key in Step 18, is the Leaf's now: Step 34 retired the first Leaf
(`leaf`, their own entry and nothing more), moved everyone who was one up to
`member`, and gave Canopy the name. A Root switches anyone else between Leaf
and Branch on `/admin` (`AccountTypePicker` → `setAccountType`), or makes
them a Root (Step 22.5, after a confirm). A Root
is for good: nobody demotes or removes one, another Root or themselves —
`profiles_protect_role` raises `ROOT_IS_PERMANENT` on any change to a Root's
role, `profiles_delete` excludes Root rows, and `admin_delete_member` already
refused them. A Root may still delete their own account from `/account`, but the tree is
never left without a Root: the only Root must first choose another member to
take over (`DeleteAccount` → `deleteAccount(successorId)`), who is made a
Root — for good — and inherits what the departing Root added. A new Root also becomes one of
the Roots whose sides the Branches tend (`private.root_person_ids`). Who may
invite follows from the type alone — the per-member `can_invite` grant was
retired, and the column dropped, in Step 22.1 — and every invite link makes
someone a Leaf (see **Invites join as Leaves** under Auth & invites).

A Leaf's own line is held in the database, not just the UI (Step 34):
`add_people_with_connections`, the one RPC through which anyone but a Root
adds people, measures the Leaf's line once the call's lines are drawn
(`private.line_ids`) and refuses any new entry off it with `OWN_LINE`.
Measured after, a Leaf can add a great-grandparent above a grandparent on
their line, and then that great-grandparent's other children. The line is
the Step 17 branch walk from the Leaf's own entry, with the brothers and
sisters of the Leaf and their ancestors counted when a sibling line was
recorded without the parents they share; the bloodline gate still applies
on top. A Leaf with no entry yet adds only through the onboarding call that
creates it. The UI mirrors the rule (`lib/branch.ts#lineIds`,
`canAddRelativeOf`): "Add a relative of …" only from someone on their line,
and `/people/new` offers only them to connect from and says why
(`OWN_LINE_REFUSAL` when the database refuses anyway: from a cousin a new
child is on the line, a new parent isn't).

The brand lives in `components/account-type-badge.tsx` (a mark per type on
lucide's 24px grid — a trunk splitting into roots, a limb in leaf, a leaf —
and `AccountTypeBadge`) and `components/account-type-guide.tsx` (a card per
type listing what it can do, read off `describeAccess`), coloured by the
`--account-{root,branch,leaf}` tokens in `globals.css` (bark, heartwood, new
growth; each ≥ 5:1 on its own tint in both themes). Canopy's crown green
stays as `--canopy`, the colour of things done. `/account` shows the
member's own card; `/admin` → Members shows all three.

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

Helpers live in the unexposed `private` schema (`role_in`, `is_root_of`,
`is_branch_of`, `is_tree_member`, `can_edit_person`, `branch_ids`,
`line_ids`, `root_person_ids`, `own_branch_ids`, `is_on_own_branch`,
`can_see_documents`, `person_is_someones_own`, `can_edit_relationship`,
`can_edit_pet`, `can_delete_person`, `revision_fields`, `notify_edit`,
`member_label`).

**Branch edits and the Root's undo (Step 22.4):** there is no approval queue.
When a Branch edits an entry that a Root created or owns (and that isn't the
Branch's), `person_edit_notify` keeps the edit in `public.entry_revisions`:
just the changed fields (`private.revision_fields` — names, sex, dates,
places, death details, photo and its framing), as they were (`before`) and as
the Branch left them (`after`). The Root's `entry_updated` notification names
the Branch and carries `revision_id`; its **Undo this change** button calls
`revertEntryEdit` → `public.revert_entry_edit`, which puts back each field
that still holds the Branch's value and leaves any field changed since alone
(`NOTHING_TO_REVERT` when all have moved on, `ALREADY_REVERTED` on a second
click), then tells the Branch (`edit_reverted`). Revisions are readable by
Roots only. Connections, companions and card positions aren't revisioned —
a Branch can only draw a line with both ends on their side, and the
notification still says what changed.

**Permissions matrix (Step 22; three types since Step 34):** the whole
picture in one place. The
database enforces every row; `lib/account-types.ts` (`describeAccess`, shown
by the account-type cards on `/account` and `/admin`) and `lib/branch.ts`
mirror it for the UI.

|                                                    | Root                                                                                                            | Branch                                                                       | Leaf                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| See the tree, comment, flag, claim their own entry | ✓                                                                                                               | ✓                                                                            | ✓                                    |
| Edit entries                                       | Every entry                                                                                                     | Their part of a Root's side (not another member's own), plus what they added | What they added, and their own       |
| Branch edits to a Root's entries                   | Told; one-click undo                                                                                            | Publish at once                                                              | —                                    |
| Change connections                                 | Any                                                                                                             | Both ends on their side, or ones they drew                                   | Ones they drew                       |
| Companions                                         | Any                                                                                                             | On their side, or ones they added                                            | Ones they added                      |
| Add relatives                                      | ✓                                                                                                               | ✓ (bloodline gate)                                                           | On their own line (bloodline gate)   |
| See documents                                      | Every entry                                                                                                     | Their side, members' own entries included                                    | Entries they own                     |
| Delete entries                                     | Any                                                                                                             | Unclaimed ones they added, while nobody else has built on them               | Same as Branch                       |
| Invite relatives                                   | As Leaves                                                                                                       | As Leaves                                                                    | As Leaves                            |
| Invite someone to claim an entry                   | Any unclaimed, living entry, as a Leaf                                                                          | Unclaimed on their side, as Leaves                                           | Unclaimed ones they added, as Leaves |
| Change account types                               | Anyone not a Root: Leaf, Branch, or Root (for good)                                                             | —                                                                            | —                                    |
| Demote or remove a Root                            | Never, themselves included; a Root may delete their own account, handing over to a new Root if they're the last | —                                                                            | —                                    |
| Admin console, lineage, verification, share links  | ✓                                                                                                               | —                                                                            | —                                    |

## Auth & invites (Step 3)

- **Magic-link only** (`supabase.auth.signInWithOtp`). `proxy.ts` redirects
  unauthenticated visits to protected routes → `/join?next=<where they were
  going>` (Step 30.1: `lib/safe-next.ts` takes only a same-origin path); the
  magic link carries `next` through `/auth/confirm`, so signing in lands
  there — an alert email's console button is opened on the spot
  (`signInLanding`). Authenticated users without a member profile →
  `/join?status=pending`.
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
- **The name someone joins by (Step 30.7, `lib/joining-name.ts`)**: an
  emailed invite's request row goes when it's redeemed, so the new auth
  account keeps its first and last name (`user_metadata`, set by
  `signInWithInvite`'s `createUser`). A bare link's form asks for a first
  and last name beside the email (checked as the request forms check them)
  and `signInWithOtp` keeps them the same way (`options.data`, written only
  for a new account); `completeEmailSignIn` reads them back and names the
  new profile after them rather than the address. `/onboarding` then opens
  on what it already knows (`onboardingStart` in
  `lib/self-match.server.ts`): those halves while they still make up the
  display name, else the display name split (`namePrefill`), never an
  address's local part — and with both halves it searches on the server and
  opens on "Is one of these you?" or "We couldn't find you". On a tree
  nobody is on yet it opens on adding themselves, since there's nobody to
  find. Nobody who has died is listed there or can be claimed as "you"
  (Step 37), as on the canvas (Step 36).
- **Invite tokens** (`public.invites`): whoever may invite mints a
  single-use, 14-day link `"/join/<token>"` by inserting a row directly under RLS
  (`can_invite_as`). `redeem_invite` (SECURITY DEFINER) creates the member
  `profiles` row with `invited_by_user_id = invite.created_by` and flips the
  invite to `accepted`. `invite_preview(token)` is the only pre-auth RPC.
- **Invites join as Leaves (Step 18.2; one type since Step 34)**: every
  invite carries `invites.joins_as`, always `member` — the Leaf — and
  `redeem_invite` joins the tree with it. Anyone on the tree may mint one:
  a Root, a Branch or a Leaf (`private.can_invite_as`). Branch and Root are
  never given by link, only by a Root afterwards. The `invites_guard`
  trigger keeps changing a link's claim target (`person_id`) to Roots, so
  nobody can aim a link at someone else's entry.
- **Joining with an entry of your own** (Step 30.9,
  `20260923073000_place_own_entry_on_join`): when `redeem_invite` redeems an
  ordinary invite for someone who already has their own entry, it places
  that entry on the tree they've joined, active, with themselves as
  `placed_by`: accepting is their say-so. A pending or declined placement
  left by an earlier request becomes active. Each of the tree's Roots gets a
  `placed_on_join` notice with **View in admin**, which switches to that tree
  and opens "Who This Tree Shows", where they can take it off. The member
  lands on their entry (`self_placed`). A claim invite keeps just the vouch,
  a founder brings their entry over on the first run (Step 29), and if
  placing fails they still join.
- **Invite someone to claim an entry** (`20260904100000_invite_to_claim_entry`,
  widened in Step 22.1): an invite with
  `person_id` set names the entry on `/join/<token>` and lets whoever redeems
  it claim that entry without the name match. Since Step 30.2
  (`20260923070000`), redeeming it claims the entry there and then for
  someone with no entry of their own: `redeem_invite` runs
  `private.claim_as_self` — the checks and effects of `claim_person_as_self`,
  creator's notice and dispute included — with the invite's vouch standing
  in for the name match, names a new profile after the entry, and they land
  on it (`/tree?person=<entry>`, `joinedTreeHref` reading
  `redeem_invite_tree`'s `self_placed`, from every accept path). If the entry
  has meanwhile been claimed, deleted, taken off the tree or marked as having
  died (Step 37), they join anyway and land on onboarding, where
  `search_self_candidates` lists a vouched entry first (never someone who has
  died) and `claim_person_as_self` takes it without the name match. A
  member who already has an entry keeps just the vouch (`private.claim_vouches`,
  honoured by the canvas's `claim_person` while their own entry is a
  placeholder they added, Step 36). `private.can_invite_to_claim`
  says whose entry that may be: one the inviter can edit (`can_edit_person`)
  that nobody is behind yet — owner still the creator, no approved claim, no
  member's own — and whose person is living: not marked as having died, and
  no date of death (Step 37). So a Root anywhere, a Branch on
  their side or among their additions, a Leaf among their additions;
  `lib/branch#canInviteToClaim` mirrors it for the entry panel. Whoever
  accepts joins as a Leaf. `sendClaimInvite` asks `public.can_invite_to_claim` as the
  inviter, then writes with the service role, since the link is bound to the
  address (`invited_email`) and signs it in. A Root approving a request for
  access can also make it a claim invite (Step 30.3): for an entry placed on
  the request's tree that the requester's name matches (see Invite requests
  below). Roots invite from
  `/admin`; everyone else gets an "Invite a relative" card on `/account`, and
  every invite form says the newcomer joins as a Leaf (`JoinsAsNote`). The add-relative form asks
  for the new relative's email too (Step 31) and, once the entry is saved,
  sends this same invite for it, unless they're deceased. `/join/<token>`
  tells them what a Leaf is before they sign up.
- **Invite requests** (`public.invite_requests`): anyone can ask from `/`
  ("request access") or `/request-invite` with first name, last name, and
  email. Without a tree in hand, `findFamilyTree` looks for one first
  (Step 28, `public.trees_matching_name`, service role only): a strong
  name match (onboarding's 0.85) on a living, unclaimed entry nobody has
  hidden from visitors, returning the **trees**, never the person. Found,
  they ask that tree's Roots; not found, they're told to ask a relative to
  invite them directly, or to join the waitlist to start a tree. A share
  link's button names its tree (`?tree=<slug>`) and skips the search;
  `requestInvite` no longer falls back to the first tree. The row is written
  by the `requestInvite` server action using the service-role client, so the
  table needs no `anon` grant or insert policy and cannot be read or enumerated
  from the browser. Admins review pending requests on `/admin`; approving mints
  a normal single-use invite link (attributed to the reviewing admin) and
  emails it to the requester via Resend (`lib/email.ts` +
  `lib/emails/invite-approved.ts`, needs `RESEND_API_KEY`) — if the send
  fails, the invite is still valid and the admin can copy the link and send it
  themselves; declining just closes the request. A new request emails every
  Root of the tree at once (Step 30.1, `lib/emails/access-requested.ts`, sent
  with `after()` so the form never waits or fails on it), with a button to
  that tree's "Requests for Access"; asking again emails nobody. The form is
  public, so alerts are capped at 5 an hour and 20 a day per tree, counted
  from pending rows; past that requests still queue, silently. Each pending
  request also lists the entries on its tree that the requester's name
  matches (Step 30.3, `public.invite_request_candidates`, Roots of that tree
  only): onboarding's scoring (`private.self_candidate_score`), living
  entries placed on the tree that nobody is behind yet, best five, each with
  onboarding's lifespan, birthplace and parents to recognise them by.
  "Approve as <name>" makes the invite a claim invite for that entry
  (`person_id`, which `invites_guard` lets a Root set), after
  `approveInviteRequest` has asked the list again
  (`lib/request-candidates.server.ts`), so an entry claimed or gone since
  can't be named. Accepting claims it and lands them on it (Step 30.2); the
  join page says so, and the approval email and a resend name the entry.
  "Approve without an entry" (just "Approve & send invite" when nothing
  matches) works as before: they find or add themselves on onboarding.
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
  pointing at `/request-invite`. Each view is counted once the page has gone
  out: `after()` calls `record_share_link_view` (service role only), which
  adds one in SQL (Step 33). Only a browser's visit counts: a link preview
  (iMessage, WhatsApp, Slack…) or another bot gets the page but no view
  (33.7, `countsAsView`). The admin console shows the count and the date of
  the last view (33.6). `lib/share-links.ts` holds the pure
  usable/expired/revoked logic and `countsAsView` (`.test.ts`).
- **Starting a tree is by request during the beta** (Step 28,
  `public.tree_requests`): a signed-in member presses "start a tree
  (beta)" (home page, `/trees`, `/trees/new`) and `request_tree` files one
  ask; a signed-out visitor joins the waitlist with a name and email
  (`joinBetaWaitlist`). **Beta reviewers** — `private.beta_reviewers`
  (email): the build owner and, since `20260923043000`, Raiya Suleman; add
  a row (by migration) to share the queue further —
  answer both from "Requests to Start a Tree" on any admin console they run,
  counted in the header badge — and emailed to every reviewer who runs a tree
  the moment a new one lands (Step 30.1, `lib/emails/tree-requested.ts`;
  the waitlist capped at 10 an hour and 30 a day, members not at all, since
  each has one ask and an account). Approving a member lets `found_tree` through
  for them (it raises `TREE_REQUEST_NEEDED` otherwise), puts
  `tree_request_approved` in their inbox (trigger) and emails them
  (`lib/emails/tree-request-approved.ts`, via the general `renderEmail`
  shell). Approving a sign-up mints a founder invite on the reviewer's
  console tree (`lib/founder-invites.server.ts#mintFounderInvite`, shared
  with `sendFounderInvites`), recorded in its Sent invites as `request` and
  emailed with `lib/emails/founder-approved.ts`; resending a founder invite
  now keeps founder wording. `my_tree_request()` says where an ask stands
  (`none` | `pending` | `approved` | `founded`) and drives every "start a
  tree" button. A Root's founder invite still needs no request.
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

- **Consent where someone joins**: a required checkbox linking to `/privacy`
  sits on each way into a tree — asking to join (`requestInvite`), accepting
  an emailed invite (`acceptInvite`; already given by someone who asked), and
  the sign-in form a bare invite link shows (`requestMagicLink` with an
  invite). A plain sign-in doesn't ask (Step 30.4,
  `lib/privacy-consent.ts`): it's a member coming back, so the form only
  links to the notice. `/privacy` is in `proxy.ts`'s public prefixes so it is
  readable pre-auth.
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

## Reference data — Native Land Digital

The ancestral lands under a place of birth or death (Step 27) come from
[Native Land Digital](https://native-land.ca) (NLD), a non-profit that maps
Indigenous territories, languages and treaties. It's the only broad source of
*traditional territories*: the truly open alternatives (the USFS Royce
land-cession layer, CIRNAC's Historic Treaties) cover treaties and land
cessions, not whose land a place is.

- **Terms.** The API key comes with NLD's
  [Data Sovereignty Treaty](https://api-docs.native-land.ca/data-sovereignty-treaty):
  non-commercial use only (no subscription, membership or bundled service
  that charges for it); NLD credited as the source, with Indigenous
  communities acknowledged as the stewards of the data; and **no storing or
  redistributing its data without NLD's permission**. If Ancestree ever
  charges, this needs NLD's written permission first.
- **So nothing of NLD's is saved.** `lib/native-land.server.ts` asks
  `native-land.ca/api/index.php?maps=territories&position=lat,lng&key=…`
  each time a card or form shows a place (`cache: "no-store"`; the route
  answers `Cache-Control: no-store`; the browser keeps answers in memory only
  while the page is open).
- **NLD first, the family's words only where NLD has none** (Step 27.8).
  Where NLD maps the place, the form shows its names as they are, with no
  box to fill in, and the card shows them too. Where NLD maps nothing, or
  can't be asked (a hand-added place has no coordinates), the form offers
  a box captioned "Our database does not contain a distinct ancestral name
  for this land. Please include whose land this is." What's written there
  (`people.ancestral_lands_birth` / `_death`, `pets.ancestral_lands_birth`)
  is the family's own, and the card shows it. Read-only trees follow the
  same rule (Step 27.9): a visitor from another tree asks as themselves, and
  a share link asks through its own route (below).
- **Credit.** Every card that shows NLD's names says "From Native Land
  Digital"; opening it gives NLD's link, the stewardship acknowledgement,
  and NLD's own disclaimer that the map isn't a legal or official record of
  boundaries.
- **What gets asked.** A person's place of birth and death, and a
  companion's place of birth (Step 27.7). Only GeoNames populated places
  with coordinates (`feature_class = 'P'`) are asked about; a hand-added
  place has none, so it shows only the family's words. A share link's
  viewer isn't signed in, so its cards ask
  `GET /shared/<token>/ancestral-lands?place=<id>` (Step 27.9), which
  answers only while the link works and only about a place its cards show
  (a birth or death place on its tree, or a companion's birthplace), so a
  link can't be used to ask NLD about anywhere else.
- **Coverage.** Strong in North America: Toronto gives Anishinabewaki,
  Ho-de-no-sau-nee-ga (Haudenosaunee), Mississauga, Mississaugas of the Credit
  First Nation and Wendake-Nionwentsïo. Checked 2026-09-22: nothing for
  Kampala, Nairobi, Dar es Salaam, Mumbai or London, where the card shows
  only what a family writes.
- **Key.** `NATIVE_LAND_API_KEY`, from an account at
  <https://native-land.ca/auth/signup> (free; agreeing to the treaty is part
  of signing up).

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

- **Step 37 — Onboarding never offers or accepts someone who has died as
  "you"** (ad-hoc follow-up to Step 36; migration
  `20260923110000_self_claims_refuse_the_dead`). Step 36 kept the canvas's
  "Is one of these you?" card and "This is me" away from anyone marked as
  having died or given a death date, but onboarding's find-yourself search
  didn't follow: `search_self_candidates` listed every unclaimed entry the
  name matched, the dead included, and `claim_person_as_self`
  (`private.claim_as_self`) made the one picked the newcomer's own entry.
  Nothing was deleted on that path, but a newcomer named after a late
  grandparent was offered the grandparent (since Step 30.7, as onboarding
  opened, with nothing typed) and one tap made them the grandparent. A
  claim invite accepted after its entry was marked as having died did the
  same through `redeem_invite`. Now the search lists nobody who has died,
  vouched or not (a vouched entry still comes first), and `claim_as_self`
  refuses one with `claim_person`'s message, which onboarding words as
  "That entry is marked as having died, so it can't be yours."
  (`friendlySelfClaimError`, moved into `lib/self-match.ts` to be tested).
  Such a claim invite still joins them to the tree, for onboarding to take
  from there. `private.can_invite_to_claim` refuses a death date as well as
  the flag (no entry on live has one without the other), and the entry
  panel's mirror reads both (`personHasDied`). **Verified:** rehearsed
  rolled back on live in three phases (live functions, the search alone,
  the whole migration) with throwaway members and a living namesake, one
  marked as died, one with only a death date, vouched entries living and
  dead, and claim invites. Before, the search listed all three namesakes,
  each could be claimed, as could the vouched dead one, and accepting a
  claim invite whose entry had since died made the newcomer that person;
  the search alone still let a direct claim through, so both halves are
  needed. After, only the living are listed, vouched first; the dead and
  the death-dated are refused, a dead entry on another tree still answers
  "on a different tree", the invite joins them without the claim, and
  neither a Root nor a Leaf can invite anyone to claim a death-dated entry
  (a Leaf's direct invite insert is refused too). The same 19 checks pass
  against the applied functions, whose bodies md5-match the file. On a dev
  server, a throwaway newcomer who accepted an invite to a throwaway tree
  holding three of their namesakes (living, marked as died, a death date
  only) was shown just the living one; marking it as died under the open
  list made "This is me" answer with the message above and a new search
  find nobody, and once it was living again the claim went through to
  `/tree`. 644 tests pass. Nothing from the rehearsal persisted, and every
  throwaway row was deleted.

- **Step 30.7 — Onboarding opens on the name we already have** (Step 30,
  first-time journeys; no migration). Onboarding asked everyone to type
  their first and last name and tap Search, though the invite, request or
  waitlist row usually held it (and the profile was named from it one
  screen earlier). Now the name is kept on the new auth account
  (`user_metadata`), since the request row goes when the invite is
  redeemed: `signInWithInvite` stores the request's name, and a bare invite
  link's form asks for first and last name beside the email
  (`signInWithOtp` `options.data`; a plain sign-in stays email-only).
  `completeEmailSignIn` and `/auth/callback` read it back
  (`lib/joining-name.ts`), so a bare link's profile is named after the
  person, not the address. Onboarding prefills that name (or splits the
  display name with `namePrefill`, never an email's local part) and, when
  it has both halves, searches on the server before the page renders
  (`lib/self-match.server.ts#onboardingStart`), so it opens on "Is one of
  these you?" or "We couldn't find you", with nothing typed. An empty tree
  opens straight on adding yourself, and a non-Root there reads that a Root
  adds the first person. The bare-link form keeps its privacy tick through
  a retry after an error. **Verified:** 639 tests pass; on a dev server with
  throwaway accounts, an approved-request invite opened on the match with
  nothing typed ("This is me" → /tree), and a bare invite asked for name and
  email, carried them through the email loop (token minted for the throwaway
  address) and greeted them by name with the match shown. All throwaway rows
  were deleted.

- **Step 30.9 — Accepting an invite shows your own entry on that tree**
  (Step 30, first-time journeys; migration
  `20260923073000_place_own_entry_on_join`, live since 2026-09-22). A
  member who already had their own entry and accepted an invite to another
  tree joined it and nothing more: the entry stayed off the new canvas,
  onboarding told them a Root could bring it over, with nothing to press,
  and nobody on that tree knew to. Now `redeem_invite` places the entry on
  the tree they've joined, active, since accepting is their say-so, with
  themselves as `placed_by`; a pending placement from an earlier request
  becomes active. They land on it (`self_placed`). Every Root of the tree
  gets a `placed_on_join` notice ("… accepted your invite to …", or "…
  joined … with an invite from …") with **View in admin**, which switches
  to that tree and opens "Who This Tree Shows", where they can take it off.
  A claim invite keeps just the vouch (Step 30.2), a founder brings their
  entry over on the first run (Step 29), and if placing fails they still
  join. The 30.9 agent stopped mid-step; its optional part, a "Sign in
  instead" link that carries the invite through sign-in, was unfinished
  and is left for a follow-up (30.7 is changing the same sign-in code).
  **Verified:** rehearsed on live in a rolled-back transaction: an
  ordinary invite placed the entry and told both Roots; a claim invite, a
  new user, an entry already shown, a forced placement failure and a
  founder invite behaved as before; a pending placement became active. On
  a dev server with throwaway accounts: the member pressed Join and landed
  on the new tree's canvas, opened on their entry, whose home stayed put;
  the Root, looking at another tree, saw the notice, and View in admin
  switched trees and opened "Who This Tree Shows" listing the entry with
  Remove. 612 tests pass. All throwaway rows were deleted.
- **Step 36 — "This is me" can't swallow a member's own entry** (ad-hoc
  fix, found in Step 30.3's end-to-end check; migration
  `20260923100000_claim_merges_only_placeholders`). The canvas's "Is one of
  these you?" card (`person_claim_candidates`) offered a member who already
  has their own entry every unclaimed same-name entry on a tree they share,
  the dead included, and "This is me" (`claim_person`) merged their entry
  into the one they picked and deleted it. That merge was built for a
  placeholder made at onboarding, but since Steps 30.2 and 30.3 a member's
  entry is usually one a Root made, with their family on it. Reproduced on
  live (rolled back): a member who had accepted a claim invite was offered
  their late namesake grandparent, and one tap moved their child and spouse
  onto the grandparent, dropped their own parent line (it doubled the
  grandparent's) and deleted their entry; a reversed dispute can't bring it
  back. 7 of the 8 members with an entry were exposed, though none had a
  namesake yet. Now `private.is_own_placeholder` says whether an entry is one
  the member made for themselves that nobody else has built on (every line,
  document, note, companion, bloodline anchor and placement on it theirs, no
  edit or claim by anyone else: `can_delete_person`'s "built on" test).
  `claim_person` merges only such a placeholder, never into an entry marked
  as having died or given a death date, and `person_claim_candidates`
  offers nothing otherwise and nobody who has died, so the card and the
  panel's "This is me — claim it" (both read it) appear only where the
  claim would go through. The merge also carries the placeholder's
  companions and bloodline anchors now; deleting it used to unlink its pets
  (deleting any it was the only person of) and drop a founder's anchor.
  "This is me" asks first, in the card and the panel alike, naming who
  moves (`lib/claim-merge.ts`: "Your parents … and your partner … will be
  connected to this entry instead, and the entry you added for yourself
  will be removed. This can't be undone."), and a refusal points to a Root
  for a duplicate. **Verified:** rehearsed rolled back on live in three
  phases (live functions, the card half alone, the whole migration) with a
  member holding a claimed Root-made entry, one with a bare placeholder and
  one whose placeholder the Root had built on. The card half alone still
  let a direct `claim_person` delete a real entry, so both halves are
  needed; with both, real entries are refused and untouched, the dead and
  the death-dated refused, and a real duplicate merges with its lines, dog
  and anchor. The placeholder test turns false for each kind of row anyone
  else made and stays true for the member's own; anon can call neither
  RPC and nobody can call the helper. Applied, recorded version fixed, all
  three function bodies md5-match the file; the suite re-run against live
  gave the same answers, and as each live member the card still offers
  nobody anything. On a dev server with a temporary fixture page (deleted),
  the card and the panel both asked first, named the parents and partner,
  and Cancel backed out. 612 tests pass. Nothing was kept on live.
- **Step 34 — Three account types: Root, Branch and Leaf** (ad-hoc
  request; migrations `20260923090000_three_account_types`, and
  `20260923091000_retire_leaf_key` once this code is serving). The first
  Leaf, who could keep only their own entry up to date, is retired, and
  Canopy is called Leaf now. The stored keys stay: `member` is the Leaf,
  and everyone who was a Leaf on any tree (one member) moved up to it. A
  Leaf keeps what Canopy could do, except that new entries go on their own
  line only: their ancestors, everyone descended from them, and the people
  those relatives married (`private.line_ids`: the Step 17 walk from their
  own entry, plus brothers and sisters recorded without the parents they
  share). It is measured once the new lines are drawn, so a Leaf can add
  great-grandparents and then their other children;
  `add_people_with_connections` refuses anything else with `OWN_LINE`, and
  the bloodline gate still applies on top. The canvas offers "Add a
  relative of …" only from someone on a Leaf's line (`lib/branch.ts#lineIds`,
  `canAddRelativeOf`), and `/people/new` lists only them to connect from and
  says why. Everyone who can invite, Root, Branch or Leaf, invites as a
  Leaf: the Canopy/Leaf choice is gone from every invite form
  (`JoinsAsNote` says it instead), and so are the Leaf badges on the admin's
  invite lists and the members table's "Invites as" column. A Root makes a
  Leaf a Branch from the members table, as before; the picker offers Root,
  Branch and Leaf, and a Leaf's account page says a Root can make them a
  Branch. The old Leaf's guards (`people_leaf_guard`,
  `relationships_leaf_guard`, `is_leaf_in`) and the onboarding mode that
  kept a Leaf to their own entry are gone. Canopy's crown mark went with
  it; its green stays as `--canopy`, the colour of things done. The first
  migration keeps a shim for the app that was live when it was applied: a
  `leaf` that app writes is stored as `member`. The second removes it and
  narrows the check constraints once this code is live. **Verified:**
  rehearsed rolled back on live, applied, every function body md5-matches
  the file, and the same 22 checks passed again on the applied state as
  Aly, Rehan, Arzu, Aalim and a throwaway new member. Aly added a
  great-grandparent above Hussein, then that great-grandparent's other
  child, and a sibling recorded only as a sibling; a parent of Safia and a
  child of Raiya's alone were refused; Rehan, the old Leaf, added his own
  child and could draw lines; Arzu, a Branch, isn't held to her line; a
  Root setting the retired `leaf`, and an invite the old app sends as
  `leaf`, both came out `member`; a new member couldn't add before their
  own entry, and could onboard as Aly's child. 602 tests pass;
  type-check, lint and build are clean. On a dev server as a Root, the
  members table showed Aly, Ashif and Rehan as Leaves with no "Invites as"
  column, the picker offered Root, Branch and Leaf, the guide had three
  cards, both invite forms said they join as a Leaf, and the canvas marked
  them with the leaf. A throwaway page rendered the canvas and the add
  form as Aly: "Add a relative of Minaz" and "of Raiya" were offered,
  Safia's card offered none, and the form listed Aly's own family and
  Raiya but no Sulemans. The page was deleted.
- **Step 30.3 — Approve a request as the entry it matched** (Step 30,
  first-time journeys; migration `20260923071000_approve_request_as_claim`).
  Request access had already matched a newcomer to an entry on the tree,
  yet once a Root approved them they typed their name again at onboarding
  and searched for that same entry. Now each pending request on the admin
  console lists the entries on its tree that the requester's name matches
  (`public.invite_request_candidates`, Roots of that tree only):
  onboarding's scoring (`private.self_candidate_score`), living entries
  placed on the tree that nobody is behind yet, best five, with the
  lifespan, birthplace and parents onboarding shows ("close match" below
  0.85). "Approve as <name>" makes the invite a claim invite for that entry
  (`person_id`) once `approveInviteRequest` has asked the list again, so an
  entry claimed or gone since is refused. Accepting claims it and lands
  them on it (Step 30.2); the join page says so, and the approval email and
  a resend name the entry. "Approve without an entry" (plain "Approve &
  send invite" when nothing matches) is as before. Also: approving
  refreshes the whole page, which had dropped the approved row at once, so
  its link to copy when the email fails was never seen; the row now stays
  until the page is reloaded (`lib/request-rows.ts`). **Verified:**
  rehearsed rolled back on live, applied, function body md5-matches the
  file; rolled back again, the Root sees the match while a Canopy member
  and another tree's Root are refused and anon can't call it. On a dev
  server with a throwaway tree and Root: a request listed the living entry
  (with its parents) and a close match, not a deceased namesake; "Approve
  as" minted a claim invite bound to the requester, whose join page named
  the entry, and one Accept signed them in and landed them on it, claimed;
  a stale "Approve as" for that entry was then refused; approving without
  an entry and as the close match worked, a resend named the entry
  (checked in Resend), and deleting a kept row removed it. 594 tests pass.
  All throwaway rows were deleted.
- **Step 35 — Root-only checks refuse people who aren't on the tree**
  (ad-hoc security fix; migration
  `20260923080500_role_checks_refuse_outsiders`). `private.role_in(tree)`
  is null for someone with no `tree_members` row there, so
  `private.is_root_of(tree)` was null for them too, and every guard written
  `if not private.is_root_of(x) then raise` let them through: `not null` is
  null. Anyone signed in who had a tree's id (a visitor, an ex-member) could
  rename or delete it, change its members' account types, bring people onto
  it, resolve its claims and flags, and verify or revert its entries.
  Members who aren't Roots were always refused. Found by the Step 30.3
  agent. The yes/no checks built on `role_in` (`is_root_of`,
  `is_branch_of`, `can_invite_as`, `can_edit_person`, `can_delete_person`,
  `can_invite_to_claim`) now answer false instead of null. In RLS and in
  `if check() then`, null already meant no, and no `not check()` on live
  relied on it. `is_leaf_in` keeps its null: `can_edit_relationship` and
  `can_edit_pet` count on it to refuse someone who has left. Three more
  holes closed with it: through `can_edit_person`'s null, a member without
  their own entry could resolve any flag and invite someone to claim an
  entry they couldn't edit; `set_home_tree` let anyone signed in move an
  unclaimed entry's home to another tree showing it; and `documents_guard`
  let a member without their own entry share a document across trees,
  which only the person or a Root of their home tree may do.
  `tree_members_guard` now lets a departing member's profile clear
  `invited_by_user_id` on trees the removing Root isn't on, so
  `remove_tree_member` keeps working. No app code changed. **Verified:**
  rehearsed in a rolled-back transaction on live with throwaway users and
  trees, running the same 42 checks before, with only the helpers changed,
  and with the whole migration. Before, an outsider got through all 13
  Root-only actions; after, each is refused (42501) and the Root's 12 still
  succeed. With only the helpers, `remove_tree_member` failed, which the
  guard change fixes. Applied; all 9 function bodies md5-match the file and
  grants are unchanged; the checks re-run against live gave the same
  answers, and nothing was left behind.
- **Step 33.7 — Link previews don't count as views** (no migration).
  iMessage, WhatsApp, Slack and the like fetch a share link to draw its
  preview whenever it's pasted or sent, and each fetch counted as a view.
  Now only a browser's visit counts (`countsAsView` in `lib/share-links.ts`,
  given the user agent by `/shared/[token]`). A user agent must start
  "Mozilla/" (so no curl, WhatsApp or Slack) and name no preview service or
  headless browser (iMessage adds "facebookexternalhit … Twitterbot" to a
  Safari one), nor carry a URL, a crawler's calling card. Previews still
  get the page, since they need its title. In-app browsers (Facebook,
  Instagram) are people and count; a "CUBOT" phone isn't taken for a bot.
  **Verified:** 19 new tests from real user agents, and a check through the
  running page with a temporary log of the decision (since removed). For
  requests to an unknown link, Safari and the browser pane would have
  counted; iMessage, WhatsApp, Slack and Node's fetch wouldn't. No test
  link was made on live; the counting itself was verified in Step 33.

- **Step 30.1 — Roots and reviewers hear the moment someone asks**
  (Step 30, first-time journeys; migration
  `20260923075000_request_alert_recipients`). Requests to join a tree and
  to start one reached nobody: approvers saw a count beside "account" the
  next time they opened ancestree, and it took them 4 taps to reach the
  request. Now a new request to join (`requestInvite`) emails every Root of
  that tree who asked and which tree, with a "Review the request" button.
  A new waitlist sign-up (`joinBetaWaitlist`), or a member's first ask to
  start a tree (`requestNewTree`, which compares `my_tree_request` before
  and after, since `request_tree` answers "pending" to a repeat too),
  emails each beta reviewer who runs a tree. Asking again emails nobody.
  Alerts go out through `after()`, so they never slow or fail the form,
  one email per approver, from addresses read with the service role
  (`tree_root_emails`, `beta_reviewer_emails`; anon and signed-in users are
  refused). Caps, counted from pending rows: 5 an hour and 20 a day per tree
  for requests to join; 10 an hour and 30 a day for the waitlist; the alert
  that reaches a cap says so, and requests past it still wait in the queue.
  The button opens `GET /account/admin?tree=…&section=…`, which switches a
  Root to that tree and lands on its card (it spends no token, so a mail
  scanner opening it is harmless). Signed out, proxy.ts now sends a members'
  link to `/join?next=…`, the sign-in email carries `next`, and signing in
  lands back on it; `safeNext` (now `lib/safe-next.ts`) refuses anything
  that could leave the site. The header's count is its own button beside
  **account**, opening the tree and card that are waiting. **Verified:**
  rehearsed in a rolled-back transaction on live, applied, function bodies
  md5-match the file. On a dev server with a throwaway tree and Root: the
  share-link form and request access each sent one alert (Resend reported
  it delivered), a repeat sent none, the fifth request in an hour carried
  the cap note and the sixth sent nothing but still queued; the email's
  link switched trees signed in, and went through sign-in signed out; one
  tap on the header count opened the other tree's requests. Reviewer alerts
  weren't sent live; their recipients were checked in rolled-back SQL.
  559 tests pass. All throwaway rows were deleted.

- **Step 29.8 — Getting Started starts collapsed on phones** (UI only).
  On a phone the founder's checklist opened over the top of the tree. Below
  Tailwind's `sm` (640px) it now starts collapsed to its one-line header,
  "Getting Started · 4 of 5", with a chevron to open it. Anywhere wider it
  starts open as before. Once the viewer opens or collapses it, it stays
  that way until the page reloads; closing it for good still works as
  before. The width is read with `matchMedia` through
  `useSyncExternalStore` (`components/tree/getting-started.tsx`), so turning
  a phone to landscape opens it too. **Verified** in the browser on a
  founder's tree with one item left: collapsed at 385px wide, with the
  title unclipped and `aria-expanded="false"`; one tap opened all five
  items; open on a fresh load at 1280px.

- **Step 33.6 — When each share link was last viewed** (UI only). A
  link's line on the admin console now says when it was last opened, in
  the viewer's time zone: "12 views · last viewed Sep 21, 2026 · expires
  Oct 20, 2026". The expiry uses the admin console's short date, where it
  said "10/20/2026". On a phone the line breaks between its parts, never
  inside a date. A link opened only before Step 33 shows no last view,
  since those views were never recorded. **Verified** on a fixture page
  with the real `ShareLinkManager`, at desktop and phone widths, with no
  console errors. The fixtures were never viewed, viewed on a Pacific
  evening (the next day in UTC, shown as the evening's date), viewed with
  an expiry, expired, and revoked (not listed).

- **Step 32.3 — Generation titles pinned to the canvas's left edge**
  (ad-hoc). Zoomed in on the middle of a wide tree, a lane's title sat at
  the lane's far left, off screen. Once the reader pans past a lane's
  start, its title now stays 16px inside the canvas's left edge, in line
  with the Search & filters button (`lib/tree-layout.ts#laneTitleLeft`).
  It still rides up and down with its row, and it never runs past the
  lane's far end, so at the tree's right end it slides off with the lane.
  The panels at the top left (search, claim suggestions, Getting started)
  cover it where they overlap. UI only. **Verified** on the live tree in
  the browser, with nothing saved: at the opening view the titles sit at
  their usual inset; zoomed to 1.18 over the right of the tree, all five
  sit 16px from the edge; with 200px of the lanes left on screen they stop
  at the lanes' end; at zoom 0.31 they're pinned and still 12px. 5 new
  tests.

- **Step 30.2 — Accepting a claim invite claims the entry** (Step 30,
  first-time journeys; migration `20260923070000_claim_invite_claims_on_accept`).
  A claim invite (the entry panel's, and since Step 31 the add-relative
  form's) left only a vouch behind, and onboarding's search and claim
  ignored it. So a newcomer whose name didn't match the entry (a married
  surname, a nickname: the case the vouch exists for) was told "We couldn't
  find you", filled in the whole add-yourself form (a throwaway entry, and a
  "was added" notice to every Root), then claimed the entry again from the
  canvas: 9 taps where 3 should do. Now someone with no entry of their own
  who accepts a claim invite claims its entry as they redeem it.
  `private.claim_as_self` holds all of `claim_person_as_self`'s checks and
  effects (the daily limit, a Root's bloodline anchor, the notice that lets
  the entry's creator dispute it), with the vouch standing in for the name
  match. Their new profile is named after the entry rather than their
  email, and they land on `/tree?person=<entry>`
  (`lib/tree-links#joinedTreeHref`, used by the emailed-invite button, a
  bare link through `/auth/confirm` and a signed-in member's Join;
  `redeem_invite_tree` also returns `self_placed`). If the entry has gone to
  someone else, been deleted or left the tree, they still join and land on
  onboarding. A member who already has an entry keeps just the vouch, and
  ordinary and founder invites are unchanged (a founder still reaches
  Step 29's first run). Onboarding honours a vouch too: the entry is listed
  first and claims without the name match. **Verified:** rehearsed in a
  rolled-back transaction on live (every case, the daily limit, the dispute
  path, `authenticated` refused the private function), applied, and all
  five function bodies md5-match the file. With main's code, accepting
  already reached the claimed entry by way of onboarding; with this change,
  Accept landed on `/tree?person=` with the entry claimed and nothing
  typed, a mismatched name included. An invite whose entry was already
  claimed fell back to onboarding; a signed-in member's Join and a bare link
  through `/auth/confirm` landed on the entry. 495 tests pass (new
  `lib/sign-in.server.test.ts`). The throwaway accounts, tree and entries
  were deleted; the family's tree is untouched.

- **Step 29 — A founder's first run: invite, you, name, close family**
  (ad-hoc; migration `20260923062000_founder_anchor_on_placement`).
  Someone who has just started a tree now gets four short steps on
  `/onboarding` (`components/first-tree/`), whether they came by founder
  invite or founded it from `/trees/new`. Before, a newcomer searched an
  empty tree for their own name, and a member landed on the admin console.
  **Invite** comes first because it introduces the account types: all
  four, with who each is for (the founder is the Root; a Branch is given
  once someone has joined). Below them, name-and-email rows each take their
  own Canopy or Leaf, sent one type at a time (`sendDirectInvites`). The
  step can be skipped. **You:** a newcomer adds themselves, with the name
  prefilled from their display name (`namePrefill`). The form has no
  connect section and no lineage, as there's nobody on the tree yet. A
  member brings their existing entry across with one button
  (`bringOwnEntry`), never adding a second copy of themselves. **Name:**
  asked only while the tree has a default name ("Family", "Second Family",
  `isDefaultTreeName`). It's prefilled with "The {maiden or last name}
  Family", unless one of their trees already has that name
  (`suggestedTreeName`). **Family:** the founder's close family, laid out as
  the tree will hold them: parents above, siblings and partners either
  side, children below. Each empty place opens a short dialog
  (`QuickRelativeDialog`) with the person's details, an optional photo and
  an optional claim invite (Step 31's). It also asks the one question that
  places them: whether a second parent partnered the first (ticked), a
  child's other parent (a current partner, ticked), and which parents a
  sibling shares (both; untick one for a half-sibling). A sibling waits for
  a parent to share, since the overview seats siblings only under one. The
  lines come from `lib/first-tree#closeRelativeEdges`. A member first sees
  "Already on {their other tree}": their parents, partners, children and
  siblings there, ticked, to bring across (`placePeople`). Another member's
  own entry waits for that member's yes. Every step saves as it goes and
  has its own address, so a refresh stays on it, and the progress list
  links back to any step. **Canvas:** the founder gets **Getting Started**
  under the search (`components/tree/getting-started.tsx`): invite, you,
  name, parents, and a partner, child or sibling, each linking back to its
  step. It goes once all five are done, or when they close it (per browser,
  per tree). **Also:** `place_people` now anchors a founder's own entry on
  the tree they founded, as adding themselves does; a member-founded tree
  had neither an anchor nor a bloodline gate. `joinTreeWithInvite` lands on
  onboarding. On an empty tree, the add-relative form hides its connect
  section, and says "A Root" where it said "admin". **Verified** on the
  live project with throwaway accounts on Resend's test inbox. A founder
  invite led to the invite step, where a Canopy and a Leaf invite were
  sent. The founder added themselves (name prefilled), named the tree "The
  Tester Family", and added two parents (partnered), a sibling (invited to
  claim her entry as a Leaf), a partner with a marriage date, and a child
  with the partner as co-parent. The database held exactly those lines,
  with the founder as the anchor, and the checklist went once all was done.
  The sibling then accepted, claimed her entry, asked to start a tree, was
  approved, and founded one from `/trees/new`. Her first run brought her
  entry across, which anchored the tree, and passed over the taken name.
  It listed her parents and sister from the first tree, brought the
  parents at once, and asked her sister first (`placement_requested`). The
  migration was rehearsed in a rolled-back transaction first: placing
  someone else, a Root who isn't the founder, and a second placement
  anchored nothing. All test rows were then deleted. 31 new tests.

- **Step 30.4 — Sign in without the privacy tick; invite-only said up
  front** (Step 30, first-time journeys: one sub-step per fix in the
  journey maps; UI only, no migration). **F7:** a plain sign-in no longer
  shows the privacy checkbox, and `requestMagicLink` no longer refuses
  without it. That's a member coming back, who agreed when they joined,
  and members were ticking it at every sign-in. The form links to the
  privacy notice instead. A bare invite link's form, where someone is
  joining, still requires it, by the same rule
  (`lib/privacy-consent.ts#signInNeedsConsent`). **F8:** the signed-out
  home page says under its buttons that ancestree is invite-only (request
  access, or open the invite a relative emailed you), and `/join` says the
  same with request access linked, so a newcomer hears it before sending
  themselves a sign-in email. Sign in stays the filled button, for members
  coming back. `/auth/confirm` said "Welcome back" to first visits and
  "Your email is confirmed" before its button had checked the link; it now
  says "Finish Signing In" ("Join the Family Tree" for an invite) and "One
  more tap and you're in." **Verified:** 453 tests pass (3 new), typecheck
  and lint clean. Signed out on a dev server: the home page line at
  desktop, 400px and 360px; `/join` sends without a tick; a throwaway bare
  invite still requires it; `/auth/confirm` shows the new copy, and a fake
  token lands on the error page. The throwaway tree and invite were deleted.

- **Step 33 — Share-link views are counted** (ad-hoc; migration
  `20260923061500_record_share_link_view`). A share link never recorded a
  view: both live links showed 0 views and no last view though they had
  been opened, and the admin console shows Roots that count.
  `resolveShareLink` wrote the view with `void admin.from("share_links")
  .update(...)`, but a Supabase query is only sent inside `then()`, so
  `void` built the update and sent nothing. Now `after()` counts the view
  once the page has gone out: the render never waits on it, and on Vercel
  `waitUntil` keeps the function alive until it's done. It calls
  `public.record_share_link_view(p_link_id)`, one `update` that sets
  `view_count = view_count + 1` and `last_viewed_at = now()`, so visitors
  arriving together can't lose a view, as a read-then-write could. It runs
  with the caller's rights, and only the service role may call it. Earlier
  views were never recorded, so the counts start from this release.
  **Verified:** the migration was rehearsed in a rolled-back transaction on
  live (anon and a Root were refused; two service-role calls counted two),
  then applied, and its body md5-matched the file. On a dev server against
  a throwaway link, one visit counted 1 and ten at once counted exactly 10
  more. A signed-out browser visit counted 1, and opening a person's panel
  counted nothing. Revoked, the link showed "Link not available" and
  counted nothing. The throwaway link was deleted; the two real links were
  untouched. 4 new tests (`lib/share-links.server.test.ts`) fail if the
  call is only built and never awaited, or is awaited during the render.

- **Step 32 — Generation titles legible at any zoom** (ad-hoc). The
  generation lanes are drawn in canvas units, so a lane's title shrank with
  the canvas: about 1.5px tall in the opening view of the family's tree.
  `lib/tree-layout.ts#laneTitleFit` now magnifies it back to life size
  whenever the canvas is zoomed out, in every view: a member's, a
  visitor's, a share link's, and a pulled-out tree (where the lanes stay
  faded, as before). It sits where it always did until a bigger title would
  reach its row's cards. Then it rises into the gap above them, never past
  the row above, so it covers no card and no other title. Only a whole-tree
  view framed below the canvas's minimum zoom (a wide tree on a phone) has
  less room than that; there it shrinks with everything else. From life
  size up it grows with the canvas as before. UI only. **Verified** on the
  live tree: the titles read at 12px at zooms 0.12 (the opening view), 0.18,
  0.31 and 0.54, and 13.4px at 1.1, covering no card and no other title. 5
  new tests.

- **Step 27.9 — Ancestral lands on read-only trees too.** A share link's
  cards, and a visitor's from another tree, showed no ancestral lands at
  all. The panels asked Native Land Digital only when the tree wasn't
  read-only, and fell back to the family's words, but since 27.8 those
  exist only where NLD has no names, so a read-only card had nothing to
  show (none were stored). Now every card asks. A visitor is signed in, so
  asks `/api/ancestral-lands` like a member. A share link asks its own
  route, `/shared/<token>/ancestral-lands`, which answers only while the
  link works and only about places its cards show; it counts no view.
  `lib/ancestral-lands.server.ts` holds the answer both routes give. UI and
  routes only, no migration. **Verified** against the live NLD API with a
  throwaway share link, signed out: a Toronto card showed NLD's five names
  and the credit, fetched through the link's route (`no-store`); Nairobi
  answered no names; Reykjavík, Tokyo and Ulaanbaatar (not on the tree), a
  bad token and a bad place id were refused. The link was deleted after.
  4 new tests. The visitor view can't happen yet (one tree), but asks the
  members' route, unchanged.

- **Step 31.4 — Lineage and Country dropdowns show their labels when
  closed** (UI only). This is the relationship picker's bug from Step 31:
  a Base UI `Select` without its labels shows the stored value on its
  closed button. Lineage now shows "Biological", not "biological"
  (`LINEAGE_LABELS` in `lib/person-schema.ts`). The Country in "Can't find
  it? Add a place" shows "Canada", not "CA". Both are also controlled from
  the first render, with `null` for "not set" instead of `undefined`. That
  ends Base UI's dev warning about a Select "changing the uncontrolled
  value state" when the first value was picked. Every other `Select`
  already had its labels or a renderer. **Verified** on the signed-in dev
  server, with nothing saved: after a fresh load, both show the picked
  label and log no errors. The Add a place dialog was cancelled.

- **Step 31 — Shorter relationship words; invite someone as you add
  them** (ad-hoc; UI only, no migration). **Picker:** it now says only
  the relationship: **is parent of**, **is child of**, **is spouse /
  partner of**, **is sibling of**. That wording shows in the list and on
  the closed button. The button used to show the bare key ("child"),
  because the `Select` was never given its labels (`items`). The names
  already sit either side of the picker, and repeating them in every
  option got the list cut off. One wording (`lib/connections#KIND_STATEMENT`)
  now serves the add-relative form's chain, its extra connections and the
  edit page's "Add a connection". All three are 12rem wide, enough for the
  longest. **Invite as you add:** under the photo, the add-relative form
  asks "Invite them by email", for anyone who may invite (every account
  type that can add relatives). Once the entry is saved, `AddPersonFlow`
  sends the entry panel's claim invite for it (`sendClaimInvite`). A Root
  picks Canopy or Leaf; from anyone else they join as a Leaf. With an
  address typed, the button reads "Add relative & send invite". The
  question is hidden for a deceased person, whom `can_invite_to_claim`
  refuses. If the invite fails, the entry stays saved and a toast says
  so; the panel they land on offers the invite again. The address isn't
  written to the entry: that's the owner's to set, and claiming seeds it
  from the address they sign in with, which is this one. **Verified:** on
  the signed-in dev server, without submitting: the new words in the list
  and on the button, the invalid-address message, a Root's Canopy/Leaf
  choice, and ticking "deceased" hiding the question (unticking brings the
  typed address back). In a rolled-back transaction on live, a Canopy
  member, a Branch and a Root each added a living and a deceased child of
  their own entry. `can_invite_to_claim` said yes for the living child and
  no for the deceased one, for all three, and nothing was kept. **Not
  exercised:** a real submit that sends the email. That would have put a
  test entry on the family tree and notified its Roots.

- **Step 28 — The home page's calls to action** (ad-hoc; migration
  `20260923040000_tree_requests_and_waitlist`). **Signed in:** "view your
  tree" (`/tree`) and "start a tree (beta)". New trees are by request
  during the beta, so the button files an ask with a beta reviewer and
  shows "Your request has been received. We'll notify you when you can
  start building a new tree." Pressing again only shows the dialog; once
  approved it links to `/trees/new`, and once they've founded a tree (one
  each) it's gone. The same gate now covers `/trees`, `/trees/new` and
  `found_tree` itself, so the Step 25 married-in path waits on a reviewer
  too. **Signed out:** "sign in", "request access" and "start a tree
  (beta)". Request access takes a first name, last name and email and
  looks for the family's tree first. A strong name match on a living,
  unclaimed entry names the tree (never the person) and asks its Roots
  for an invite, with a choice when several trees match and "That's not
  me" to back out. With no match, it suggests asking a relative to invite
  them directly, or joining the beta waitlist with what they've typed.
  "start a tree (beta)" is that waitlist on its own, ending on the same
  "request received" dialog. **Reviewing:** `private.beta_reviewers`
  (the build owner, then Raiya Suleman too) sees "Requests to Start a Tree" on their
  admin console, in "Needs attention" and the header badge. Approving a
  member notifies them in-app (`tree_request_approved`, with "Start your
  tree") and by email. Approving a sign-up emails a founder invite from
  that console's tree. Declining keeps a record; deleting doesn't, and
  takes back an unused permission or invite. **Also:** one reading of the
  public name-and-email forms (`lib/request-forms.ts`) that marks the
  field at fault, where the invite request used to mark the email for a
  missing name, and whose inputs remount instead of tripping Base UI's
  changed-default warning; `renderEmail` under `renderInviteEmail` (invite
  emails byte-identical); resending a founder invite keeps founder wording;
  Sent invites marks founder invites "Starts a tree". **Header beside a
  node's details:** a person's or companion's sheet no longer covers
  tree, account and notifications. From `sm` up the header lays out to
  the sheet's left (`data-docked-sheet` + a `:has()` rule in
  `globals.css`). On a phone the sheet starts under the header, whose
  height `SiteHeaderHeight` keeps in `--site-header-height`. The
  companion sheet is now non-modal with no scrim, like a person's.
  **Verified** on the
  live project: the migration was rehearsed in a rolled-back transaction,
  then two throwaway accounts on Resend's test addresses ran every path:
  waitlist → approval → founder invite → a tree planted; a member asking,
  approval, inbox and email, then founding. A match and a no-match went
  through request access, and a reviewer declined and deleted. All test
  rows were deleted and the counts matched the start (1 tree, 5 profiles,
  63 people, 84 notifications). 13 new tests.

- **Step 27.8 — Native Land's names first; the family's words only where
  it has none.** The form no longer offers an empty box beside NLD's
  names. Where NLD maps the place, it shows them as they are (linked, with
  the credit), and nothing is filled in. Where NLD maps nothing, or can't be
  asked, a box appears, captioned "Our database does not contain a distinct
  ancestral name for this land. Please include whose land this is." The
  preview and **Start from these names** are gone. The card follows the same
  rule: NLD's names win, the family's words show only where NLD has none,
  and nothing shows until NLD answers. Words saved for a place NLD maps are
  cleared the next time the entry is saved; none existed when this shipped.
  UI only, no migration (`components/ancestral-lands.tsx`). **Verified** on
  a fixture form and cards against the live NLD API:
  - Toronto shows NLD's names read-only and clears stale words.
  - Kampala (a place of death) and a Nairobi companion get the box and caption.
  - A Kampala card with saved words shows them.
  - A Toronto card with saved words shows NLD's names instead.

- **Step 27.7 — Ancestral lands for companions too** (migration
  `20260923042000_companion_ancestral_lands`). A companion's place of birth
  works like a person's: `pets.ancestral_lands_birth` holds the family's
  own words, optional and up to 300 characters. The companion form shows
  the same field under the birthplace, with the preview and **Start from
  these names**, and clears the words when the place changes. Left empty,
  the companion's panel names Native Land Digital's territories live, never
  stored, and a share link never asks. The form field now lives in
  `components/ancestral-lands.tsx#AncestralLandsField`, shared by both
  forms. Companions have no place of death and no edit notices, so nothing
  else changed in the database. **Verified** on the fixture panel against
  the live NLD API. Calgary named Stoney, Ktunaxa, Métis, Blackfoot and
  Tsuut'ina, and the share-link panel showed the family's words with no
  lookup. On the fixture form, a Vancouver → Montréal change cleared the
  words and refreshed the preview.

- **Step 27 — Ancestral lands on a place of birth or death** (ad-hoc;
  migration `20260923041000_ancestral_lands`; reference
  [Reference data — Native Land Digital](#reference-data--native-land-digital)).
  A card now says whose land a person was born or died on. **Stored:**
  `people.ancestral_lands_birth` / `ancestral_lands_death`, the family's own
  words (optional, ≤ 300 characters), carried through `tree_people`; an edit
  to them notifies like any other ("ancestral lands"), and a Branch's edit can
  be undone (`private.revision_fields`). Changing the place clears the words
  in the form, since they described the old one. **Looked up, never stored:**
  left empty, the panel names the territories Native Land Digital maps at the
  place, e.g. "Ancestral lands of Anishinabewaki ᐊᓂᔑᓈᐯᐗᑭ, …", each name
  linked to its page on native-land.ca and credited "From Native Land
  Digital". The form previews that line under the place, with **Start from
  these names** to edit it into the family's own. Asked through
  `GET /api/ancestral-lands?place=<id>` (members only), a route handler so a
  slow answer never holds up the panel's server actions, which the client
  sends one at a time. Place fields in the panel now span its width.
  **Verified** against the live NLD API from a signed-in dev server: Toronto
  and Vancouver on a fixture card and form, "Start from these names", the
  place-change clear, the read-only share-link panel making no lookup, and
  the edit trigger (a Root's edit notified the owner and creator "was
  updated: ancestral lands"; that probe was rolled back).

- **Step 25 — Many trees, one entry each** (ad-hoc; migrations
  `20260922090000_trees_have_members`, `20260922100000_tree_views`,
  `20260922110000_visitors_and_tree_deletion`; reference
  `docs/trees-and-permissions.md`). People can now start their own trees.
  **Model:** `tree_members` holds the account type per tree, so someone can
  be Canopy on one tree and Root of another. `people.tree_id` became the
  **home tree**, and `tree_placements` says which other trees show a person
  and where their card sits there. Connections stopped belonging to a tree:
  a tree draws any line whose two ends it shows. Comments, documents and
  notifications carry a `tree_id`, giving one board, bank and inbox per tree.
  A document can be shared to every tree the person is on, by the person or
  a Root of their home tree. **Married-in path:** a member founds a tree
  from `/trees/new`. On its admin page they bring anyone they can see across.
  A member's own entry waits for that member's yes, and saying yes makes
  them Canopy there. The person picks their home tree on `/account`.
  **Beta path:** any Root sends a founder invite from their admin page.
  Redeeming it plants an empty tree with the newcomer as Root. There is no
  public "start a tree" page, so trees are invite-only. **Across trees:** a
  Root can open their tree, read-only, to members of another tree they're
  on. Visitors reach it from a shared person's "Also on" link. Anyone can
  hide their own entry from visitors, and it then shows as a blurred card.
  **Routing:** tree pages keep their plain URLs; the tree being looked at
  is a cookie, set by the header's switcher
  (`components/tree-switcher.tsx`, shown only to someone with more than one
  tree to look at) and by joining or founding a tree; the admin console is
  the account page's Admin view. **Naming:** an unnamed tree is "Family",
  then "Second Family", "Third Family", … (`lib/tree-names.ts`, mirrored by
  `private.default_tree_name` for founder invites); a Root renames it from
  the console. **Retired:** the Step 9 seam (`tree_bridges`, `start_own_tree`,
  `lib/flags.ts`) and the Step 14.1 canvas-interest register (no rows).
  **Compatibility:** the migrations kept `profiles.role` and `people.pos_*`
  mirrored so the deployed app kept working while this was built. **Step
  25.6** (`20260923050000_drop_legacy_single_tree`, held in
  `supabase/pending/` until this code was live) dropped both, their sync
  triggers, and the single-tree role checks (`private.is_admin()` and kin,
  `admin_delete_member`). It was re-dated past `20260923010000`, whose
  `ensure_profile` still wrote `profiles.role`. Rehearsed in a rolled-back
  transaction and then exercised on live: a Root's drag, the placement
  guard (status change and home-placement delete both refused), a new
  person's home placement, first sign-in from the allowlist, invite
  redemption, and moving a home tree. **Verified** on the live project with a
  throwaway account: a founder invite planted a tree and landed on its
  onboarding. The founder added themselves as its anchor and joined the
  family tree as a second membership. They brought two people across, and
  the claimed one waited, was accepted from the inbox, and appeared. A
  visitor view blurred a hidden entry. All test rows were then deleted and
  the counts matched the start (1 tree, 4 members, 63 people, 63
  placements).

- **Step 22.3–22.6 — Deleting what you added, undoing a Branch's edit, new
  Roots, and the matrix** (migrations `20260921170000_delete_own_entries`,
  `20260921180000_branch_edit_revert`, `20260921190000_roots_are_permanent`).
  **22.3:** a Branch or Canopy member can delete an unclaimed entry they
  added, as long as every connection, comment, document and companion on it
  is theirs too (`private.can_delete_person`, now the `people_delete`
  policy); otherwise the panel says to ask a Root. `lib/branch#canOfferDelete`
  decides when to show the button, and `deletePerson` asks
  `public.can_delete_person` first so a refusal says why. **22.4:** a
  Branch's edit to a Root's entry still publishes at once; the trigger now
  keeps it as an `entry_revisions` row and the Root's notification gets
  **Undo this change**, which puts back only the fields nobody has changed
  since and tells the Branch (`edit_reverted`). **22.5:** a Root can make
  another member a Root from the `/admin` picker, after a confirm; the
  database now refuses to demote a Root (`ROOT_IS_PERMANENT`) or delete a
  Root's profile. **22.6:** the permissions matrix under Data model, and a
  "Delete entries" line on every account-type card. Exercised in rolled-back
  transactions on the live database: Arzu's edit to a Root's entry recorded a
  revision and notified Raiya with it, Aalim's undo restored the field and
  told Arzu, and a second undo was refused. A Branch's fresh entry could be
  deleted until another member commented on it. Demoting a Root, a Root
  demoting themselves, and deleting a Root's row were all refused. 6 new
  tests. Follow-up: a Root can delete their own account, but the tree's only
  Root must first pick a member to take over as Root in the delete dialog;
  that member is promoted, then inherits what the Root added.

- **Step 24 — Invites clean up after themselves** (ad-hoc, migration
  `20260921160000_invite_cleanup`): joining now **deletes** the invite
  (`redeem_invite`) together with the "Sent invites" record that named it —
  `profiles` already keeps who invited them and as what. An invite that
  **expires** unused is **archived** (`invites.archived_at`): there is no
  scheduler, so `/admin` archives whatever has lapsed as it loads
  (`archiveExpiredInvites`), and archived ones leave "Sent invites" and
  "Bare links" for a new collapsed **Archived invites** section, where they
  can be deleted for good (`deleteInvite` now takes the record with it). A
  claim invite's vouch for its entry, which lived on the accepted invite,
  moves to `private.claim_vouches` so deleting the invite can't cost anyone
  the claim. On the live tree the 2 accepted invites were deleted and 3
  expired claim invites archived. Exercised `redeem_invite` in a rolled-back
  transaction: invite and record gone, vouch kept.

- **Step 22.2 — A Branch tends only the part of a Root's side they're related
  through** (migration `20260921150000_branch_reach_own_line`):
  `private.own_branch_ids` is now the Branch's own branch (the Step 17 walk
  from their entry) kept to the sides of the Roots they are related to (the
  18.1 anchor); `lib/branch.ts#branchReach` mirrors it. Everything built on
  `is_on_own_branch` — editing entries, lines and companions, claim invites,
  documents — follows. On the live tree Arzu goes from 51 entries to 48,
  losing exactly Raiya's mother's family (Noorali, Kulsum, Amyn) and gaining
  none. `/admin`, `/account` and the account-type card now say "their part of"
  a Root's side.

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
  two sign-in problems from onboarding real relatives. _Bug:_ Raiya got
  "link already used" on every fresh sign-in link. The auth logs show each
  token verified once and then failing seconds later — her Hotmail's link
  scanner opened the email's link first, and our GET spent the one-time token.
  `/auth/callback` now forwards a `token_hash` link to `/auth/confirm`, and
  only that page's button (a POST) verifies; a second tap in a browser that is
  already signed in carries on to the tree, not to an error. Emails
  already sent keep working, and the templates are unchanged. _Redundancy:_
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
  permission effects admins never see. _Branch admins_ (see **Branches**
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
  and that prompt keys off an _exact_ first/last name match, which a single
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
  that a new entry reach _someone_ already in the tree, and spouse edges
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
  in `add_people_with_connections` (step 5b, recomputed _after_ the edges land)
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
  numbered _relative to the founding admins_ (`getTreeAnchors()` reads their
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
  lanes (`ViewportPortal`) labelled by _generation number_ rather than by
  relationship — a row also holds the aunts, uncles and in-laws born into it, so
  "Grandparents" would mislabel most of it. Numbers count outward from the
  founders: ancestors up ("Generation One" = parents, "Generation Two" =
  grandparents), descendants down ("Generation minus One" = children); row 0 is
  "Founders' generation". Captioned with the decade span the row actually covers
  ("b. 1950s–1960s" when two sets of parents are a decade apart). Routes every
  child of a parent set through a shared `busY` so a marriage shows one trunk
  plus stubs (`DescentEdge`). That junction is computed by the pure
  `descentGeometry(parentRects, childTop)` from the parents' **live** card
  positions read out of the React Flow store — an invisible junction _node_
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
  Canada" resolved to _Scarborough Village_ (cities500 has no plain
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
