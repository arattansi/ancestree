# What the iPhone app can't reach directly

Step 147, surveyed at `0ec6b47` (2026-10-12). The iPhone app (`mobile/`)
talks to Supabase as the signed-in member: the anon key, RLS and RPCs,
exactly as the web's cookie client does. It cannot call a Next server
action and never holds the service-role key. This is every path that
matters, sorted by what the app has to do about it. Re-survey before each
mobile phase: every new server action widens the gap.

## How the web reaches the service role

- `createAdminClient()` in `lib/supabase/admin.ts` is the only service-role
  client (`SUPABASE_SERVICE_ROLE_KEY`). Every other server read or write
  goes through `lib/supabase/server.ts`: the anon key and the member's
  cookie session, held to the same RLS the app gets.
- Other server-only secrets: `RESEND_API_KEY` / `RESEND_FROM_EMAIL`
  (`lib/email.ts`), `NATIVE_LAND_API_KEY`, `CRON_SECRET`.

## Server actions: 132 in `app/actions/*.ts`

All carry a top-level `"use server"`; none is inline.

| Class | Count | What the app does |
| --- | --- | --- |
| **A** | 91 | Calls the same RPC or table write itself. Loses only the web-side tail, noted below. |
| **B** | 17 | Needs a Route Handler that takes `Authorization: Bearer <access token>`: service role, Resend email, `auth.admin`, or several steps that must run together. |
| **C** | 4 | The RPC is direct; its server tail (emails, file sweeps) belongs in a database webhook, an Edge Function or pg_cron. |
| **D** | 20 | Web only: the reviewer console, library and blog, newsletter admin, email-link landings, data export. |

### B: needs a bearer-auth Route Handler

| Action | Why |
| --- | --- |
| `deleteAccount` (`app/actions/privacy.ts`) | Service-role hand-off of ownership across about ten tables, then `auth.admin.deleteUser`. **Required in-app by the App Store.** |
| `claimPerson` (`app/actions/claims.ts`) | `moveClaimedPhoto` moves the photo with the service role; without it a claimed entry's photo breaks. (`claimSelfCandidate` is A.) |
| `sendClaimInvite`, `sendDirectInvites`, `makeClaimLink` (`app/actions/invites.ts`) | Service-role inserts into `invites` / `invite_requests`, and Resend. Also the "invite them to claim" tail of `addRelative`. |
| `deletePerson` (`app/actions/privacy.ts`) | Reads the files to remove with the service role before the delete, then removes them. |
| `deleteMember` (`app/actions/members.ts`) | `auth.admin.deleteUser` when it was their last tree. |
| `requestNewPlace` (`app/actions/places.ts`) | No insert grant on `places`. |
| `approveInviteRequest`, `resendInviteEmail` (`app/actions/invite-requests.ts`) | The email is the point. |
| `acceptInvite`, `sendInviteSignInCode` (`app/actions/auth.ts`) | `auth.admin.createUser` / `generateLink`. On the phone: the email code, then `redeem_invite_tree`. |
| `requestInvite`, `findFamilyTree`, `askRelative`, `sendRelayedInvite`, `sendRelayedClaimInvite` | Service-role reads and Resend for signed-out asks and relays; not needed for the first releases. |
| `/api/ancestral-lands` | Needs `NATIVE_LAND_API_KEY`. |

### C: an Edge Function or a database job

- **Storage cleanup.** Replaced or orphaned files are removed today by
  the service role in `after()`: `removeReplacedPhotos` (`updatePerson`,
  `setPersonPhoto`, `updatePet`, `setPetPhoto`, `claimPerson`),
  `editStory` / `deleteStory` (the dropped recording), `removeFromAlbum` /
  `deleteAlbumPhoto`, `revertEntryEdit`, `deleteTree`. The app's calls
  would leave the files behind. One function fired by a database webhook
  on those rows covers them all.
- **Emails after an RPC.** `placePeople` / `askPlacementsAgain`
  (placement asks) and `requestNewTree` (reviewer alert).
- **Placement reminders.** `sendPlacementNudges` runs only in `after()`
  when a Root opens `app/tree/page.tsx`; pg_cron should call
  `run_placement_nudges`.
- **Active days.** `note_active_day` is called in `proxy.ts`; the app
  calls it itself.

### A: the important ones for the first phases

- **Sign in** (`requestMagicLink`, `verifySignInCode`):
  `auth.signInWithOtp` → `auth.verifyOtp({ type: "email" })` →
  `ensure_profile` (or `redeem_invite_tree` / `redeem_campaign` with an
  invite or campaign). The not-yet-a-member "an invite is waiting for
  your address" lookup (`waitingInviteHref`) is service role; the app
  skips it. **Done in Step 147.**
- **Reading the family:** the `tree_people` and `tree_edges` views, as My
  Family Tree reads them (`lib/my-family.server.ts`). **Done in Step 147.**
- **The person sheet:** `/api/person-sheet` is cookie-only, but all it
  bundles is user-scoped: `tree_placements` + `trees`, `my_trees`,
  `entry_reports`, RPC `entry_album` + signed URLs from `album`, RPC
  `entry_stories` + signed URLs from `stories`, RPC `withheld_details`.
  The app reads them directly.
- **Adding a relative** (`addRelative`): RPC
  `add_people_with_connections`, then a `people` update for
  `place_id_birth`, `place_id_death`, `sex` and the `*_circa` flags (the
  RPC doesn't take them). Implied-connection detection is TypeScript over
  user reads (`lib/connection-suggestions*.ts`), shareable.
- **Photos:** uploaded from the client to `photos` (`lib/photo-upload.ts`)
  or `album`, then `people.update` or RPC `add_album_photo`.
- **Stories:** uploaded from the client to `stories`
  (`lib/story-upload.ts`), then RPC `add_story`; `edit_story`,
  `decide_story`, comments are RPCs too.
- **Notifications:** `notifications` reads and writes; `/api/notifications`
  and `/api/header-counts` are cookie-only but user-scoped.
- **Everything else in A:** suggestions, reports, placements, home tree,
  name-only cards, share links, family link, nicknames, pets: the same RPC
  or write.

## Route Handlers: 14

- **None takes a Supabase bearer token.** `/api/cron/newsletter` reads
  `Authorization`, but compares it with `CRON_SECRET`.
- **`proxy.ts` redirects every cookieless request** outside
  `PUBLIC_PREFIXES` to `/join` (307) before a handler runs.
- A mobile endpoint therefore needs a public prefix (`/api/mobile/` is
  the proposal) and a request-scoped Supabase client built from the
  bearer token.
- The web's helpers can't be reused as they are. `requireProfile`,
  `getProfile`, `rootOf`, `membershipOf`, `getRoleIn`, `listStories`,
  `listAlbum` and `mintClaimInvite` all call the cookie-bound
  `createClient()` inside, and `requireProfile` answers with `redirect()`.
  Each needs a version that takes the client.

## RPCs the app can never call

These are revoked from `authenticated` and are service role only:

- `address_has_profile`
- `beta_reviewer_emails`
- `campaign_open`
- `claim_newsletter_issues`
- `invite_relay_recipient`
- `newsletter_due`
- `placement_ask_recipients`
- `record_share_link_view`
- `run_placement_nudges`
- `shared_story`
- `tree_root_emails`
- `trees_matching_name`
