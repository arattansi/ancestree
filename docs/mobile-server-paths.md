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
| `deleteAccount` (`app/actions/privacy.ts`) | Service-role hand-off of ownership across about ten tables, then `auth.admin.deleteUser`. **Required in-app by the App Store.** The phone's route since Step 176: `/api/mobile/account/delete`. |
| `claimPerson` (`app/actions/claims.ts`) | `moveClaimedPhoto` moves the photo with the service role; without it a claimed entry's photo breaks. (`claimSelfCandidate` is A.) |
| `sendClaimInvite`, `sendDirectInvites`, `makeClaimLink` (`app/actions/invites.ts`) | Service-role inserts into `invites` / `invite_requests`, and Resend. Also the "invite them to claim" tail of `addRelative`. A claim invite has a phone route since Step 148.4 (`/api/mobile/claim-invite`). |
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
  user reads (`lib/connection-suggestions*.ts`), shareable. **Done for the
  scribe's relatives in Step 148.3** (`mobile/src/scribe/relatives.ts`):
  the tree read as the member and shaped by `detectionTree`, the add
  checked first with `check_add_people_with_connections` (the same call,
  always undone), then made as the web makes it. The claim invite that can
  follow an add goes through `/api/mobile/claim-invite` (148.4).
- **Photos:** uploaded from the client to `photos` (`lib/photo-upload.ts`)
  or `album`, then `people.update` or RPC `add_album_photo`.
- **Stories:** uploaded from the client to `stories`
  (`lib/story-upload.ts`), then RPC `add_story`; `edit_story`,
  `decide_story`, comments are RPCs too.
- **Notifications:** `notifications` reads and writes; `/api/notifications`
  and `/api/header-counts` are cookie-only but user-scoped.
- **The scribe's facts (Step 148.2)** are made from the phone directly,
  once the member ticks them: a `people` update where they may edit,
  `fill_person_blanks` where they may only fill blanks, else
  `suggest_entry_change`. Which it is comes from the RPC `entry_rights`,
  the phone's stand-in for the web's `entryAccess` (cookie-bound).
- **Messages (Steps 174, 177):** `/api/messages` is cookie-only, but what
  it reads is the member's own: RPCs `my_conversations` and
  `message_contacts`, card photos signed from `photos`, and, for who they
  are to you, the same `tree_people` / `tree_edges` the family read takes.
  Everything else is already an RPC the pop-up calls from the browser
  (`thread_messages`, `send_message`, `open_direct_conversation`,
  `mark_conversation_read`, the key and link RPCs, block, report, mute,
  delete, and since Step 182 `waiting_messages` / `deliver_messages`), and
  the inbox is the Realtime channel `inbox:<uid>`. **Done in
  Step 179.1** (`mobile/src/messages/`): the same RPCs and channel, who
  they are to you worked out on the phone over its family read
  (`lib/messenger-relation.ts`), the keys in the Keychain. Faces are
  initials for now.
- **Everything else in A:** suggestions, reports, placements, home tree,
  name-only cards, share links, family link, nicknames, pets: the same RPC
  or write.

## Route Handlers: 21 at Step 176 (14 before Step 148)

- **Four take a Supabase bearer token:** `POST /api/mobile/scribe`, the
  scribe's write-up (Step 148), `POST /api/mobile/scribe/facts`, the
  facts it finds for the tree (148.2), `POST /api/mobile/claim-invite`,
  an invite to claim one entry (148.4: `mintClaimInvite` with the bearer
  client for its checks, the service role for the invite and its email,
  as `sendClaimInvite`), and `POST /api/mobile/account/delete`, deleting
  your own account (Step 176: `deleteAccountOf`, successors promoted and
  lone trees deleted through the bearer client, the rest with the
  service role). `/api/mobile/` is in
  `proxy.ts`'s `PUBLIC_PREFIXES`, and `lib/supabase/bearer.ts` checks the
  token (`bearerToken`, `bearerClient`) and gives a client acting as the
  member, under RLS. Every new phone endpoint goes under `/api/mobile/`
  the same way. (`/api/cron/newsletter` reads `Authorization` too, but
  compares it with `CRON_SECRET`.)
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
