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
  ancestral lands under a place of birth or death (Step 27). Without it no
  card or form shows any (Step 40). See
  [Reference data — Native Land Digital](#reference-data--native-land-digital)
- `CRON_SECRET` — server-only; the secret Vercel Cron sends to
  `/api/cron/newsletter`, the weekly newsletter (Step 95). Set in Vercel's
  Production env (2026-10-01); without it the route refuses every call, so
  nothing is sent

Until Supabase env is set, `proxy.ts` no-ops so the app still boots. With env
set, unauthenticated visits to `/tree` redirect to `/join`.

## Project structure

- `app/` — App Router pages. **Tree pages have plain addresses** and read
  the tree from a cookie that lasts until the browser closes (Step 92.5;
  `lib/current-tree.server.ts`; the header's
  switcher, the header's admin count beside **account** (it opens the card
  that's waiting, on whichever tree it's on; Step 30.1), a notification's
  "View on tree" and "Also on" links set it via
  `app/actions/current-tree.ts`, an alert email's button sets it through
  `/account/admin`, and joining or founding a tree sets it
  too; `lib/tree-context.ts#currentAccess` resolves it, falling back to the
  member's home tree, and `isTreeChosen` says whether one was chosen this
  visit): `/tree` (React Flow canvas), `/tree/review`,
  `/people/new`, `/people/[id]/edit`, `/people/[id]/suggest` (suggest a
  change to an entry you can't edit, Step 67), `/onboarding` (first-run on that
  tree: a member finds or adds themselves, opening on the search for the
  name they joined by when we know it, Step 30.7; the tree's founder gets four
  steps instead, `?step=invite|you|name|family` — `components/first-tree/`,
  Step 29), `/welcome` (where a claim invite, or claiming an entry on
  onboarding, lands: their entry, with a photo and what's missing asked up
  front; `?returning=1` only greets a member who brought their own —
  `components/welcome/`, `lib/welcome.ts`, Step 50); `/admin` is the
  **admin page** for beta reviewers (Step 103, `app/admin/page.tsx`,
  `lib/admin-page.ts`; the header's red **admin**, before **tree**, with
  how many ask to start a tree): tabs **newsletter** (the weekly
  newsletter's schedule and their own issue, Step 95), **analytics** (the
  **engagement dashboard**, Step 56: counts across every tree — members,
  who's active, trees and entries, members active each week, how far
  members have got, what they did this week and last, each tree — from
  `engagement_dashboard()`; `components/dashboard/`, `lib/dashboard.ts`)
  and **manage** (requests to start a tree, from every tree and the
  waitlist), as `?tab=` links; anyone else is redirected to the account
  page's Root console. `/account/admin?tree=<id>&section=<card>` is an
  alert email's button — a
  route that switches to that tree for a Root of it and opens its console
  at the card (Step 30.1, `lib/open-console.server.ts`). `/family` is My
  Family Tree (Step 92.2): every tree the member is on, drawn as one canvas
  arranged around them (`loadMyFamily`); an address of its own, so it
  leaves the remembered tree alone, reached from the switcher. It's where
  members land every visit (Step 92.5, `homeHref`): signing in
  (`DEFAULT_NEXT` in `lib/safe-next.ts`), the header's mark, the home
  page's **view your tree**, and **tree** until a tree is switched to
  (`TreeNavLink`); anyone it can't be drawn for goes on to `/tree`. Nothing is
  added on it: a card's actions go to its own tree (Step 92.3), and its
  entry's pages (`/people/[id]/edit`, `/suggest`) are opened by switching
  to that tree first, with `?back=family` to come back. Site-wide: `/`
  landing (Step 28: signed in, **view your tree** / **start a tree
  (beta)**, which asks a beta reviewer; signed out, **sign in** / **request
  access** / **start a tree (beta)**, the last two in dialogs —
  `components/request-access.tsx`, `beta-waitlist-dialog.tsx`,
  `start-tree-button.tsx`), `/join` (`?next=` is where a signed-out visit
  was going, carried through the sign-in email and back; Step 30.1; signed
  in without a profile, it opens the invite waiting for their address, else
  says where their request stands or offers request access with the
  address filled in, Step 30.8) (+
  `/join/[token]` invite accept — signed in, it adds a
  tree; an emailed one only for the address it was sent to, and anyone
  else is told whose it is, Step 51), `/auth/callback` + `/auth/confirm` + `/auth/auth-code-error`,
  `/trees` (every tree you're on, your type in each), `/trees/new` (found a
  tree of your own, once a beta reviewer has approved it), `/account` (sign-in address and display name under the
  title, then two-column cards: your trees, your entry's home and visitor
  hiding, your own details as an editable form — including your email,
  which lives on your entry (`people.email`, seeded from the sign-in address
  and private unless `people.email_visible`; the `tree_people` view withholds
  a hidden address from everyone but the entry's owner), one inbox per
  tree, delete-account; settings opens on **Relatives Asking for an
  Invite** when a newcomer's ask was passed on to them (Step 30.5,
  `&relay=<id>` from the email), each listing the entries on the picked tree
  that the newcomer's name matches, to invite them as (Step 41.1), and the
  date it lapses (Step 41.5); its Privacy card has the **Relatives can ask
  me to invite them** box (on unless they untick it, Step 41.5); a Root
  gets a card for each tree they run (its name, who else may view it,
  export, delete the tree) and one **Nicknames** card (Step 103.2) — and,
  with `?view=admin`, the **Root console**
  of the current tree, or the first you run: stats, members, people from
  other trees, requests, reports (disputed claims among them, Step 88.2),
  invites incl. the family link
  (Step 52, `components/admin/admin-family-link.tsx`) and share
  links; `components/admin/admin-console.tsx`; no line under any title on
  either view (Step 103.2); the old `?view=dashboard` goes to
  `/admin`, Step 103),
  `/request-invite` (public; `?tree=<slug>` asks that tree's Roots, and
  without one it's the request-access search),
  `/shared/[token]` (public read-only canvas; its **Ask to join** opens the
  `?tree=` form in a dialog over it, Step 41.4), `/shared/story/[token]`
  (public read-only story, from its **Share** link, Step 88.4; its
  comments link is `/stories/[id]`, a members' route that opens the story's
  person on a tree of theirs with its comments open), `/privacy`
- Loading and failure (Step 61): each page a member moves to has a
  `loading.tsx` shaped like it (`components/page-skeletons.tsx`), so a
  click answers at once; `app/error.tsx` keeps the header when a page
  fails (**Try again**, **Back to tree**), `app/global-error.tsx` when the
  root layout does, and `app/not-found.tsx` covers a missing page or an
  entry on another of the member's trees. The header streams in on its own
  (a Suspense boundary in `app/layout.tsx`, `SiteHeaderShell` meanwhile),
  so no page waits for its counts
- `app/actions/` — server actions (`auth.ts`: emailing a sign-in code (+
  consent gate when it carries an invite) and checking it
  (`verifySignInCode`, Step 53), an emailed invite's accept and, for an
  address that's a member's already, its sign-in code
  (`sendInviteSignInCode`, Step 30.8) + sign out (`next` lets /join's "Use
  another email" come back to its form); `privacy.ts`: `exportTreeData` (admin JSON export) / `deletePerson`
  (admin erasure + storage cleanup) / `deleteAccount` (self-serve, reassigns
  contributions to a founding admin);
  `trees.ts`: `foundTree` / `renameTree` / `deleteTree`, `placePeople` /
  `respondToPlacement` / `removePlacement`, `setHomeTree`,
  `setHiddenFromVisitors`, `setTreeVisibility`, `joinTreeWithInvite`;
  `invites.ts`: `sendDirectInvites` (bulk name+email
  invites), `sendFounderInvites` (Roots: someone founds a tree of their own)
  — both made, emailed in one Resend batch and recorded together
  (`lib/invite-mint.server.ts#mintInvites`, Step 77.5),
  `sendClaimInvite` (invite someone to claim one entry; into another tree
  that shows it when a relayed ask picked one, Step 41.1);
  `family-link.ts` (Step 52, Roots): `rotateFamilyLink` (make or rotate),
  `setFamilyLinkCap`, `turnOffFamilyLink`; every tree-scoped
  action takes a `treeId` and checks the caller's role _there_
  (`lib/tree-context#membershipOf` / `rootOf`);
  `invite-requests.ts`: `requestInvite` (public, service-role write; a new
  request emails the tree's Roots, Step 30.1; pages are drawn again only for
  a signed-in asker, Step 41.4) /
  `approveInviteRequest` (mints the link, naming the entry the requester's
  name matched when the Root approves them as one, Step 30.3; the request is
  answered first, so two Roots can't both send one, Step 77.5) /
  `declineInviteRequest`;
  `invite-relays.ts` (Step 30.5): `askRelative` (public; a newcomer with no
  match asks a relative, passed on after the answer) /
  `sendRelayedInvite` / `sendRelayedClaimInvite` (as an entry the name
  matches, Step 41.1) / `dismissRelay` (the member it was passed to, while
  it hasn't lapsed) / `setRelativesCanAsk` (the member's opt-out, Step
  41.5);
  `tree-requests.ts` (Step 28): `requestNewTree` (a member asks to start a
  tree), `joinBetaWaitlist` / `findFamilyTree` (public, service-role; a new
  ask or sign-up emails the beta reviewers, Step 30.1; the waitlist needs
  the privacy tick, Step 30.6),
  `approveTreeRequest` / `declineTreeRequest` / `deleteTreeRequest` (beta
  reviewers);
  `people.ts`: update person (its photo in the same write, Step 77.5),
  fill blanks, drag-to-pin position, auto-arrange, photo writes, revert;
  `connections.ts`: `addRelative` (one call for an add: the implied
  connections asked about first, then a transactional multi-person + edge
  create and the invite asked for with it, Step 77.5; a photo follows in a
  second) and every line after it (the refusal wording `people.ts` and
  `connections.ts` share is `lib/entry-errors.ts`); `album.ts`:
  `addAlbumPhoto` / `decideAlbumPhoto` /
  `removeFromAlbum` / `deleteAlbumPhoto`, Step 88.5 (its reads are the
  sheet's GET, Step 87.6); `claims.ts`: `claimPerson` /
  `markNotificationsRead`; `stories.ts`: `addStory` /
  `decideStory` / `deleteStory`, Step 88.3, and `shareStory` /
  `stopSharingStory` / `getStoryComments` / `addStoryComment` /
  `deleteStoryComment`, Step 88.4; `entry-reports.ts`: `reportEntry` / `resolveEntryReport` /
  `withdrawEntryReport` / `decideClaimDispute`, Step 88.2; the sheet's
  reads are `GET /api/person-sheet`, Step 87.6)
- `app/api/person-sheet` — `GET ?person=<id>&want=trees,reports,album,stories`:
  what the details sheet shows beyond the card ("Also on", Step 25; open
  reports, 88.2; the album, 88.5; stories, 88.3), read side by side as the viewer
  (`lib/person-sheet.server.ts#loadPersonSheet`, a section that fails is
  named and the rest still come; `lib/person-sheet.ts` the types and
  params, `.test.ts`); `components/tree/use-person-sheet.ts` keeps each
  person's for the tab: `useLoadPersonSheet` (in `PersonPanel`) asks once
  per opening for what's missing or over a minute old, calls it off when
  another person opens, and asks for the reports again when their count
  changes; the sections read `usePersonSheet` and write their own changes
  with `setPersonSheet`; `invalidatePersonSheet` reads again; every new
  page from the server marks them all stale (`FamilyTree`), Step 87.6
- `components/tree/` — `family-tree.tsx` React Flow canvas (generation lanes
  behind the cards, whose titles stay life-size when zoomed out —
  `laneTitleFit` — and pinned inside the canvas's left edge — `laneTitleLeft`;
  a child's descent line starts from a junction _derived from
  its parents' live positions_ — not a node — so it follows them as they are
  dragged, and all of a couple's children bend at a shared horizontal bus, so a
  marriage shows one trunk rather than one line per parent — the lines are
  `canvas-edges.tsx`, the graph they're drawn from `build-graph.ts`
  (people, then companions hung on apart, Step 87.1), the
  lanes `generation-lane.tsx`, Step 77.6; a save keeps every unchanged row,
  card and line as the same object and each photo at its first signed
  address — `lib/structural-share.ts`, `lib/canvas-nodes.ts`,
  `lib/signed-url.ts`, `use-kept.ts`, Step 87.1; a dropped card is laid
  out where it was dropped by the canvas itself, for the tab's life, until
  a page drawn after the save knows it — `lib/local-drops.ts`, Step 87.3;
  the details sheets, their dialogs and the cropper are fetched once the
  canvas has painted and mounted closed, the Supabase client with the
  first room — `components/lazy-component.tsx`, Step 87.4; cards and
  small faces show a card-sized copy of each photo, the full one loads on
  a card's first hover, and a face keeps its picture while a new address
  loads — `photo_card_url`, `use-steady-photo.ts`, Step 87.5; on a
  phone (`data-phone` on the canvas, the `phone:` variant) cards off a
  spotlight fade without blur and leaves have no shadow, the minimap is
  drawn only from `sm` up (`useIsSm`), and a line works its route out
  again only once one of its cards has moved or changed size
  (`useCardsStore`), Step 87.7;
  admin "Auto-arrange" clears every manual nudge; on a phone no card can be
  dragged (a tablet's can), so a finger on one pans, Step 49; the zoom
  controls end with
  **Go to me**, which opens the viewer's own tree and details, Step 48),
  `tree-search.tsx` the **Search & filters** card under **Add a relative**
  (its results, and `person-picker.tsx`'s, show a `née` maiden name under
  the name, Step 76.8;
  Find a person, Show a connection, Filters: only your Root's side, only the
  descendants of one or two people, and Pets & companions — each section
  closed until opened),
  `upcoming-feed.tsx` the **Upcoming** card at the top left (birthdays and
  anniversaries, Step 57.1; `use-today.ts` the viewer's own day; a `née`
  maiden name under the name, under a couple's saying whose, Step 76.9;
  its **Share** menu, Step 89),
  `use-tree-room.ts` + `live-cursors.tsx` who else has the tree open, as
  faces above **Upcoming**, and their pointers (Step 57.3), `person-node.tsx`
  custom node (name, then `née` maiden name / birth year / birthplace;
  open-report badge, counting only the reports the viewer may see, Step
  88.2; in a spotlight `leaf-card.tsx`'s leaf — the leaf of the tree that
  grows where they were born (`lib/native-leaf.ts`), drawn from that
  tree's own leaf by `lib/leaf-shapes.ts`, Step 96 — at most three
  lines: name, "You", the years, or, with a maiden name, name, `née`
  maiden name, "You" with the years, Steps 76–76.5),
  `person-panel.tsx` detail Sheet (its header: the name, `née` maiden
  name and the years, on the photo when there is one, Step 76.6; **Edit
  entry** in its header, Step 62; claim; a flag at the end of the tag row
  opens `report-dialog.tsx`, to report a problem or, for whoever added a
  claimed entry, dispute the claim, and `entry-reports.tsx` lists the open
  reports the viewer may see, Step 88.2; **Minimize** folds it into a
  card at the foot of the canvas, Step 49, that repeats the header's lines,
  Step 76.7, `folded-details.tsx`; its family and companions sections are
  `person-family.tsx` and `person-companions.tsx`, Step 77.6),
  `entry-stories.tsx` (the sheet's Stories, in place of the comments board,
  Step 88.3; **Share**, **Stop sharing** and each story's comments, Step
  88.4, `story-comments.tsx`; `components/send-link.ts` sends a link by a
  phone's share sheet, else copies it) + `story-dialog.tsx` (Add a story,
  loaded on the first press), `entry-album.tsx` (the sheet's Album, in
  place of Documents, Step 88.5: a carousel of the photos the person is
  in, one at a time, swiped or stepped through, each photo's details and
  actions under it, the whole photo in a dialog on a press) +
  `album-dialog.tsx` (Add a photo: shrunk as it's picked, a description,
  who's in it; loaded on the first press; since Step 88.6 the date taken
  and suggested tags, read from the photo's own details before it's
  shrunk),
  `claim-suggestions.tsx` "Is this you?" canvas prompt;
  who's open is in the address (`?person=`, replaced as they change), and
  the camera, the filters, a lit connection and the details folded or not
  are kept for the tab per tree (`use-canvas-memory.ts`,
  `lib/canvas-memory.ts`), so Back, Back to tree or a reload finds the
  canvas as it was left (Step 77.3)
- `components/tree/pet-node.tsx` — the companion chip (a third the height of a
  person card, a pill, led by a species glyph, joined by a dotted lead) +
  `pet-panel.tsx` (name / animal / years / optional full birthday + a GeoNames
  place of birth, the same picker a person uses / photo / who it belongs to /
  a plain comment thread),
  `pet-comments.tsx` (`pet_comments` — comments only, no flags / resolve /
  notifications; `lib/pet-comments.ts` + `app/actions/pet-comments.ts`),
  `companion-fields.tsx`, `companion-picker.tsx` (multi-select
  people; a "Suggested" row of one-press adds, the album's, Step 88.6), `add-companion-dialog.tsx` (opened from a person's panel);
  `lib/pet-schema.ts` (pure zod; `birth_date` implies `year_born`),
  `lib/pet-labels.ts` (species labels and glyphs, `petYears`, zod-free for
  the canvas, Step 87.4), `lib/pet-layout.ts` — pets
  are laid out **after** the humans, hung in the gap below their companions and
  swept apart on a row (`.test.ts`); `lib/pets.ts` — `getTreePets`;
  `app/actions/pets.ts` — add / update / link / unlink / remove / photo /
  position. Pets are read separately from `getTreeGraph` so nothing in the
  layout, bloodline, generation, or claim code ever sees one
- `components/notifications-list.tsx` (account; its claim notice's dispute
  opens the report dialog) + `admin/admin-reports.tsx` (the Root console's
  open reports: resolve, or uphold / reverse a disputed claim, Step 88.2);
  `lib/claims.ts` — claim candidates, notifications; `lib/album.ts` —
  album reads (`entry_album` + a signed 800px transform and the whole
  photo, Step 88.5); `lib/album-path.ts` — the `album` bucket's layout
  (`{tree}/{uuid}.{ext}`); `lib/photo-metadata.ts` — what a picked photo
  says about itself (named faces, person shown, keywords, date taken) from
  its JPEG / PNG / WebP EXIF, XMP and IPTC, read in the browser, never its
  location (`xml-lite.ts` reads the XMP), and `lib/photo-tags.ts` — those
  names matched to people on the tree and everyone ranked by whether they
  were alive when it was taken (`lib/tag-person.ts` is what the canvas
  hands it for each person, apart so the canvas doesn't load the rest),
  `lib/album-taken.ts` — the date's check, all Step 88.6 (`.test.ts`);
  `lib/stories.ts` —
  story reads (`entry_stories` + signed recording links) and a story's
  comments (`list_story_comments`); `lib/story-links.ts` /
  `story-links.server.ts` — a story's public link and its service-role read
  (`shared_story`, Step 88.4); `lib/story-audio.ts`
  — the recording bucket's types, paths and lengths; `lib/story-audio-shrink.ts`
  — a recording remade as speech in the browser (Mediabunny, loaded only
  once one is picked); `lib/story-upload.ts` — sending one;
  `lib/entry-reports.ts` — report reads (sheet, Root console,
  the queue's count)
- `components/ui/` — shadcn primitives (incl. `form` = react-hook-form + zod,
  `alert-dialog` = Base UI's AlertDialog dressed like `dialog`; `fit-text`
  shrinks a line to fit, every one on the page watched by one shared
  ResizeObserver and fitted in batches, Step 87.7)
- Feedback (Step 70; the rules are in `docs/design-system.md`, Feedback):
  `components/use-action.ts` — `useAction`, the one way a client component
  calls a server action: busy per button until the page's new render (or
  the next page) has arrived, a refusal or a throw reported as a toast or
  inline, a redirect counted as done; `toastError` for a 10 s error toast;
  `pending-button.tsx` (spinner, pending words, `aria-busy`, keeps focus),
  `action-button.tsx` (one button, one action), `submit-button.tsx` (a
  `<form action>`'s), `confirm-dialog.tsx` (`ConfirmDialog` /
  `ConfirmButton`: ask before a loss), `form-error.tsx` (a failure by its
  button), `use-focus-return.ts` (`useFocusReturn`, `refocusAfterRemoval`:
  focus kept when its control goes); `link-pending.tsx`
  (`LinkPendingLabel`: a link's label pulses until its page is on its way,
  Step 77.3); `tree-target.tsx` (`TreeTarget`: a way to a page on a tree —
  a plain, unprefetched link on the tree being looked at, which on the
  canvas opens a person and on the Root console a section in place; a
  button that switches first on another, Step 77.3);
  `lib/action-feedback.ts` — what an
  action's answer means (`actionError`, `isRedirect`, `UNREACHABLE`;
  `.test.ts`); `tap-target` in `app/globals.css` — a 44 px hit area on
  touch screens; `bar-chrome` there — the header's frosted bar, which a
  form's floating buttons share on a phone (Step 77.6)
- Shared pieces, one copy each (Step 77.4; `.test.ts` beside the pure
  ones): `lib/limits.ts` (what the browser and server both hold to: invite
  lifetime, tree name, comment, note, display name, share link; the emails
  and pages that name them read them from here), `lib/expiry.ts`
  (`isExpired` at the database's own boundary — lapsed at the moment
  itself — and `expiresAfter`), `lib/short-date.ts` (`shortDate`, "23 Sep
  2026" in UTC, the same on the server and in every browser),
  `lib/plural.ts` (`plural`, `countOf`), `lib/email-address.ts`
  (`isEmailAddress`), `lib/member-names.server.ts` (`memberNames`),
  `components/copy-text.ts` (`copyText`), `lib/db-errors.ts`
  (`friendlyDbError` over each action's rules; `ownedWrite`, which reads an
  update or delete that row-level security skipped — no rows back — as a
  refusal, not a success), `membershipOf` / `rootOf` answering a union
  (the membership, or why not); photos: `lib/photo-path.ts` (the bucket
  layout its policies read, `photoPath` / `photoPathOwner`),
  `lib/photo-upload.ts` (`uploadPhoto` under the file's own type,
  `attachPhoto`, which removes a file the entry refused, `discardPhoto`;
  the Supabase client loads only when a photo is sent),
  `lib/photo-cleanup.server.ts` (the file a save replaced or cleared goes
  once nothing points at it, Step 82: `removeReplacedPhotos`,
  `removeUndonePhotos`; which files may go is `photosLeftBehind` in
  `lib/photo-path.ts`; `.test.ts` beside each),
  `lib/file-cleanup.server.ts` (a deleted row's file goes, Step 90:
  `removeAlbumPhotosLater` for a photo deleted or out of every album,
  `albumPhotosOf` for the photos a person is in, Step 88.5,
  `treeFiles` + `removeTreeFilesLater` for a deleted tree's photos,
  album photos and recordings),
  `components/use-photo-draft.ts` (`usePhotoDraft`, `usePickedUrl`),
  `sameCrop` in `lib/image-crop.ts`; `components/spouse-dates-fields.tsx`
  + `lib/spouse-dates.ts` (a marriage's dates in every form, stored and
  normalized one way); `lib/entry-view.server.ts` (`signedPhotoUrl(s)`,
  `placeLabels`)
- `components/person-fields.tsx` — shared demographic fieldset; `person-form.tsx` —
  edit an existing entry (on the edit page its buttons float:
  `floating-form-actions.tsx`, Step 59); `add-person-flow.tsx` — self / relative add with chain
  connect (its schema `lib/add-person-schema.ts`, `.test.ts`, and the people
  in between `in-between-fields.tsx`, Step 77.6);
  `relationship-picker.tsx` — search-select an existing member;
  `candidate-row.tsx` — an entry a name matches, with its button, wherever
  one is offered (Step 77.6); `row-card.tsx` — `RowCard` and `RowList`, a
  list of things to act on and its "No …" line (Step 77.6);
  `place-autocomplete.tsx` — `places`-backed birth/death location picker
  (+ admin "add a place")
- `lib/places.ts` — server-only `searchPlaces` / `getPlacesByIds` /
  `formatPlaceLabel`; `lib/country-names.ts` — `countryName` (ISO→name) +
  `ALPHA2`, and a country's own `places` row (`countryPlaceId`,
  `isCountryPlace`, `isCountryPlaceId`, Step 79, `.test.ts`);
  `app/api/places` — `GET ?q=` the picker's search, a route so a newer
  search calls off the last and none waits behind a save (Step 87.6);
  `app/actions/places.ts` — `requestNewPlace` (admin) / `listCountryOptions`; `lib/historical-names.ts` — pure
  `resolveHistoricalName` / `formatHistoricalPlace` (Step 4.5d, `.test.ts`)
- `lib/place-search.ts` — pure `shapePlaceQuery` / `rankPlaces` /
  `choosePlaces` / `countriesNamed`, what the place search looks for and in
  what order (Steps 66 and 79, `.test.ts`); `lib/place-regions.ts` — the
  region names it matches; `lib/place-choice.ts` — the picker's pure
  helpers (`chosenPlace`, `isLink`, `typedPlaceName`, `unmatchedSearch`,
  and `placeText`, the town and country an entry keeps; `.test.ts`)
- Ancestral lands (Step 27): `lib/native-land.ts` — pure parsing and wording
  of Native Land Digital's answer (`.test.ts`); `lib/native-land.server.ts` —
  `territoriesAt(lat, lng)`, the only caller of NLD; `app/api/ancestral-lands`
  — `GET ?place=<places.id>` for anyone signed in (members, and visitors
  from another tree); `app/shared/[token]/ancestral-lands` — the same for a
  share link, only about places its tree shows (Step 27.9);
  `lib/ancestral-lands.server.ts` — `landsAtPlace`, what both answer;
  `components/ancestral-lands.tsx` — the lands line on a card and in a form:
  NLD's names, or nothing (Step 40)
- `lib/person-schema.ts` — shared zod schema, its labels (sex, lineage) in
  zod-free `lib/person-labels.ts` (Step 87.4; `lib/first-load.test.ts` keeps
  zod, react-hook-form and the browser Supabase client out of the header's
  and the canvas's static imports); `lib/connections.ts` — chain/edge
  types + `buildChainEdges`; `lib/connection-suggestions.ts` — implied-connection
  detection engine (+ `.server.ts` loader, `.test.ts`); `lib/siblings.ts` — sibling inference;
  `lib/graph-walk.ts` — the one walk along a tree's lines (`stepsOf`,
  `reach`, `partnersOf`) the bloodline, branches, a person's own line and the
  spotlight take (Step 77.6, `.test.ts`); `lib/tree.ts` —
  shared-tree + member lookups + `getTreeGraph` (canvas data), and the
  reads a request shares whoever asks (Step 77.1): `loadTreePeople`,
  `loadTreeEdges`, `loadTreeDirectory`, `loadTreeClaims` (this tree's
  people's only), and `readIn` for a long `in` filter; `getTreeGraph` is
  `cardOf` / `lineOf` over the views' rows, then `finishCards` (photos,
  period names, claims, reports, account types, one wave for all), which
  My Family Tree shares, with `readTreesPeople` / `readTreesEdges` reading
  many trees at once (`readPaged` past PostgREST's 1,000 rows) (Step 92.1);
  `lib/my-family.ts` — who's in My Family Tree (`familyTies`), which tree
  a card comes from (`cardShowing`, `mergeShowings`), one copy of each
  line (`mergeLines`), the trees' marks (`treeMarkOf`) (Step 92.1,
  `.test.ts`), the view's companions (`companionsShowing`) and the canvas's
  name for it (`MY_FAMILY_VIEW`, Step 92.2), and what only the view decides
  (Step 92.3: `lineEditableFromView`, `addTreesFromView`; who the member is
  on each tree and the home tree's rules are `lib/branch.ts`'s
  `reachOnTree` / `viewerOnTree` / `entryRights`, Step 93); `lib/my-family.server.ts` —
  `loadMyFamily`, every tree the member is on merged into one graph, with
  each tree's reach and whose own entry each card is, drawn by
  `FamilyTree`'s `family` mode (`components/tree/tree-mark.tsx`: the marks
  and the key; lanes named from the viewer, `generationLabelFromYou`, Step
  92.2; `components/tree/add-to-tree.tsx`, its "Add a relative", and
  `add-to-tree-dialog.tsx`, "Which tree do you want to add to?", Step
  92.3); `lib/same-person.ts` — which of the view's cards may be one
  person entered twice (`likelySamePeople`, worked out in `loadMyFamily`,
  never stored) and which are still asked once the reader has said some
  are two people (`shownSamePairs`) (Step 92.4, `.test.ts`), asked on the
  cards and sheets by `components/tree/same-person.tsx`, the answers kept
  in this browser by `use-not-same.ts`;
  `lib/tree-layout.ts` — the anchored auto-layout engine (Step 4.6, `.test.ts`):
  generations relative to the founding admins fix `y`; partners are fused into
  one *atom*, and a family (an atom plus everything descended from it) is laid
  out as one rigid *block*, packed against its neighbours by its
  per-generation contour, so nothing is ever threaded into a sibling set.
  Blocks go down in order: the anchor couple and their descendants at the
  centre, then every ancestry nearest generation first (the first partner's
  growing left, the second's right, aunts, uncles and cousins off their
  parents' outer edge, in-laws on their outward side), then any branch with no
  path to the anchors off the right-hand end. A `settle` pass then eases
  parents over their children's span and back (order fixed, so it aligns but
  never re-shuffles; skipped by `centreFamilies`, the spotlight's layout), and
  a separation sweep guarantees a minimum gap between cards. Couple partners
  sit side by side eldest-left and a sibling set runs oldest→youngest. Also emits generation bands and per-couple
  descent points (`descentGeometry`, shared with the canvas so the drawn line
  and the laid-out one follow one rule; a `generations` option fixes each
  row from the whole tree when only part of it is drawn, Step 57.2); its
  measures are `lib/tree-dimensions.ts`, its lines' geometry
  `lib/edge-geometry.ts` and the lanes' labels and titles
  `lib/generation-lanes.ts` (split in Step 77.6);
  `lib/occasions.ts` — upcoming birthdays and anniversaries (Step 57.1,
  `.test.ts`; `weekMessage`, the week as a chat message, Step 89);
  `lib/share-text.ts` — `wa.me` and `sms:` links that open WhatsApp or
  Messages with a message typed out (Step 89, `.test.ts`); `lib/presence.ts` — the tree room's topic, colours, send
  rate and card-anchored pointers (Step 57.3, `.test.ts`);
  `lib/person-name.ts` — display
  name + lifespan + initials, and whether someone has died
  (`personHasDied`); `lib/image.ts` — client-side photo downscale;
  `lib/first-tree.ts` — a founder's first run (Step 29): the steps and
  where each opens, the "Getting started" items, the founder's close family
  from a tree's lines, and the lines a quick-added relative gets
  (`closeRelativeEdges`; `.server.ts` loads it, `.test.ts`);
  `lib/welcome.ts` — the welcome (Step 50): what it asks for
  (`welcomeAsks`, `welcomeAsk`) and the line under their name
  (`enteredLine`; `.test.ts`); `lib/welcome.server.ts` — who invited them
  onto the tree (`inviterName`, `.test.ts`);
  `lib/tree-context.ts` — the per-tree context (Step 25): `requireTreeMember`
  / `requireTreeSelfPersonWith` (the page's reads beside
  the check that its own entry is on the tree, Step 77.1) /
  `requireTreeAccess` (member or visitor) for pages, `membershipOf` /
  `rootOf` for actions, `listMyTrees` (a member's trees, read once, which
  also answers `getRoleIn` and the tree itself), `defaultTree`; `lib/tree-links.ts` — every tree path (`treeHref`,
  `adminHref`, `editPersonHref`, …); `lib/revalidate.ts` —
  `revalidateTreePages()`, the one call after a write: the action's reply
  carries the page it was sent from, drawn again, and pages visited
  earlier are fetched afresh (Step 61; not after a card drop, Step 87.3); `lib/placements.server.ts` — who a
  Root could bring over with the lines between them, who they have, and
  what's been asked of a member (Step 80); `lib/carry.ts` — who "All
  descendants of" picks and what bringing each asks (`.test.ts`);
  `lib/placement-alerts.server.ts` + `lib/emails/placement-asked.ts` — the
  email to whoever's yes a basic card waits on (`.test.ts`)
- The weekly newsletter (Step 95): `vercel.json` — the Vercel Cron job,
  daily at 15:00 UTC (`SEND_HOUR_UTC`), calling
  `app/api/cron/newsletter/route.ts` (checks `CRON_SECRET`; sends only on
  `newsletter_schedule`'s day unless paused; `?user=<id>` sends to those
  members now, any day); `lib/newsletter.server.ts` —
  `sendScheduledNewsletters` → `sendWeeklyNewsletters`: who's due
  (`newsletter_due`), `buildWeeklyNewsletters` (every tree they're on read
  once with the service role, each member's issue; sends nothing), marked
  done (`claim_newsletter_issues`) just before it's sent; `ownNewsletter` —
  a member's own, for the admin page's newsletter tab; `lib/newsletter.ts` — `weeklyIssue`,
  cut to the reader's own family by My Family Tree's rule (`familyTies`),
  `isMilestone`, `isSendDay`, `nextSendAt` (`.test.ts`);
  `lib/emails/newsletter.ts` (`.test.ts`); the signed-out unsubscribe page
  `app/newsletter/[token]/` and the mail apps' one-click
  `app/api/newsletter/[token]/route.ts` (`lib/newsletter-settings.server.ts`);
  `components/weekly-newsletter.tsx` — the box on settings;
  `components/dashboard/newsletter-card.tsx` + `newsletter-controls.tsx` —
  the beta reviewers' day, pause, test email and preview
  (`app/actions/newsletter.ts`)
- `components/site-header.tsx` (the mark, the tree switcher, a beta
  reviewer's red **admin** (Step 103, `AdminNavLink`), **tree**,
  **connections**, **account**, the bell; `lib/nav-active.ts` says which is
  lit, Step 61; its counts come from `lib/header-counts.server.ts` and are
  kept fresh between saves by `components/header-counts.tsx`, which asks
  `GET /api/header-counts` on moving to another page or coming back to the
  tab, at most every 30 s; the bell reads its list from
  `GET /api/notifications` when it's opened, Step 77.2; one row, compact
  on a narrow bar through `header-compact` in `app/globals.css`, the
  buttons' symbols and corner counts in `site-nav-link.tsx`, Step 85.2), `found-tree-form.tsx`, `home-tree-picker.tsx`,
  `join-tree-button.tsx`, `admin/admin-placements.tsx`, `carry-picker.tsx` (**All descendants of**,
  in the Root console and the founder's family step, Step 80),
  `placement-asks.tsx` (**Asked of You** on `/account` settings, Step 80),
  `admin/admin-tree-settings.tsx`, `admin/admin-delete-tree.tsx`,
  `tree/person-trees.tsx` ("Also on"); `components/page-skeletons.tsx` +
  `components/ui/skeleton.tsx` for the `loading.tsx` skeletons;
  `components/page-column.tsx` — `PageColumn` (`lg`, `2xl`, `3xl`) and
  `CenteredPage`, every page's shell and its skeleton's (Step 77.6);
  `lib/admin-sections.ts` — the Root console's sections, listed once for
  its side nav and groups (Step 77.6, `.test.ts`);
  `lib/account-settings.server.ts` — what `/account` settings shows
- `lib/auth.ts` — `getSessionUser` (who the session's token names, checked
  on the server against the project's signing key, Step 61) / `getUser`
  (the Auth server's user, for a confirmed address) / `getProfile` /
  `requireProfile` / `requireSelfPerson`, each read once per render
  (server-only; roles are per tree, see `lib/tree-context.ts`)
- "This is me" (Steps 36, 43): `lib/claim-merge.ts` — who the merge moves
  and what it asks first (`relativesThatMove`, `mergeConfirmation`), and the
  photo file it has to move (`claimedPhotoMove`; `.test.ts`);
  `lib/claim-merge.server.ts` — `moveClaimedPhoto`, which moves it with the
  service role (`.test.ts`)
- `lib/site-url.ts` — `getSiteUrl()` for magic-link redirects and invite links
- Request alerts (Step 30.1): `lib/request-alerts.ts` — the caps and the
  new-ask test (`.test.ts`); `lib/request-alerts.server.ts` — emails a
  tree's Roots or the beta reviewers after the response, their addresses
  from `tree_root_emails` / `beta_reviewer_emails` (service role only);
  `lib/emails/access-requested.ts` / `tree-requested.ts`;
  `lib/admin-queue.ts` — the console's queue cards, where the header's count
  goes (`pickQueueTarget`) and the emails' button (`openConsoleHref`,
  `.test.ts`); `lib/safe-next.ts` — the same-origin `next` a signed-out
  visit carries through sign-in (`.test.ts`); `lib/invite-address.ts` —
  whether an emailed invite is someone else's for the signed-in address
  (`sentToAnotherAddress`) and `redeem_invite`'s refusal of it
  (`isAnotherAddressRefusal`; Step 51, `.test.ts`); `lib/family-link.ts`
  — the family link's cap (`FAMILY_LINK_MAX_USES`, which
  `private.family_link_max_uses()` must match), full or not, its count and
  WhatsApp link (Step 52, `.test.ts`); `lib/family-link.server.ts` — the
  tree's link and who joined with it (`family_link_joins`)
- Engagement (Step 56): `lib/dashboard.ts` — what `engagement_dashboard()`
  answers, read and worded for the tab, and the chart's axis
  (`countAxis`; `.test.ts`); `lib/dashboard.server.ts` — `loadDashboard`,
  for a beta reviewer only; `lib/active-days.ts` — the UTC day and
  `NotedToday`, which keeps the proxy to one `note_active_day()` call a
  member a day on each server (`.test.ts`), called from `proxy.ts` through
  `lib/supabase/middleware.ts#noteActiveDay` in the background
  (`event.waitUntil`)
- Asking a relative (Step 30.5): `lib/invite-relays.ts` — the caps (on
  every ask, `askWithinCaps`, and on a member, `memberWithinCaps`), when an
  ask lapses (`relayLapsed`, Step 41.5), the form's checks and words, the
  member's link (`relayHref`; `.test.ts`); `lib/invite-relays.server.ts` —
  `passOnRelay`, run after the newcomer's answer: clearing old notes and
  lapsed asks, noting and counting the ask (`invite_relay_asks`, Step
  41.5), the member by address (`invite_relay_recipient`, service role
  only), their caps, the email (`.test.ts`); `lib/emails/invite-relayed.ts`;
  `lib/relay-candidates.server.ts` — the entries an ask's name matches on
  each of the member's trees (`invite_relay_candidates`, Step 41.1;
  `.test.ts`); `lib/opened-relay.ts` / `.server.ts` — what settings says
  about the ask the email named once it isn't waiting (`.test.ts`);
  `components/relay-invites.tsx` — the invite filled in, on
  the member's account settings, with those entries to invite them as;
  `components/relatives-can-ask.tsx` — the member's opt-out box (Step 41.5)
- `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC/actions), `middleware.ts` (session refresh), `admin.ts` (service role, server-only)
- `lib/database.types.ts` — generated Supabase types (regenerate after schema changes)
- `supabase/` — local CLI project linked to `kkmemshpkxrzogijxgnb` (`Product-Ancestree`)

## Conventions

- shadcn primitives + semantic tokens only (no raw hex). Mobile-first, WCAG AA.
- All DB DDL via the Supabase MCP (`apply_migration`, sanity-checked with `execute_sql`).
- Every table RLS-scoped via `profiles.auth_user_id = auth.uid()`.
- Private storage buckets (`photos`, `album`, `stories`) served via signed URLs.
- Commit prefix: `Ancestree v1 (step/total): <subject>`.

## Data model

Applied on Product-Ancestree (`kkmemshpkxrzogijxgnb`). Local source of truth:
`supabase/migrations/`.

| Table                    | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trees`                  | A family's canvas (Step 25): `name`, URL `slug` (unique, follows the name), `created_by` = founder — **one founded tree per member** (partial unique index); created only by `found_tree` (once a beta reviewer has approved the member's request, Step 28) / a founder invite / the allowlist bootstrap, deleted only by `delete_tree`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `tree_members`           | **The account type, per tree** (Step 25): `(tree_id, user_id, role)`, `role` ∈ `admin` \| `branch_admin` \| `member` (Root / Branch / Leaf; `leaf` retired in Step 34). Written by RPCs (`join_tree`, `set_member_role`, `remove_tree_member`) behind `tree_members_guard` (Roots set types; Root is permanent per tree) and `tree_members_limits` (Step 39: at most two Roots a tree, four Branches a Root). `branch_granted_by` = the Root who made them a Branch, whose four they count toward — set by the trigger, never chosen, null unless a Branch |
| `tree_placements`        | Which trees show a person, how much of them, and where the card sits there: `(tree_id, person_id, status, approval none\|asked\|approved\|declined, detail basic\|full (generated), asked_at, answered_by, reminded_at, lapse_told_at, pos_*)`. The home tree always shows the whole entry (trigger); others come from `place_people`, at once, as a basic card (name, place of birth, lines) while `approval` is `asked` or `declined` (Step 80). The member whose entry it is, or whoever may edit nobody's own entry, answers with `answer_placements`. An ask gets one reminder after 7 days and lapses after 30, read as `lapsed` though the row keeps `asked`; a Root asks again with `ask_placements_again` (Step 83). `status` is always `active` now; `pending` and `declined` there are Step 25's and no longer written |
| `tree_visibility`        | A Root opens their tree, read-only, to the members of another tree they're on: `(tree_id, viewer_tree_id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `profiles`               | `auth.users` row: `display_name`, `self_person_id` (one entry, wherever it's shown), `relatives_can_ask` (whether a newcomer's ask may reach them, on unless they untick it; Step 41.5). No account type here: that is `tree_members.role`, per tree (the pre-Step-25 `profiles.role` was dropped in Step 25.6). A member writes only `display_name` and `relatives_can_ask`, on their own row, and never inserts one: `self_person_id` and `invited_by_user_id` are set by the security-definer RPCs alone (Step 42: column grants, `profiles_guard`) |
| `people`                 | Demographic nodes, **one row per person across all trees**. `tree_id` is the person's **home tree** — whose rules govern their details (Step 25; moved by `set_home_tree`). `hidden_from_visitors` blurs them to visitors. Card positions live on `tree_placements`, not here (the pre-Step-25 `people.pos_*` were dropped in Step 25.6). `owner_user_id` starts as `created_by` and moves on claim. `date_of_birth_precision` / `date_of_death_precision` (`day` \| `month` \| `year`, Step 17) say how much of each date is known — a partial date is stored on the first day of its period, CHECK-enforced, so year-only readers need no change. A birthday with no year is `birth_month` / `birth_day` (Step 63), set only while `date_of_birth` is empty, so they see no year either. `date_of_birth_circa` / `date_of_death_circa` (Step 81) mark a date as a rough estimate, shown "c. 1950"; each needs its date (CHECK), and `people_before_write` clears it when the date is emptied. `place_id_birth` / `place_id_death` → `places(id)` (Step 4.5b; nullable, backfilled — legacy `city_of_birth` / `country_of_birth` / `place_of_death` text kept until reconciled). Nothing about ancestral lands is stored: a card shows Native Land Digital's names, looked up live, or nothing (Step 40; Step 27's `ancestral_lands_birth` / `ancestral_lands_death`, the family's own words, were never used and were dropped in Step 40.5). `placeholder_number` (Step 98.2) is set only on a **placeholder child** — no details at all (`people_placeholder_empty`; `people_required_identity` asks it for no name), shown "First Child", "Second Child"… — and cleared for good when their parent fills it in. An entry made a placeholder in Step 98.3 keeps what it had been given in `private.withheld_details` (old columns as jsonb), read only by its parent and the child (`withheld_details`) until the parent shows it (`reveal_withheld_details`) or forgets it (`forget_withheld_details`) |
| `relationships`          | A fact about two people, not a tree (Step 25): a tree draws it when both ends are placed there; `tree_id` records the tree it was drawn on, and uniqueness ignores it. Directed `parent` edges; undirected `spouse` pairs (optional `marriage_date`, or `marriage_month` / `marriage_day` with no year (Step 63), / `is_divorced` / `divorce_date`, spouse-only by CHECK); siblings inferred |
| `connection_suggestions` | Implied-connection prompts surfaced by the add-person flow (`suggested_type` spouse/parent/sibling_check, `source`, `status` pending/accepted/dismissed); UNIQUE (subject, related, type, source) = no re-prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `invites`                | Shareable tokens into one tree (`active` \| `accepted` \| `revoked`); `founds_tree` (Step 25) makes it a founder invite — redeeming plants a new tree with the redeemer as Root. `max_uses` set (1–20) makes it the tree's **family link** (Step 52): one per tree, open to anyone who has it, counted in `use_count` and kept after each join; made, rotated and re-capped only through `rotate_family_link` / `set_family_link_cap` (`family_link_guard`). Who joined with it: `private.family_link_joins` (read by Roots through `family_link_joins`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `invite_requests`        | Public invite asks — first/last name + email, `pending` \| `approved` \| `declined`, `invite_id` of the link minted on approval. Admin-only RLS; inserted server-side with the service role (no `anon` grant). One pending row per email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tree_requests`          | Asks to start a tree during the beta (Step 28): a member's (`user_id`) or a waitlist sign-up's (name + email only), `pending` \| `approved` \| `declined`, answered by a beta reviewer (`private.beta_reviewers`). A member's approval is their permission to `found_tree`; a sign-up's approval mints a founder invite (`invite_id`). Reviewers see and answer every row, a member only their own; members ask through `request_tree`, the waitlist is written with the service role. One pending ask per member and per waitlist address                                                                                                                                                                                                                                                                   |
| `invite_relays`          | Asks a newcomer with no match passed on to a relative (Step 30.5): their typed first/last name + email and the member it went to (`recipient_user_id`), `pending` \| `invited` \| `dismissed`, the tree they were invited to, `email_sent`. Only that member reads and answers it (RLS; update granted on the answer's columns only); filed by the server with the service role, and the rows are what the member's caps count. One open or dismissed ask per address and member. A pending ask lapses after 30 days, and is deleted as new asks come in (Step 41.5) |
| `newsletter_settings`    | The weekly newsletter, per member (Step 95): `subscribed` (on unless they turn it off; no row = on), `token` (the email's unsubscribe link, which works signed out), `last_issue_at` (one issue a week, however often the job runs). A member reads their own `subscribed` only (RLS + a column grant) and changes it through `set_newsletter`; the token and the rest are the service role's (`newsletter_due`, `claim_newsletter_issues`). Its own table, not a `profiles` column, since relatives can read each other's profiles |
| `newsletter_schedule`    | When the weekly newsletter goes out (Step 95), one row: `weekday` (0 = Sunday), `paused`, `updated_by`. Beta reviewers read it (RLS) and change it through `set_newsletter_schedule`; the daily cron job reads it with the service role and sends only on that day, unless paused |
| `invite_relay_asks`      | A note of every ask to a relative, whoever the address belongs to (Step 41.5): the address asking and `created_at`, never the relative's. What the caps per address and across the site count, before anyone is looked up. Service role only (RLS on, no policies, no grants to `anon`/`authenticated`); an ask past a cap leaves no note, and notes older than a day are deleted as new asks come in |
| `claims`                 | Auto-approve / reject a person entry (`resolved_by`); a dispute of one is an `entry_reports` row and leaves it `approved` (Step 88.2) |
| `notifications`          | In-app notices, **one inbox per tree** (`tree_id`, Step 25; `placement_requested` \| `placement_accepted` \| `placement_declined` added; `placements_requested`, one for a batch of entries someone may edit, Step 80; `placements_lapsed`, to the Root whose ask nobody answered in 30 days, Step 83; `tree_request_approved`, Step 28; `placed_on_join`, Step 30.9, and what a claim invite did, Step 41.3; `joined_by_link`, Step 52; `story_to_approve`, `story_approved`, `story_declined`, Step 88.3; `story_commented`, Step 88.4); recipient-scoped RLS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `stories`                | Stories about a person (Step 88.3, in place of the per-tree comments board): `title`, `body` and/or a recording (`audio_path` in the private `stories` bucket, `<person id>/<uuid>.<ext>`; `audio_seconds`), `pending` \| `approved` \| `declined`, `decided_by`, the tree it was told on (`tree_id`, where its teller hears back). Approved: read by members of every tree showing the person in full. Pending: its teller, and whoever approves it: the person themself once the entry is claimed or is their own and they're living (`private.story_owner`), else whoever `can_edit_person`. Declined: its teller alone. Told only through `add_story` (approved at once when the teller may approve it), answered through `decide_story`; deleted by its teller or whoever may edit the entry; read by the sheet through `entry_stories` (runs as the viewer, names each teller; since Step 88.4 also its comment count, whether a link to it works, whether the viewer may share it or turn its links off, and their own link). `links_off` (Step 88.4): its links were turned off. `body` is Markdown (Step 99; the text as written, drawn as Markdown wherever it shows). `told_on` / `told_on_precision` (Step 99): when it was told, as much as is known, kept as a person's dates are. `created_by` is set null when their account goes |
| `story_links`            | Public links to approved stories (Step 88.4): one working link per sharer per story (`token`, 24 URL-safe characters; `created_by`, whom the page names; `revoked_at` / `revoked_by`). A link works while the story is approved and its links aren't off (`stories.links_off`), the person isn't `hidden_from_visitors`, and its sharer is still on a tree that shows them in full (`private.story_link_live`). Made only by `share_story` (anyone who can see the story; once its links were turned off, only its person, an editor of the entry or its teller, which turns them on again), turned off by `stop_sharing_story` (every link at once; those three). A member reads only their own; the public page reads with the service role (`shared_story`) |
| `story_credits`          | Who a story is credited to (Step 99): `(story_id, person_id, role)` with `role` `storyteller` \| `interviewer`, up to ten people each, one person may hold both. People placed in full on the tree the story is told on; set once, by `add_story` (`p_storytellers`, `p_interviewers`), with no yes of their own (the approver sees them with the story). Read by whoever reads the story (RLS follows `stories`); the sheet's `entry_stories` and the public page's `shared_story` return them as `credits`. Changed afterwards, with the date told, by `edit_story` (Steps 99.5–99.7: teller, entry editors, or the person it's about; the words by the teller alone, back to waiting unless they may approve). Cascade with the story or the person; a claim or an invited-entry merge moves a placeholder's credits across (`claim_person`, `private.merge_invited_entry`) |
| `story_comments`         | Comments on an approved story (Step 88.4), no approval; edited by their author through `edit_story_comment` (Step 99.9, `edited_at`): read by whoever may read the story, written only by `add_story_comment` (its teller and its person are told, `story_commented`), deleted by their author, the story's teller or whoever may edit the entry; listed through `list_story_comments`. `created_by` is set null when their account goes |
| `entry_reports`          | Problems reported with an entry (Step 88.2): `body`, `open` \| `resolved`, `resolved_by`, the tree it was raised on (`tree_id`, where its reporter hears back), and `claim_id` when it disputes that claim (one open at a time). Seen only by its reporter and whoever can fix it: `can_edit_person` for a problem, the home tree's Roots for a dispute. Written only by `report_entry` / `resolve_entry_report` / `decide_claim_dispute`; its reporter may delete (withdraw) an open one; `created_by` is set null when their account goes |
| `album_photos`           | Album photos (Step 88.5, in place of documents): one uploaded file (`file_path` in the private `album` bucket, `<tree id>/<uuid>.<ext>`, at most 1600px, shrunk in the browser), an optional `description` (≤ 500), when it was taken (`taken_on` + `taken_on_precision`, `day` \| `month` \| `year` on the first day of its period like a person's dates, both or neither, not after tomorrow; Step 88.6), who added it (`created_by`, set null when their account goes) and the tree it was added on (`tree_id`, where they hear back). Seen by its uploader and by whoever sees one of its tags (`private.can_see_album_photo`); added only through `add_album_photo`; deleted by its uploader. It goes by itself when nobody is in it any more (`album_tags_last_gone`), and its file with the service role from the app |
| `album_tags`             | Who is in each album photo (Step 88.5), one row a person, each approved on its own: `pending` \| `approved` \| `declined`, `decided_by`. Approved: read by members of every tree showing the person in full. Pending: its photo's uploader and whoever approves it, the same people as a story (`private.story_owner`, else `can_edit_person`). Declined: the uploader alone. Tagged only at upload (approved at once where the uploader may approve), answered through `decide_album_tag`; removed by the uploader, the approver or whoever may edit the entry (`private.can_untag`); read by the sheet through `entry_album` (runs as the viewer) |
| `places`                 | GeoNames reference data (populated places + admin areas) for birthplace autocomplete; not tree-scoped — read by any member, written by the import script and by a Root's **Add a place** (ids from 10,000,000,000); a row for each country (Step 79: ids from 9,000,000,000, no coordinates, never found by the name search)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `historical_names`       | Curated period names for a place/country over a date range (Step 4.5d); matched by `place_id` then `country_code` against a birth/death year. Read by any member; seeded by migration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pets`                   | Companion animals — a deliberately thin, non-human entry: name, species (`cat` / `dog` / `other` + `species_label`), `year_born` / `year_died`, an optional exact `birth_date` (must agree with `year_born`) and an optional GeoNames place of birth (`place_id_birth` FK + denormalised `city_of_birth` / `country_of_birth`, exactly like a person; Step 27.7's `ancestral_lands_birth` was dropped in Step 40.5, as on a person), photo, and a `pos_dx` / `pos_dy` nudge. No lineage, claims, stories or album                                                                                                                                                                                                                                                                                                                                                                               |
| `pet_companions`         | Which people a pet lived with (`pet_id` + `person_id`). Many-to-many, undirected, no lineage meaning; a trigger deletes a pet once its last companion goes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pet_comments`           | A plain comment thread on a companion (`pet_id`, `body`, `created_by`). No flags, no open/resolved lifecycle, no notifications; author or anyone who `can_edit_pet` may delete                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

**Checks:** `people` requires first **or** preferred name, last name, and
`is_deceased` (NOT NULL). A place of birth is optional since Step 44
(`people_required_identity` no longer needs a country; an entry without one
holds `''` in `country_of_birth`). When one is picked it's a
**`place_id_birth`** (GeoNames `places` FK, Step 4.5c), and `city_of_birth` /
`country_of_birth` are still written (derived from the picked place). It can
be a whole country (Step 79): then `city_of_birth` is empty, and a place of
death's `place_of_death` is just the country's name. `lineage_type` is writable by admins only.
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
its own companions, and draw lines between people it
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
entry. Filling in what's missing (`private.can_fill_person` +
`public.fill_person_blanks`, Step 44): a Branch or a Leaf may set the empty
fields of an entry nobody has claimed on their own line (`private.line_ids`),
past what they can edit, and a photo where there's none
(`storage_photos_insert_fill`), but never change or clear a value; the
`people_update` policy is unchanged. Deletes (`private.can_delete_person`, Step 22.3): a Root anything; a
Branch or a Leaf an entry they created that is still theirs — owner
unchanged, no claim of any status, nobody's own entry, not their own — and
only while every connection, story, album photo and companion on it is theirs
too; otherwise "ask a Root".
A claim moves
`owner_user_id` to the claimant, so the creator then loses edit rights until an
admin reverses the claim.

**Branches (Step 17, re-anchored in 18.1, narrowed in 22.2):** a
`branch_admin` curates their part of one Root's side of the tree. A branch is
measured from one person by the bloodline gate's first up-then-down walk
(`private.branch_ids`, which takes no sibling lines, as the bloodline has
since Step 55): climb `parent` edges to every ancestor, descend from
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
what others added, setting `lineage_type` and the Root console stay
Root-only.
`lib/branch.ts` mirrors the rule for the UI; the database decides. The rule
is the entry's **home** tree's, whichever tree shows it: a canvas asks who
the member is there (`entryRights`; `/tree` reads their account type on
their other trees that are home to someone shown, `getHomeTreeAccess`,
Step 93), as the edit page (`entryAccess`) does.

**Your Root's side (Step 48):** the canvas's "Show only your Root's side"
draws just the side of the tree a member belongs on, laid out again around
their Root. Their Roots are the ones they're blood to, or, if they married
in, the ones whose branch they married into (`lib/branch.ts#ownRoots`).
Blood comes first because two Roots married to each other are each on both
branches by marriage, but only on their own side. The side is those Roots'
branches (`rootSideIds`); a Root's switch reads "Show only your side". It
isn't offered when the side is the whole tree (a child of two Roots, or a
tree whose people are all on one side). It changes only what the canvas
draws, searches and lights: permissions and a person's details still read
the whole tree. It lasts for the visit, and anything that points the canvas
at someone off the side (a notification's "View on tree", a companion's
person) switches it off.

**Only descendants of (Step 57.2):** under Filters, one or two people, and
the canvas draws only them, everyone descended from them and whom those
people married (`lib/branch.ts#descendantIds`), laid out around the people
picked. Two people draw both lines (the union), not only the children they
share; nobody's brothers or sisters come along. With the Root's side on too,
it picks from that side and draws within it. Each row keeps the whole
tree's generation name (`computeTreeLayout`'s `generations`), so a filtered
row still says "Generation minus Two". Like the side, it changes only what
the canvas draws, searches and lights, and lasts for the visit.

**Upcoming (Step 57.1):** the card at the canvas's top left lists birthdays and
wedding anniversaries over the next twelve months (`lib/occasions.ts`),
grouped Today / Tomorrow / This week / by month, in the viewer's own time
zone (`use-today.ts`). A birthday needs a whole date of birth, or a day and
month with no year (Step 63; **Birthday**, with no age), and a living person
(29 February falls on the 28th in other years); an anniversary needs a
wedding date, or its day and month (**Anniversary**, no count of years),
and a couple both living and not divorced. It lists only who
the canvas draws, and of those who a search leaves lit (a couple while either
is), so the side and descendants filters narrow it too, with a "Filtered"
chip. Closed, its button counts the week ahead. A birthday opens the person;
an anniversary lights the couple's line. Members only: not on a share link or
for a visitor from another tree. **Share** (Step 89), beside the ✕ while
anything falls in the week, types the week out for a family chat, a line
each ("🎂 Today: Amina Khan's birthday", "💍 Sat 3 Oct: Ahmed & Sara
Khan's anniversary") under "This week:", names and occasion only (no ages,
years or maiden names), as the card's filters leave it. Its menu:
**WhatsApp** (`wa.me`), **Messages** (`sms:`; Apple and Android only),
**Copy**, and **More…** (the device's share sheet) where there is one. The
member picks the chat and sends it; nothing is sent by us.

**Who's here (Step 57.3):** members with the same tree open see each other's
faces above **Upcoming** and each other's pointers on the canvas. It
runs on a private Supabase Realtime channel, `tree:<tree id>`
(`use-tree-room.ts`): Presence (keyed by the member's user id, with their
entry and short name, and `away` while every tab of theirs is in the
background) and a `cursor` broadcast. Migration `tree_presence` lets only
the tree's members join (`private.topic_tree`, policies on
`realtime.messages`); share links and visitors never try. Nothing is stored.
A pointer is sent as an offset from the nearest card (`lib/presence.ts`), so
it lands beside the same person when layouts differ (a filter on, a card
pulled out), and isn't shown when that card isn't drawn here. It's sent only
while someone else is here, at most every 80 ms for two people and slower as
the room grows (the free plan relays 100 messages a second), never for touch,
and cleared when the pointer leaves the canvas, is over a card of controls,
or the tab goes to the background. Each person has a colour worked out the
same way on every screen (`presenceColours`). A face goes to their pointer,
or their card. Rooms are shared and closed 1.5 s late, since realtime-js
reuses a same-topic channel even while it's leaving.

**Account types (Step 18; three since Step 34):** three kinds of member,
named for the tree they grow. `lib/account-types.ts` is the model — the only
place a stored key becomes a name, and where each type's reach is written
down (`entries`, `connections`, `companions`: `tree` / `branch` / `own`;
`addRelatives`: `tree` / `line`; `claimInvites`; `deletes`; `runsTree`;
`limit`) — so a name can change without a migration. The limits (Step 39)
live in two places that must agree: `ROOTS_PER_TREE` / `BRANCHES_PER_ROOT`
here, for the UI, and `private.roots_per_tree()` / `branches_per_root()` in
the database, which enforces them.

| Stored `role`  | Name       | Reach                                                                                                                                                                                                                                                                                              |
| -------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`        | **Root**   | Everything, plus running the tree: members and their account types, invites, share links, deletes, lineage                                                                                                                                                                                         |
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
`tree_members_guard` raises `ROOT_IS_PERMANENT` on any change to a Root's
membership, and `remove_tree_member` refuses them (before Step 25.6 the
dropped `profiles_protect_role` did this). A Root may still delete their own account from `/account`, but the tree is
never left without a Root: the only Root must first choose another member to
take over (`DeleteAccount` → `deleteAccount(successorId)`), who is made a
Root — for good — and inherits what the departing Root added. A new Root also becomes one of
the Roots whose sides the Branches tend (`private.root_person_ids`). Who may
invite follows from the type alone — the per-member `can_invite` grant was
retired, and the column dropped, in Step 22.1 — and every invite link makes
someone a Leaf (see **Invites join as Leaves** under Auth & invites).

**How many (Step 39):** a tree has at most **two Roots**, and each Root makes
up to **four Branches**, counted by who made them one
(`tree_members.branch_granted_by`), so one Root can't spend another's four.
Leaves, and members, are unlimited. `private.tree_members_limits`, a trigger
beside the guard, records the Root whenever someone becomes a Branch (a Root
can't name another; making them a Leaf or a Root clears it) and refuses a
third Root (`ROOT_LIMIT`) or a fifth Branch (`BRANCH_LIMIT`) from every
caller — `set_member_role`, a Root's direct write, and the RPCs' own inserts
alike — locking the tree's row before it counts. A limit only stops a
promotion: nobody is ever demoted by one. Roots being permanent, a Root's
place only opens when one deletes their account; that Root's Branches then
pass to their successor (or the other Root) with their entries, and may take
them past four — they just can't make another until they're under. On
`/admin` the picker shows a type the tree has no room for greyed out, with
why ("This tree has its two Roots", "You’ve made your four Branches"); the
members table says "Roots: 2 of 2. Branches you’ve made: 1 of 4 (…)" and
who made each Branch one; making a Root says it's the tree's last place.

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

**Storage:** private buckets `photos`, `album` and `stories`, served only
through signed URLs. A portrait's path is `{tree_id}/{person_id}/{filename}`:
readable by every member; only whoever can edit the entry can write it.
An album photo's is `{tree_id}/{uuid}.{ext}` (Step 88.5): any member of
that tree may upload there, and its file is readable by whoever can see the
photo, or by its uploader while no photo points at it (so a refused upload
can go again). A photo's file must sit under its own entry's id:
`storage_photos_select` reads the person in the path. So when "This is
me" gives the claimed entry the placeholder's photo, `claimPerson` moves the
file into the claimed entry's folder with the service role (Step 43,
`moveClaimedPhoto`), as deleting an entry sweeps its files.
**A replaced photo's file goes (Step 82):** each writer of `photo_path`
reads what it held before the write, and once the write has gone through,
the file it replaced or cleared is removed after the response, with the
service role, when it lies in that entry's or companion's own folder (the
files its editors could remove themselves) and nothing points at it: no
entry or companion, and no Branch's edit a Root can still undo, since the
undo puts the old photo back from `entry_revisions.before`
(`lib/photo-cleanup.server.ts`). A new writer of `photo_path` calls
`removeReplacedPhotos` the same way.
**A deleted row's file goes with the service role (Step 90):** storage
deletes only what the caller can see, and an album photo's file (a
document's, until Step 88.5) is visible only while its row exists, so a
member's own client can never remove it once the row is gone (it matches
nothing and reports no error). Deleting an album photo, taking the last
person out of one, deleting an entry and deleting a tree all delete the
rows as the caller (the proof of the right), then remove the files with the
service role, only those no row points at any more
(`lib/file-cleanup.server.ts`). Any new code that deletes rows holding a
file path does the same.
**Cards show a small copy (Step 87.5):** every page that draws the canvas
signs each photo twice: full size (`photo_url`: the sheet, its photo
dialog, the cropper, a card's hover preview) and a storage transform that
fits it in a square of `cardPhotoEdge(crop)` px, 128 at zoom 1 and 64 more
per step of the crop's zoom, `resize: contain` so it keeps its shape
(`photo_card_url`: every small face). A width alone would keep the full
height and stretch it. The crop is CSS, so the copy frames the same.
Storage signs a transform one photo at a time (`signedCardPhotoUrls`, in
parallel with the rest); where it won't, the card gets the full address.
**Albums need approval, a person at a time (Step 88.5):** documents (Step
18.4's private bank per entry) are gone; an entry has an **Album** instead.
Anyone on a tree that shows someone in full may add a photo of them and tag
whoever else on that tree is in it; each tag waits for its own approval,
from the same people as a story: the person themself once the entry is
claimed or is their own and they're living, else whoever can edit it. Until
then the photo is in that album only for its uploader and the approver.
Not on share links, not to visitors, not on a basic card.

**Tags suggested from a photo's own details (Step 88.6):** Add a photo
reads the picked file before shrinking it (the canvas keeps nothing):
named face regions (Metadata Working Group, as Lightroom, digiKam and
Picasa write them; Microsoft's, as Windows Photo Gallery does), IPTC's
person shown, keywords (XMP `dc:subject`, keyword trees such as
Lightroom's `People|…` and digiKam's `People/…`, IPTC, Windows' Tags) and
the date taken (EXIF, or a date written into XMP or IPTC later: of a scan's
camera date and a "1962" someone typed, the older). The people a name
fits are offered under "Who's in it" as "Suggested", one press each or
"Add all": a full name (given or preferred, then last or maiden, middle
names or initials between) from anywhere; a given name alone only from a
face or a People keyword, and only when one person has it. Where a name
fits several, those alive when it was taken come first, and the others
drop out; nobody the name alone fits is left out for their dates. The
same date puts everyone in the picker in that order, and fills in "Date
taken" (kept as much as is known). No faces are looked at: nothing is
recognised, only names someone already wrote into the file. Phone
cameras and Apple / Google Photos exports rarely carry names, so most
photos suggest nobody and give only the date.

Helpers live in the unexposed `private` schema (`role_in`, `is_root_of`,
`is_branch_of`, `is_tree_member`, `can_edit_person`, `branch_ids`,
`line_ids`, `root_person_ids`, `own_branch_ids`, `is_on_own_branch`,
`can_see_stories`, `person_is_someones_own`, `can_edit_relationship`,
`can_edit_pet`, `can_delete_person`, `revision_fields`, `notify_edit`,
`member_label`, `suggestion_columns`, `tending_branches`).

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

**Suggested changes (Step 67):** anyone on a tree an entry is shown on who
can't edit it may suggest a change to its details (`public.entry_suggestions`,
through `public.suggest_entry_change`): names, sex, date and place of birth,
whether they've died, date and place of death, never a photo, lineage or
contact details (`private.suggestion_columns`, mirrored by
`lib/suggestions.ts#SUGGESTION_DETAILS`). The function keeps only the details
that differ from the entry, each with the columns that change together (a
date with its precision and a birthday's day and month, a place with its
labels), in `changes`, and what they held in `before`; it tries the result
against every check on `people` and undoes it, so what can't be applied isn't
stored. It replaces the suggester's earlier suggestion for that entry, if one
is waiting (one at a time: `entry_suggestions_one_pending`), and sends a
`change_suggested` notice, in the home tree's inbox, to the entry's owner,
each Root of its home tree and, since Step 68, each Branch there who tends it
(`private.tending_branches`: whose part of a Root's side it's on, measured
from their own entry as `private.own_branch_ids` measures it for the caller,
while it's nobody's own), carrying `notifications.suggestion_id`.
`public.decide_entry_suggestion` lets anyone who may edit the entry
(`private.can_edit_person`, the `people_update` rule) accept it, writing the
changes as their own edit (so `person_edit_notify` tells the owner and maker,
and a Branch's change to a Root's entry keeps the Root's undo), or decline it;
either way the suggester hears (`suggestion_accepted` /
`suggestion_declined`, in the inbox of the tree they suggested from).
Declining may say why (Step 69): up to 500 characters in `decline_reason`
(kept only on a declined suggestion), quoted in the suggester's notice and
shown on the notices of the others who were asked. Since Step 71 the
notice telling the suggester carries the suggestion too
(`decide_entry_suggestion` writes it itself, with `suggestion_id`), so it
shows what they suggested and, when it was declined, **Edit and resend**:
`/people/[id]/suggest?from=<id>` opens the form on it, their changes and
note, under who declined it and why, to send as it is or changed as a new
suggestion (the declined one stays). Without `from`, the form offers their
latest answered suggestion when that was declined. Since Step 72 the entry's
card shows the suggester their own declined suggestions too, after anything
waiting, newest first (`listOwnDeclinedSuggestions`, their own only), each
with who declined it and why and **Edit and resend**, and since Step 73
**Dismiss**, which sets `dismissed_at` (only on a declined suggestion; a
column grant and the `entry_suggestions_dismiss` update policy let only its
suggester set it) and takes it off their card and the form's hint; it stays
declined, and on everyone's notices. Since Step 74 its toast has **Undo**
(`restoreEntrySuggestion`), which clears `dismissed_at` through the same
grant and policy and puts it back. RLS: the
suggester and whoever may edit the entry read it; the suggester deletes it
while it waits (withdrawing, which takes its notices with it) and sets or
clears `dismissed_at` on a declined one; nothing else
writes it. `suggested_by_name` keeps what the suggester was called, as
`private.member_label` said then, since a reviewer on the home tree may not
see the profile of a member of another tree the entry is shown on.

**Permissions matrix (Step 22; three types since Step 34):** the whole
picture in one place. The
database enforces every row; `lib/account-types.ts` (`describeAccess`, shown
by the account-type cards on `/account` and `/admin`) and `lib/branch.ts`
mirror it for the UI.

|                                                    | Root                                                                                                            | Branch                                                                       | Leaf                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| See the tree, add stories and photos, report a problem, claim their own entry | ✓                                                                                                               | ✓                                                                            | ✓                                    |
| Edit entries                                       | Every entry                                                                                                     | Their part of a Root's side (not another member's own), plus what they added | What they added, and their own       |
| Branch edits to a Root's entries                   | Told; one-click undo                                                                                            | Publish at once                                                              | —                                    |
| Suggest a change; answer one                       | Suggest where they can't edit; answer on every entry                                                            | Suggest where they can't edit; answer where they can                         | Same as Branch                       |
| Change connections                                 | Any                                                                                                             | Both ends on their side, or ones they drew                                   | Ones they drew                       |
| Companions                                         | Any                                                                                                             | On their side, or ones they added                                            | Ones they added                      |
| Add relatives                                      | ✓ (bloodline gate)                                                                                              | ✓ (bloodline gate)                                                           | On their own line (bloodline gate)   |
| Delete entries                                     | Any                                                                                                             | Unclaimed ones they added, while nobody else has built on them               | Same as Branch                       |
| Invite relatives                                   | As Leaves                                                                                                       | As Leaves                                                                    | As Leaves                            |
| Invite someone to claim an entry                   | Any unclaimed, living entry, as a Leaf                                                                          | Unclaimed on their side, as Leaves                                           | Unclaimed ones they added, as Leaves |
| Change account types                               | Anyone not a Root: Leaf, Branch, or Root (for good)                                                             | —                                                                            | —                                    |
| Demote or remove a Root                            | Never, themselves included; a Root may delete their own account, handing over to a new Root if they're the last | —                                                                            | —                                    |
| Root console, lineage, share links                 | ✓                                                                                                               | —                                                                            | —                                    |

## Auth & invites (Step 3)

- **Emailed codes only** (`supabase.auth.signInWithOtp`; a magic link
  until Step 53). `proxy.ts` redirects unauthenticated visits to protected
  routes → `/join?next=<where they were going>` (Step 30.1:
  `lib/safe-next.ts` takes only a same-origin path); the code box carries
  `next`, so signing in lands there — an alert email's console button is opened on the spot
  (`signInLanding`). Authenticated users without a member profile →
  `/join?status=pending`.
- **Signing in without an invite (Step 30.8, `lib/first-timer.ts` +
  `.server.ts`)**: someone whose verified address has no profile behind it
  (`ensure_profile` → `needs_invite`) is looked up by that address alone,
  with the service role, in this order. An invite bound to it (active,
  unexpired, unarchived; the newest) opens on its own page,
  `/join/<token>`, straight from the confirm tap (`establishMembership`)
  and from `/join` itself (so `requireProfile`'s redirect gets there too):
  it isn't redeemed on the spot, because its accept form asks for the
  privacy tick a plain sign-in no longer does (Step 30.4), and it says
  they're already signed in with that address. Else, a pending
  `invite_requests` row: `/join` says which tree it waits on and that its
  Roots have been told. Else, `/join` opens request access right there
  (`RequestAccessFlow` with `email`), the verified address filled in and
  read-only, so they type only their name; someone on the waitlist is told
  so above it. `/join` offers "Use another email" (`signOut` with `next`),
  and the header shows **Sign out** instead of a **sign in** that would
  only come back here. Only the address the account verified is ever
  looked up (`verifiedEmail` needs `email_confirmed_at`), and only its own
  token, tree name and waitlist yes/no reach the page.
- **A sign-in email carries a code, not a link (Step 53).** The subject
  says "{code} is your ancestree code" (readable off a notification) and
  the body shows it once, unbroken and `user-select: all`; there's no link
  and no button, so a mail scanner opening it spends nothing. Its length is
  the hosted project's `mailer_otp_length` (8), mirrored in
  `SIGN_IN_CODE_LENGTH` (`lib/sign-in-code.ts`) and `supabase/config.toml`:
  keep all three equal. The form that sent it turns into the code box
  (`SignInCodeForm`, from `MagicLinkForm` and the invite page's
  `SignInToAccept`): one `inputMode=numeric` field with
  `autocomplete=one-time-code` (Safari offers the code from Apple Mail),
  which keeps only the digits of a paste and sends itself once whole; a
  wrong code stays in the box, focused, and isn't resent until changed.
  `verifySignInCode` → `completeCodeSignIn` runs `verifyOtp({type:
  'email', email, token})` with the cookie client, then
  `establishMembership` as the link did: a bare or family link's invite
  redeemed (a newcomer lands on onboarding), an emailed invite's
  existing account joined at once (it came back to the invite a tap from
  **Join** before), else `next`. **Send a new code** re-posts the first
  send's fields (a minute apart, Supabase's `smtp_max_frequency`: "Wait a
  minute before asking for another code."), **Use another email** returns
  to the filled-in form. Email apps run no scripts, so the email can't
  have a copy button. A code can't be safer than the link's `token_hash`
  against guessing: every link email always carried a code too, checkable
  at `/auth/v1/verify` with the public key, so GoTrue's per-IP limit
  (`rate_limit_verify`) and the hour's expiry are the guard either way.
- **`/auth/callback`** exchanges a `code`, then either `redeem_invite(token)`
  (invite flow) or `ensure_profile()` (admin bootstrap). The link in sign-in
  emails sent before Step 53 carries a `token_hash` instead, and for that
  the callback only forwards to **`/auth/confirm`**, whose button POSTs to
  `confirmSignIn`. Opening a link must never spend the token: mail scanners
  (Outlook/Hotmail Safe Links) open every link before the recipient does,
  which is what left Raiya with "link already used" on every fresh link
  (Step 20).
- **An emailed invite is the sign-in link (Step 20)**: approving a request,
  a direct invite, and a claim invite all set `invites.invited_email`.
  `/join/<token>` then shows one "Accept & open the tree" button
  (`AcceptInviteForm` → `acceptInvite` → `signInWithInvite` in
  `lib/sign-in.server.ts`): with the service role it creates the confirmed
  auth user, mints a one-time token (`auth.admin.generateLink`), spends it on
  the spot with the cookie-bound client, and redeems the invite with the
  recipient's name — no second email. It refuses an address that already has
  a profile, so an invite is never a 14-day key to a live account: it asks
  `public.address_has_profile` (service role only, Step 30.8,
  `20260923077000`) before minting anything, since minting stamps the
  account and Supabase then won't email it a sign-in code for a minute.
  Instead the page offers that address an ordinary sign-in code
  (`sendInviteSignInCode` → `emailInviteSignInCode`: `signInWithOtp`,
  never creating an account); entering it on the page signs them in and
  joins, placing their entry (Step 30.9; since Step 53 with no **Join <Tree>**
  tap after). Opened signed out, the page asks `address_has_profile` as it
  renders (`opensOnSignInLink`, Step 41.2) and opens straight on **Email me
  a code**, with no tick; it only looks up, since mail scanners open the
  page too. Accepting still falls back to the code for an address that got
  an account after the page loaded. Because
  the token holder becomes that address, only a Root or the service role may
  set `invited_email` (`invites_guard`); the family link (Step 52, below),
  like the bare links before it, has no address and still asks for one and
  verifies it by email. The privacy
  checkbox sits on the ask-to-join form (`/request-invite`, and a share
  link's dialog, Step 41.4) for people who ask, on both waitlist
  forms for people who'll get a founder invite (Step 30.6), and on the
  accept page for people invited cold.
- **Only the address it was sent to (Step 51,
  `20260925120000_emailed_invite_joins_its_address`)**: `redeem_invite`
  refuses an invite with `invited_email` for any account whose own address,
  verified (`auth.users.email` with `email_confirmed_at`, any case), isn't
  that one: `INVITE_FOR_ANOTHER_ADDRESS`, 42501, before anything is written.
  Until then only the signed-out path bound it. A member who opened a
  forwarded email, anyone on a shared device, or a Root checking a claim
  invite they'd sent joined in the recipient's place, and a claim invite
  gave them its entry (claimed, or folded into their own). The RPC is
  callable directly and any sign-in link can be given an `invite=`, so the
  database is what enforces it. The family link still joins whoever opens it.
  `/join/<token>` now looks the recipient up for a signed-in member too.
  At another address it says "{Inviter} invited {address} to join {tree}
  and claim the entry for {name}. You're signed in as {yours}. Only
  {address} can accept it." with **Sign out** (`signOut`, `next` = the
  invite), which comes back signed out to the usual path for that address:
  the one-tap accept for a newcomer, **Email me a code** for an address
  with an account. A refusal that gets past the page is named
  (`redeemInvite` answers `another_address`, `lib/invite-address.ts`):
  **Join** toasts "This invite was sent to another email address." and
  redraws the page (`refresh()`), and a sign-in link carrying the invite
  lands on its page rather than "invalid". Someone signed in with no
  profile keeps the accept form, which signs in the invite's own address.
- **The family link (Step 52, `20260925150000_family_link`)**: one open
  invite per tree for a family group chat, which only a Root makes
  (Root console → Invites → **Family Link**). It's an `invites` row with
  `max_uses` set, so `/join/<token>` and sign-in take it as they took a
  bare link: signed out, the name-and-email form and its sign-in email;
  signed in, **Join <Tree>**. Whoever opens it joins as a Leaf, invited by
  the Root who made it. The Root picks a cap, 1 to 20
  (`FAMILY_LINK_MAX_USES` = `private.family_link_max_uses()`); once that many
  have joined, `invite_preview` and `redeem_invite` treat it as used up
  until a Root raises the cap (`set_family_link_cap`, never past 20) or
  rotates it. **Rotate** (`rotate_family_link`) is like rotating an API key:
  the row is replaced, with a fresh token and count, attributed to that
  Root, and the old link stops working at once. **Turn off** deletes it. It
  never expires (Aalim, 2026-09-25). `redeem_invite` counts a newcomer
  under the row lock, logs them in `private.family_link_joins` (which
  outlives rotations: its `invite_id` says which link) and keeps the row;
  someone already on the tree goes through uncounted, and the page tells
  them "You're already on {tree}" with **Open {tree}**, which switches to
  it without touching the invite (not for a claim or founder invite). Each
  Root gets a `joined_by_link` notice, "{Name} joined {tree} with the
  family link (3 of 20)" (", now full" at the cap) with **View family
  link**, or, when joining brought their own entry, the `placed_on_join`
  notice worded the same way. The card lists who joined, newest first, with
  their account type there now (**Left** once gone) and "earlier link"
  for one since rotated. Through the API nobody, a Root included, can make
  one, change its cap, count or token, or turn an invite into one
  (`family_link_guard`, security invoker on `current_user`, like
  `profiles_guard`); a unique index keeps one per tree. The single-use
  bare link it replaces ("Create invite link") is gone from the admin
  console and the account page, and a Branch or Leaf can no longer make
  one; the ones already out work until they expire, listed under **Bare
  Invite Links** while any are left.
- **The name someone joins by (Step 30.7, `lib/joining-name.ts`)**: an
  emailed invite's request row goes when it's redeemed, so the new auth
  account keeps its first and last name (`user_metadata`, set by
  `signInWithInvite`'s `createUser`). The family link's form (a bare
  link's, before Step 52) asks for a first
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
- **Invite tokens** (`public.invites`): an invite is a single-use, 14-day
  link `"/join/<token>"`. Emailed ones are written with the service role
  once the server has checked the sender; a Root may also insert one under
  RLS (`can_invite_as`), but since Step 52 nobody else may make one open to
  anyone (`invites_guard`): that is the family link's job, and a Root's. `redeem_invite` (SECURITY DEFINER) creates the member
  `profiles` row with `invited_by_user_id = invite.created_by` and flips the
  invite to `accepted`. `invite_preview(token)` is the only pre-auth RPC.
- **Invites join as Leaves (Step 18.2; one type since Step 34)**: every
  invite carries `invites.joins_as`, always `member` — the Leaf — and
  `redeem_invite` joins the tree with it. Anyone on the tree may invite
  someone by email: a Root, a Branch or a Leaf (`private.can_invite_as`);
  only a Root makes the family link (Step 52). Branch and Root are
  never given by link, only by a Root afterwards. The `invites_guard`
  trigger keeps changing a link's claim target (`person_id`) to Roots, so
  nobody can aim a link at someone else's entry.
- **Joining with an entry of your own** (Step 30.9,
  `20260923073000_place_own_entry_on_join`): when `redeem_invite` redeems an
  ordinary invite for someone who already has their own entry, it places
  that entry on the tree they've joined, active, with themselves as
  `placed_by`: accepting is their say-so. A pending or declined placement
  left by an earlier request becomes active. Each of the tree's Roots gets a
  `placed_on_join` notice with **View in Root console**, which switches to that tree
  and opens "Who This Tree Shows", where they can take it off. The member
  lands on their entry (`self_placed`). Since Step 41.3 a claim invite
  places it too, or folds the invite's entry into it (below). A founder
  brings their entry over on the first run (Step 29), and if placing fails
  they still join.
- **Invite someone to claim an entry** (`20260904100000_invite_to_claim_entry`,
  widened in Step 22.1): an invite with
  `person_id` set names the entry on `/join/<token>` and lets whoever redeems
  it claim that entry without the name match. Since Step 30.2
  (`20260923070000`), redeeming it claims the entry there and then for
  someone with no entry of their own: `redeem_invite` runs
  `private.claim_as_self` — the checks and effects of `claim_person_as_self`,
  creator's notice and dispute included — with the invite's vouch standing
  in for the name match, names a new profile after the entry, and they land
  on the welcome (Step 50, below), then on it (`/tree?person=<entry>`;
  `joinedTreeHref` reads `redeem_invite_tree`'s `self_placed`, from every
  accept path). If the entry
  has meanwhile been claimed, deleted, taken off the tree or marked as having
  died (Step 37), they join anyway and land on onboarding, where
  `search_self_candidates` lists a vouched entry first (never someone who has
  died) and `claim_person_as_self` takes it without the name match. A
  member who already has an entry of their own (Step 41.3,
  `20260923153000_claim_invite_merges_into_own_entry`) gets the invite's
  entry folded into theirs by `private.merge_invited_entry` when only its
  maker has built on it (`is_own_placeholder`, Step 36's test), nobody is
  behind it, and it's shown on the invite's tree alone. The two must also
  not be plainly different people: never either marked as having died, no
  line between them, and not born more than a year apart. Theirs then sits
  where it sat on that canvas, with its lines (less any that would double
  up), stories, album photos (since Step 88.5; its documents until then),
  companions and
  bloodline anchors, and it's deleted; their own details stay as they
  were. Otherwise it's left as it is and theirs is placed beside it, as
  for an ordinary invite. Every Root gets a `placed_on_join` notice saying
  which: "… has taken that entry's place on <tree>, with everything that
  was on it", about their entry, or "<tree> now shows both. If they're the
  same person, you can delete the entry …", about the invite's. Whoever
  made a merged entry, if not a Root, gets a `claim_approved` notice with
  no dispute (no claim is made). They land on their own entry either way,
  greeted on `/welcome?returning=1` first when the tree is new to them
  (Step 50).
  The vouch (`private.claim_vouches`) outlives the invite, and the canvas's
  `claim_person` still honours it while their own entry is a placeholder
  they added (Step 36). `private.can_invite_to_claim`
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
  below). So can the member a relative's ask went to (Step 41.1, see Asking
  a relative below): `sendClaimInvite`'s optional `treeId` sends it into
  the tree they picked instead of the entry's home, once it has checked they
  are on it and it shows the entry, which is where accepting claims it.
  Roots invite from
  `/admin`; everyone else gets an "Invite a relative" card on `/account`, and
  every invite form says the newcomer joins as a Leaf (`JoinsAsNote`). The add-relative form asks
  for the new relative's email too (Step 31) and, once the entry is saved,
  sends this same invite for it, unless they're deceased. `/join/<token>`
  tells them what a Leaf is before they sign up. Like a direct invite, it
  keeps a "Sent invites" record for the Roots of the tree it joins (the home
  tree, unless a relayed ask picked another), named after the
  entry (`claimInviteRecordName`, `lib/claim-invites.ts`), and the entry's
  card lists who sent it and when (Step 38, below).
- **The welcome** (Step 50, `20260925090000_redeem_says_what_it_claimed`):
  someone whose entry a relative made, and who has just made it theirs,
  lands on `/welcome` before the tree. That's accepting a claim invite with
  no entry of their own, and claiming an entry on onboarding (it used to
  toast "Welcome back" and open the tree). The page says "Welcome, {name}"
  and who added them to the tree (`tree_members.invited_by_user_id`, named
  as notifications name members: their entry's name, else their display
  name; `lib/welcome.server.ts`). Below that, their entry as it stands
  (photo or initials, name, "née …, born 12 March 1960 in Kampala,
  Uganda") with **Change**, then a photo and whatever else is empty
  (`blankFields`; a middle, preferred or maiden name is offered, never
  "missing").
  Change opens every name and birth field. **Save and see the tree** (one
  `updatePerson` for the details, `setPersonPhoto` for a photo) or **Skip
  for now** opens the tree on them. A member who brings their own entry to
  a claim invite's tree (Step 41.3) gets `/welcome?returning=1` instead:
  "Welcome to {tree}", who added them, their entry, and **See the tree**,
  with nothing to fill in; none at all on a tree they were on already.
  `redeem_invite_tree` says which, as things stood before it redeemed the
  invite: `claim_invite`, `had_entry`, `was_member`. Plain and founder
  invites land where they did.
- **Invite requests** (`public.invite_requests`): anyone can ask from `/`
  ("request access") or `/request-invite` with first name, last name, and
  email. Without a tree in hand, `findFamilyTree` looks for one first
  (Step 28, `public.trees_matching_name`, service role only): a strong
  name match (onboarding's 0.85) on a living, unclaimed entry nobody has
  hidden from visitors, returning the **trees**, never the person. Found,
  they ask that tree's Roots; not found, they can ask a relative who's on
  ancestree (below), or join the waitlist to start a tree, which first says
  that a new tree starts empty (Step 30.5). A share
  link's **Ask to join** names its tree by slug and skips the search: since
  Step 41.4 it opens the form in a dialog over the canvas
  (`RequestInviteDialog`), so the viewer keeps their place, and
  `/request-invite?tree=<slug>` still shows the same form as a page, for
  emails and older links; `requestInvite` no longer falls back to the first
  tree. The row is written
  by the `requestInvite` server action using the service-role client, so the
  table needs no `anon` grant or insert policy and cannot be read or enumerated
  from the browser. It refreshes pages only for a signed-in asker, whose
  `/join` then says where the request stands (Step 30.8): anyone else's page
  shows nothing of it, and redrawing a share link's page would re-measure
  every card behind the dialog (Step 41.4). Admins review pending requests on `/admin`; approving mints
  a normal single-use invite link (attributed to the reviewing admin) and
  emails it to the requester via Resend (`lib/email.ts` +
  `lib/emails/invite-approved.ts`, needs `RESEND_API_KEY`) — if the send
  fails, the invite is still valid and the admin can copy the link and send it
  themselves; declining just closes the request. Several emails at once go
  as one batch (`sendEmails`, Step 77.5): a batch Resend refuses over one
  address is sent again one by one, one it didn't answer isn't sent again,
  and people are told only that an address was refused, never Resend's own
  words. A new request emails every
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
- **Asking a relative (Step 30.5, `public.invite_relays`)**: with no match,
  the newcomer can type a relative's address ("Ask a relative who's on
  ancestree"); the form says their name and email will be passed on. The
  screen answers every ask the same way — "If they're on ancestree, we've
  passed your request on" — so it never tells anyone who's a member:
  `askRelative` only checks the typing (a valid address, not their own) and
  does the rest in `after()` (`passOnRelay`). If the address is a member's
  who lets relatives ask (`invite_relay_recipient`: a profile on at least
  one tree, with `profiles.relatives_can_ask` on; service role only), the
  ask is filed and that member emailed
  (`lib/emails/invite-relayed.ts`) a button to `/account?view=settings&relay=<id>`
  — only the ask's id is in the address. There, **Relatives Asking for an
  Invite** shows an invite filled in with the name and email as typed, and a
  tree to send it into (every tree they're on; the one they're looking at to
  begin with); one tap sends it through `sendDirectInvites`, as any invite
  they send, joining as a Leaf, or they dismiss it and the newcomer isn't
  told. A newcomer with no strong match is often on the tree under another
  spelling (a married surname, a nickname), so the card also lists the
  entries on the picked tree that their name matches (Step 41.1,
  `public.invite_relay_candidates`, loaded for each of the member's trees by
  `lib/relay-candidates.server.ts`): onboarding's scoring, living entries
  placed there that nobody is behind yet, best five — and only those the
  member may invite someone to claim (`private.can_invite_to_claim`, judged
  on the entry's home tree), so a Leaf sees only what they added, often
  nothing. Only the ask's member may ask, of a tree they're on, while it
  waits. "Invite as <name>" (`sendRelayedClaimInvite`) asks the list again,
  then sends a claim invite through `sendClaimInvite` into the picked tree,
  to the address in the form, keeping its "Sent invites" record: accepting
  claims the entry and opens the canvas on it (Step 30.2), with no
  onboarding. "None of these, invite without an entry" sends the plain
  invite, as does "Send invite" when nothing is listed. Either way the ask
  is answered once an invite is made. Opened from the email once it's no
  longer waiting — including just after sending or dismissing it from its
  card, whose refresh keeps the address — settings says what the member did
  with it: "You’ve invited <name> to <tree>.", that they dismissed it, or
  that it lapsed (Step 41.5) (`lib/opened-relay.ts`). Anyone the ask isn't
  theirs to read gets only "That request has already been answered, or it
  lapsed after 30 days." RLS shows an ask only to the member it
  went to, who may change only its answer. Every ask is noted first, whoever
  the address belongs to (Step 41.5, `public.invite_relay_asks`: the address
  asking and when, never the relative's; service role only), and the caps on
  the address asking (3 a day) and across the site (10 an hour, 30 a day) are
  counted from the notes before anyone is looked up, so an ask past one
  looks nobody up and its note is taken back. An ask for a member is then
  filed and counted against theirs (2 a day, 5 a week). Each count comes
  after the write, so two at once can't both slip under. An ask past a cap
  is dropped without a word, and one that's open or dismissed stops the same
  address asking the same member again. A member who unticks **Relatives
  can ask me to invite them** (settings, Privacy card; `setRelativesCanAsk`)
  is found by nobody, so the newcomer's answer is the same and nothing is
  filed or sent; asks already waiting stay. An ask left pending for 30 days
  lapses (Step 41.5): the card shows the date each ask waits until and
  drops it then, the actions refuse it (`RELAY_ANSWERED` covers answered and
  lapsed), and the email says so.
  With no schedule (pg_cron isn't enabled), each new ask first deletes
  lapsed asks, which lets the same address ask again, and notes older than
  a day. Logs never carry a name or address.
- **Direct invites**: from the same `/admin` card — and, since Step 20, from
  the "Invite a relative" card on `/account` for anyone who may invite, as
  whatever `invitableTypes` lets them give — the inviter can skip the
  request queue and send invites straight to people they already know — a
  `useFieldArray` row-per-person form (first name, last name, email;
  `components/direct-invite-form.tsx`) posting to `sendDirectInvites`
  (`app/actions/invites.ts`). Each row mints a single-use, 14-day invite
  bound to its address, emails it with `lib/emails/invite-sent.ts` (same visual
  shell as `invite-approved.ts`, via `lib/emails/shared.ts`, but worded for
  "you were invited" rather than "your request was approved"), and — purely so
  it shows up in the same history — inserts an already-`approved`,
  `source = 'direct'` row into `invite_requests`. Both writes use the
  service-role client after the action has checked the inviter's permission:
  a Branch may not bind an email through RLS, and never sees the token.
- **Invite history**: `/admin`'s "Sent invites" card (`listInviteHistory` in
  `lib/invites.ts`, `components/admin/admin-invite-history.tsx`) is every non-
  pending `invite_requests` row — request-driven or direct — joined to its
  `invites` row so it can show whether the link was ever used, is still
  active, expired, or was revoked, and whether the email actually sent
  (`email_sent`, best-effort — a `false` doesn't mean it bounced, just that
  Resend's API call didn't return success). Every path that emails an
  invite writes that row: direct and founder invites, approvals, and since
  Step 38 claim invites. Each row says who sent it (`reviewed_by`, or who
  answered a request) and when, and "Claims …" when accepting claims an
  entry; resending a claim invite keeps the claim wording
  (`claimInviteEmail`).
- **Claim invites on the card** (Step 38, `lib/claim-invites.ts` +
  `.server.ts`): an entry's card lists the invites out to claim it — "Aalim
  Rattansi sent an invite on 23 Sep 2026. The link works until 7 Oct 2026."
  — every live one, newest first, or else the latest that expired unused.
  Every member of the tree sees who sent one and when; the address shows
  only to a Root and to its sender. RLS shows an invite only to a Root, its
  sender and whoever accepted it, so `listClaimInvites` reads them with the
  service role for a member's canvas (never a share link's or a visitor's)
  and hands on only those fields. With a live invite out, the card's button
  reads "Send another".
- **Share links** (`public.share_links`): admins mint any number of view-only
  links `"/shared/<token>"` from `/admin` (server actions `createShareLink` /
  `revokeShareLink`, each optionally 30-day-expiring and independently
  revocable). The `/shared/[token]` route resolves the token with the
  service-role client (`lib/share-links.server.ts`) — RLS is admins-only, no
  `anon` grant — and renders `<FamilyTree readOnly>` (no drag-persist, no add /
  claim / report / comment / manage affordances). Its corner card's **Ask to
  join** opens the request form in a dialog over the canvas (Step 41.4); a
  visitor from another tree gets the same button, less the dialog's "Sign
  in". Each view is counted once the page has gone
  out: `after()` calls `record_share_link_view` (service role only), which
  adds one in SQL (Step 33). Only a browser's visit counts: a link preview
  (iMessage, WhatsApp, Slack…) or another bot gets the page but no view
  (33.7, `countsAsView`), and neither does a server action's reply, which
  draws the page again (41.4, `viewerUserAgent`: Next marks it `Next-Action`).
  The Root console shows the count and the date of
  the last view (33.6). `lib/share-links.ts` holds the pure
  usable/expired/revoked logic, `countsAsView` and `viewerUserAgent`
  (`.test.ts`).
- **Story links** (`public.story_links`, Step 88.4): any member who can
  read an approved story may press **Share** on it, which makes their own
  link `"/shared/story/<token>"` (or hands back the one they have) and
  sends it: a phone's or tablet's share sheet, else the clipboard
  (`components/send-link.ts`; when the press has gone stale by the time
  the link is made, a toast holds it with a **Share** / **Copy** button).
  The page (`app/shared/story/[token]`) reads the story with the service
  role (`shared_story`, `lib/story-links.server.ts`, shared by the page and
  its metadata) and shows its title, text and recording, who it's about
  and who shared it, never its comments; it isn't indexed, and a chat's
  preview gets the title and "A story about <name>, shared by <name>."
  Its **Sign in to see the comments** (**See the comments** when signed
  in) goes to `/stories/<id>` (`app/stories/[id]/route.ts`), which
  signs-out visitors pass through `/join` to reach, and which opens the
  person on a tree of the member's that shows them (the one they're on if
  it does, else their home tree) at `?person=…&story=…`; the sheet opens
  that story's comments, brings it into view and drops `story` from the
  address. **Stop sharing** (the person, whoever may edit the entry, or the
  story's teller) turns every link off at once and keeps them off: only
  those three may share it again. A link also stops while the person is
  hidden from visitors, and for good once its sharer's account goes.
  Views aren't counted.
- **Starting a tree is by request during the beta** (Step 28,
  `public.tree_requests`): a signed-in member presses "start a tree
  (beta)" (home page, `/trees`, `/trees/new`) and `request_tree` files one
  ask; a signed-out visitor joins the waitlist with a name, an email and
  the privacy tick request access has (`joinBetaWaitlist`, which refuses a
  sign-up without it; Step 30.6), from the home page's dialog or request
  access's no-match screen. **Beta reviewers** — `private.beta_reviewers`
  (email): the build owner and, since `20260923043000`, Raiya Suleman; add
  a row (by migration) to share the queue further, which also shares the
  admin page (Step 103; its **analytics** tab is Step 56's dashboard) —
  answer both from "Requests to Start a Tree" on the admin page's
  **manage** tab (Step 103; Root consoles had it before), counted on the
  header's **admin** — and emailed to every reviewer who runs a tree
  the moment a new one lands (Step 30.1, `lib/emails/tree-requested.ts`;
  the waitlist capped at 10 an hour and 30 a day, members not at all, since
  each has one ask and an account). Approving a member lets `found_tree` through
  for them (it raises `TREE_REQUEST_NEEDED` otherwise), puts
  `tree_request_approved` in their inbox (trigger) and emails them
  (`lib/emails/tree-request-approved.ts`, via the general `renderEmail`
  shell). Approving a sign-up mints a founder invite on the reviewer's
  console tree (`lib/founder-invites.server.ts#mintFounderInvites`, shared
  with `sendFounderInvites`), recorded in its Sent invites as `request` and
  emailed with `lib/emails/founder-approved.ts`; resending a founder invite
  now keeps founder wording. `my_tree_request()` says where an ask stands
  (`none` | `pending` | `approved` | `founded`) and drives every "start a
  tree" button. A Root's founder invite still needs no request.
- **Admin bootstrap**: `private.admin_allowlist(email)` — seeded with both
  co-admins (Aalim Rattansi, Raiya Suleman). First login by an
  allowlisted email runs `ensure_profile`, which creates the single shared
  `trees` row and an `admin` profile — a Leaf's instead once that first tree
  has its two Roots (Step 39). Non-allowlisted users
  without an invite get `needs_invite`, and go to the invite waiting for
  their address, or `/join`'s pending state (Step 30.8, above).
- **What a member may write on their profile** (Step 42): `display_name`
  and `relatives_can_ask` on their own row (column grants; `profiles_update`
  keeps it to their own), and no inserts: `redeem_invite` and
  `ensure_profile` make profiles. `self_person_id` and `invited_by_user_id`
  are set only by the SECURITY DEFINER RPCs (onboarding, claims, invites,
  `resolve_claim`, `delete_tree`) and cleared by `on delete set null`.
  `profiles_guard` refuses a change to either, or an insert, made as
  `authenticated` or `anon` even if a grant comes back; it tells writers
  apart by `current_user`, since the definer RPCs run as their owner. The
  LOCAL `ancestree.privileged_profile_write` GUC those RPCs set is read by
  other guards (`tree_members_guard`, `tree_placements_guard`,
  `people_before_write`), not this one. (The old
  `profiles_protect_role` went with `profiles.role` in Step 25.6.)
- **`public.member_directory`** view (`security_invoker`) = profiles + resolved
  `invited_by_name` and, for a Branch, `branch_granted_by_name` (Step 39);
  drives `/admin` and `/account`.

**Supabase dashboard config (do once):** Authentication → URL Configuration →
Site URL `https://ancestree.space`; Redirect URLs allowlist
`http://localhost:3000/**`, `https://ancestree.space/**`,
`https://*-arattansi.vercel.app/**`. Email provider = built-in for now (free
tier ~3–4/hour) — swap to an SMTP provider before wider testing.

## Privacy & compliance (Step 10)

Family data (living people, DOB, photos, recordings) is treated as sensitive PII;
Canadian context → PIPEDA-minded.

- **Consent where someone joins**: a required checkbox linking to `/privacy`
  sits on each way into a tree — asking to join (`requestInvite`), joining
  the waitlist to start one (`joinBetaWaitlist`, both forms, Step 30.6),
  accepting an emailed invite (`acceptInvite`; already given by someone who
  asked — a request's invite, or a waitlist founder's, filed as `request`),
  and the sign-in form a bare invite link shows (`requestMagicLink` with an
  invite). Each action refuses a form without it, and the ask and waitlist
  forms send it from a hidden input that follows the box (`InviteConsent`,
  as `MagicLinkForm` does), so a second try after an error keeps it. A plain
  sign-in doesn't ask (Step 30.4, `lib/privacy-consent.ts`): it's a member
  coming back, so the form only links to the notice. Nor does a member's
  invite to another tree: signed in they press Join, and signed out the
  invite opens on a sign-in link back to it (Step 41.2). `/privacy` is in
  `proxy.ts`'s public prefixes so it is readable pre-auth.
- **All PII behind auth + RLS**: every table is RLS-scoped by tree membership;
  nothing is public or indexed. Photos and recordings live in private buckets and are
  only ever served through short-lived signed URLs (unchanged from Step 2).
- **Admin data export**: `/admin` → "Download JSON export"
  (`exportTreeData`, service-role read of every table scoped to the shared tree;
  `components/admin/admin-export.tsx` streams it as a client-side download).
- **Delete a person**: `PersonPanel` → "Delete entry" (admins only,
  `deletePerson`) removes the row (edges, stories and album tags cascade)
  plus its photo, its stories' recordings and the album photos nobody else
  is in from storage.
- **Replaced photos** (Step 82): a photo replaced or cleared leaves storage
  once nothing shows it (see **Storage** under Data model); every earlier
  photo used to stay in the bucket.
- **Delete your account**: `/account` → "Delete my account" (`deleteAccount`)
  removes the auth user + `profiles` row after reassigning the member's
  `created_by` / `owner_user_id` references to a founding admin,
  so the shared record stays intact. Blocked if the caller is the only admin.
- **A photo's own details** (Step 88.6): Add a photo reads a picked
  photo's names and date in the browser to suggest tags and fill in the
  date; only that date is stored (`album_photos.taken_on`, and only if it's
  kept on the form). GPS is never read. What goes up, to the album and as
  any portrait (Step 91), is always the copy the canvas drew, which carries
  no EXIF, XMP or IPTC: a photo the browser couldn't redraw is refused
  rather than uploaded as picked (`compressImage` returns `null`, never the
  file).
- **Free-tier headroom**: photos are downscaled client-side to ≤1280px JPEG
  (`lib/image.ts#compressImage`, wired in the add + edit forms), album
  photos to ≤1600px (the same, in `album-dialog.tsx`), well under the
  Supabase Free limits (50MB/file, 1GB storage, 500MB DB). No PII in logs:
  the few `console.*` calls, all server-side, log a tag with an error code
  or a count.
- **Days active** (Step 56): `private.active_days` holds a row for each UTC
  day a member used the site — the date, nothing else — noted by the proxy
  (`note_active_day()`) and deleted with their profile. Only
  `engagement_dashboard()` reads it, for the beta reviewers' dashboard,
  which shows each tree's name and counts, never a person. `/privacy` says
  both, under what we collect and how it's protected.

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
  (e.g. `search_name LIKE '%zurich%'` → index scan; it matches Lake Zurich,
  IL, since GeoNames spells Zürich `Zuerich`, as Step 66 found).
- **How the picker searches** (Step 66, `lib/place-search.ts`): only the part
  before the first comma goes into `search_name ILIKE '%…%'`; what follows
  names a region, and places there come first (country name, ISO code, other
  names such as UK or Tanganyika, a letter admin1 code, and the Canadian,
  US, UK and Indian region names in `lib/place-regions.ts`). It never hides
  a place. A search that finds nothing is tried again, in parallel, without
  words like "taluka" or "district" and without a region named at its end
  ("Vancouver BC", which then only takes places in BC). Typed text is folded
  like `search_name` (no accents; ä/ö/ü tried as ae/oe/ue first, as GeoNames
  mostly spells them). Each query is still one trigram-indexed ILIKE, top 200
  by population (60 until Step 66.4), ranked in JS. It looks inside names
  from three letters (`MIN_LETTERS`); two letters only match a whole name
  (`ILIKE 'bo'`), since `%bo%` can't use the index and scanned every place
  (Step 66.5).
- **Free-tier size:** `places` measures **58 MB** total (table + the two
  `pg_trgm` GIN indexes + the `country_code` btree); whole DB **70 MB**, well
  under the Supabase Free 500 MB limit. **`allCountries` (~13M rows, ~55×) is
  multiple GB and must not be imported on the free tier.**
- `pg_trgm` lives in the `extensions` schema (not `public`), per the Supabase
  linter — migration `20260831040000_places_trgm_extension_schema`.
- **What cities500 leaves out:** any place GeoNames counts fewer than 500
  people in, or has no count for — most villages in India (7,109 Indian
  places are in). Shishang, in
  Kalavad taluka of Jamnagar, Gujarat, wasn't: GeoNames has it as Sisāng
  (1256004), with no population. A Root adds such a place from the picker —
  **Add “…”** in the list when a search finds nothing (Step 64), or **Can’t
  find it? Add a place** under the field. `requestNewPlace` inserts it with
  the service role: `feature_code` `PPLX`, no coordinates (so no ancestral
  lands), whatever was typed as the state, ids from 10,000,000,000 up. The
  first was Shishang, India (Aalim, 2026-09-28). Every column that holds a
  place id is `bigint`, so a hand-added place can be a companion's
  birthplace too (`pets.place_id_birth` was `integer` until Step 65).
- **Countries** (Step 79, migration `20260928190000_country_places`): a
  place can be a whole country, for someone known only to have been born
  (or to have died) there. Each of the 249 ISO codes in `ALPHA2` has a row:
  id 9,000,000,000 plus its two letters' character codes
  (`countryPlaceId`; TZ is 9,000,008,490), feature class `A`, code `PCL`
  (`isCountryPlace`), the English name, and no coordinates, population or
  `ascii_name`, so no `search_name`: the name search never finds one. The
  picker offers countries itself (`countriesNamed` in
  `lib/place-search.ts`), ranked in with the places, with a globe instead
  of a pin: one of its names starts with what was typed, or a later word
  of it does ("Korea"). Its names are its English name (with ä, ö and ü
  also spelled out, "St." also read as "saint", a leading "the" dropped)
  and its other names in `lib/place-regions.ts` (UK, USA, Tanganyika,
  Ceylon, Burma, Rhodesia, Holland…), except one for only part of it
  (Zanzibar finds the town). A country named whole or from its start comes
  before places that match as closely ("Singapore": the country, then the
  city); one found by a later word, after them ("Man": Manila, Manchester,
  then the Isle of Man). Picking one keeps no town: `city_of_birth` empty,
  `country_of_birth` (or `place_of_death`) the country's name
  (`placeText` in `lib/place-choice.ts`). Its period names come from
  `historical_names` by country, as a town's do.

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
- **NLD's names, or nothing** (Step 40). Where NLD maps the place, the
  form shows its names as they are, with nothing to fill in, and the card
  shows them too. Where NLD maps nothing, or can't be asked (a hand-added
  place has no coordinates), neither says anything about ancestral lands:
  no box, no caption, and nothing while NLD is being asked. From Step 27.8
  until Step 40 the form offered a box there for the family's own words
  (`people.ancestral_lands_birth` / `_death`, `pets.ancestral_lands_birth`);
  none were ever saved, and Step 40.5 dropped the columns. Read-only trees
  follow the same rule (Step 27.9): a visitor from another tree asks as
  themselves, and a share link asks through its own route (below).
- **Credit.** Every card that shows NLD's names says "From Native Land
  Digital"; opening it gives NLD's link, the stewardship acknowledgement,
  and NLD's own disclaimer that the map isn't a legal or official record of
  boundaries.
- **What gets asked.** A person's place of birth and death, and a
  companion's place of birth (Step 27.7). Only GeoNames populated places
  with coordinates (`feature_class = 'P'`) are asked about; a hand-added
  place has none, so it shows nothing, and neither does a whole country
  (Step 79). A share link's
  viewer isn't signed in, so its cards ask
  `GET /shared/<token>/ancestral-lands?place=<id>` (Step 27.9), which
  answers only while the link works and only about a place its cards show
  (a birth or death place on its tree, or a companion's birthplace), so a
  link can't be used to ask NLD about anywhere else.
- **Coverage.** Strong in North America: Toronto gives Anishinabewaki,
  Ho-de-no-sau-nee-ga (Haudenosaunee), Mississauga, Mississaugas of the Credit
  First Nation and Wendake-Nionwentsïo. Checked 2026-09-22: nothing for
  Kampala, Nairobi, Dar es Salaam, Mumbai or London, where the card shows
  nothing.
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

- **Step 105: the privacy page on children and other trees** (no
  migration). **Aalim asked for:** the privacy page to set out what's been
  done to protect children's data and the say a member has over being
  added to other trees. `app/privacy/page.tsx` gains two sections.
  **Children under 18** (Step 98): only a parent adds their own child, the
  18-or-older question on adding and on drawing a line, only a parent or
  the child sets a date of birth under 18, placeholders with no details
  that only the parent fills in and nobody else edits, claims, suggests,
  tells a story about or tags, held-back details seen only by parent and
  child that the parent shows or forgets (live `entry_revisions` hold no
  older copy of them, checked 2026-10-01), the child's claim staying a
  placeholder until the parent approves, and the parent's delete until
  the child claims it. **Your entry on other trees** (Steps 25, 80, 83):
  one entry, your home tree's rules, a basic card (name, place of birth,
  lines) until your yes, asked by notice and email under Asked of You,
  a no not asked again, either answer changeable, 30-day lapse, an invite
  or a claim counting as a yes, non-members answered for on their home
  tree, read-only viewing by another tree and **Hide my entry from
  visitors**, and that only a tree's Roots take a card off it.

- **Step 103: the admin page** (no migration). **Aalim asked for:** the
  admin dashboard out of the account page into a page of its own, with a
  red **admin** button before **tree** in the header, tabs **newsletter |
  analytics | manage**, and requests to start a tree out of every Root
  console. **103.1, the page:** `/admin` (`app/admin/page.tsx`, until now a
  redirect to the Root console, which it still is for anyone who isn't a
  beta reviewer) has the three tabs as `?tab=` links
  (`components/admin/admin-page-tabs.tsx`, drawn like the account page's
  views; `lib/admin-page.ts`, `.test.ts`). **newsletter** is the weekly
  newsletter's card, **analytics** the engagement dashboard (Step 56), and
  **manage** "Requests to Start a Tree", moved from the Root console
  (`lib/admin-sections`, `lib/admin-notifications`, `lib/admin-queue` and
  the console's Requests & Reports group no longer know it). A founder
  invite for someone on the waitlist comes from the tree being looked at
  if they run it, else the first tree they run; with none,
  `approveTreeRequest` says so. The header's red **admin**
  (`AdminNavLink`, `SiteNavLink`'s `red`: tinted, solid on the page) shows
  only for a reviewer (`HeaderCounts.treeRequests`, `null` for anyone
  else), with how many ask to start a tree while any do, and opens
  **manage** then; the header's yellow count beside **account** counts
  only the Root consoles' queues now. The reviewers' alert email opens
  `/admin?tab=manage`, and one sent before (`/account/admin?section=tree-requests`)
  lands there too. The account page's **dashboard** view is gone:
  `/account?view=dashboard` goes to `/admin`. No line under any title on
  the page: the dashboard's four card descriptions and its "Engagement"
  heading went. Campaigns (103.3) and account and tree actions (103.4) come
  later on **manage**. **103.2, the Root console:** "Invite Someone to
  Start a Tree of Their Own" (`#found`) and "Bare Invite Links"
  (`#bare-invites`) are gone, with `AdminBareInvites`, `listBareInvites`,
  `sendFounderInvites` and `DirectInviteForm`'s `founder` (a founder
  invite now comes only from a reviewer's yes; links already out still
  work until they lapse). Every line under a title went, on the console
  (the tree name's, Overview's, each group's and section's — `AdminGroup`
  and `AdminSubsection` no longer take a `description`) and on the
  account page's cards; the empty "Your Details" keeps its one line, and
  a child's placeholder keeps "Hidden from the family until your parent
  approves.". The console's **Settings** group moved to the account
  page's **settings**: a card per tree they run, named for it, with the
  rename form, **Who Else Can View** and **Data & Privacy** (export,
  delete this tree), and one **Nicknames** card, shared by every tree
  (`loadAccountSettings` reads the visibility rows and nickname groups
  only for a Root). **View** was in settings already. Renaming stays on
  the page and says "Tree renamed." (it went to the console's
  `#tree-name` before). `lib/admin-sections` lost its `settings` group and
  the `bareInvites` context; `adminNav()` and `groupSectionIds(group)`
  take nothing else.

- **Step 102 follow-up: only buttons are lower-case** (no migration).
  **Aalim said:** "only buttons should be lower case". The sweep had also
  lower-cased controls drawn as links (an underlined `<button>`, or
  `variant="link"`), which read as text, not buttons. **Now** those are
  sentence case again, as they were: **Edit**, **Delete** and **Try
  again** under comments, **Read more**, **+ Middle name**, **Remove**,
  **Change**, **Use another email** / **Send a new code** on sign-in,
  **Date taken**, **Make primary**, the account page's **Root console**
  link and the rest (32 places), plus the place search's **Add “…”**
  option, the dashboard's **Show the numbers** disclosure and the theme
  radios **Light** / **Dark** / **System**. A dialog such a link opens
  keeps its lower-case buttons. Everything drawn as a button, filled,
  outlined, tinted or ghost (the bordered **anyone** / **living** /
  **deceased** too), stays lower-case. `docs/design-system.md` says
  "only buttons: what's drawn as one", and `lib/button-case.test.ts`
  passes over link-drawn controls (`variant="link"` or an underlined
  class).

- **Step 104: less work on each frame of a camera move** (no migration).
  **Aalim asked for:** "fix those three too and push", the per-frame costs
  Step 101 left. **The minimap** is our own now
  (`components/tree/canvas-minimap.tsx`, in place of React Flow's
  `<MiniMap>`): on every frame React Flow measured every card again and,
  with the canvas reaching past them, moved its viewBox, so the browser laid
  out each card's rect again (1,795 re-layouts over a switch). The cards
  are now one path in an svg of their own, drawn only when they move, in a
  viewBox that grows to take in the window in steps of a quarter of the
  cards' longer side; each frame changes only the shade round the window,
  in a second svg. Drag to pan and wheel to zoom go through React Flow's own
  `XYMinimap` (`@xyflow/system` now a direct dependency at the version
  `@xyflow/react` pins). Looks as before in both themes; the shade still
  hides cards outside the window, as `--muted` did. **The lane titles**
  (`generation-lane.tsx`) are placed straight onto the element from a store
  subscription, only when the answer changes, and by `transform` alone (no
  `left`/`top`), so a frame no longer renders every lane in React or costs a
  layout; pinning and magnifying unchanged. **The member mark** is the
  mark's 132px PNG (the emails' logo, `brand:build` says so now), not the
  SVG with blur filters. **Numbers** (76-person /family fixture with 15
  members, real Chrome, CPU slowed 4×, per switch): layout 26 → 9–11ms,
  paint 64 → ~52ms, raster 34 → 27ms. Seen and left: Chrome rebuilds the
  SVG favicon on each `?person=` change; nothing measurable.
- **Step 102: every button is lower-case** (no migration). **Aalim asked
  for:** "all buttons are lower case characters. that should be
  established in the design system", on the weekly newsletter's **Open My
  Family Tree** button; asked how far, they chose every button,
  everywhere. Until now only navigation was lower-case (Step 30.4) and a
  button that did something was sentence case. **Now** every button's
  words are lower-case across ~115 files: labels, what a busy button says
  (**saving…**), a dialog's **cancel** and confirm (`ConfirmDialog`'s
  default too), toasts' **undo** / **copy** / **share**, text buttons
  (**edit**, **try again**, **+ middle name**), the sheet header's
  **edit** / **fill in** / **suggest**, the theme and living filters
  (the filter lost its CSS `capitalize`), the tree switcher's **my family
  tree** / **your trees**, and every email's call to action (**open my
  family tree**, **review the request**, **join ancestree**). Names keep
  their capitals: a person's or a tree's as data (**invite as Amarshi
  Sayani**), and other products' (**WhatsApp**, **JSON**, **Markdown**).
  Not buttons, so unchanged: collapsible section titles (**Getting
  Started**), cards, menu items, select values, badges, field labels, and
  icon-only buttons' names (`TagButton`'s prop is now `title`, as that's
  all it sets). **Rule** in `docs/design-system.md` ("Buttons:
  lower-case"), with the doc's own button names brought in line.
  **Guard:** `lib/button-case.test.ts` parses `app/`, `components/` and
  `lib/` with the TypeScript compiler and fails on a capital in any
  button's words, label props (`confirmLabel`, `pendingLabel`, …, and
  their defaults), toast actions or email CTAs; it's how
  **Email me a code** (a default prop) was found after the sweep.
  Checked in the browser: the home page, its two dialogs, /join, and the
  newsletter email rendered from `newsletterEmail`.

- **Step 101: a click no longer restyles the whole page** (no migration).
  **Aalim asked for:** "fix the blur commit lag too", the cost Step 100
  left of a click on the canvas. **Why it cost so much:** not the blur. A
  trace with Chrome's invalidation tracking showed each click restyling
  ~2,510 elements, the whole document, "affected by :has()" at the root:
  `:root:has([data-docked-sheet][data-open])` (the toasts' offset) and the
  header rules beside it (`body:has(…) .site-header-bar`, the
  `header-compact` variant). `data-open` is on every open Base UI popup,
  tooltip and collapsible, so the browser checked that `:has()` again each
  time one appeared or toggled anywhere, and restyled from the root down.
  **Now** `useDockedSheet(open)` (`components/use-docked-sheet.ts`, in
  PersonPanel and PetPanel) puts `data-docked-sheet-open` on the root
  while a sheet is open (a layout effect, counted), and globals.css reads
  `:root[data-docked-sheet-open]`; the header moves aside exactly as before
  (checked at 1440, 900 and 390px through open, switch, minimize, close:
  same padding, columns, `--docked-sheet-width`, sheet top). It helps every
  page with a sheet, and any popup opening on them. **Numbers** (76-person
  /family fixture, real Chrome, CPU slowed 4×): the restyle after a click
  29–47ms over ~2,510 elements → 4–9ms over ~82; style per switch 65 →
  39ms; longest frame 83 → 50ms; click to first paint 184 → 120ms; a long
  task in 1 click of 8 (was every click). Seen and left: the member mark is
  an `<img>` of an SVG with a blur filter, laid out again at each zoom step
  under every member's leaf; the minimap's cards and the lane labels are
  restyled on each camera frame.

- **Step 100: switching people on the canvas without the lag** (no
  migration). **Aalim asked for:** "the my family tree view UX is very
  choppy. like switching from one node to another is so buffered", then
  "do the tree canvas too". **Why it lagged:** three motions out of step.
  The cards fade (300ms) and slide into their pulled-out places (560ms,
  ease-out), but the camera waited 120ms, then eased in and out over 650ms
  along React Flow's default "smooth" path, which zooms out and back in on
  any long move; it arrived ~850ms after the click, last. Every click also
  re-measured every lit card (`updateNodeInternals`, a forced layout), though
  on My Family Tree nobody's shape ever changes. **Now** (`family-tree.tsx`,
  both canvases): the camera sets off on the click, straight there
  (`interpolate: "linear"`), on the cards' own 560ms ease-out quint
  (`CAMERA`), opening a line, switching people and closing alike; only the
  cards that change shape (card, leaf, pill) are re-measured. The 120ms wait
  was there because a re-measure cancelled a camera move in flight; with
  only the reshaped cards re-measured it doesn't: on a 76-person fixture the
  camera ends on the same transform, to the pixel, with and without the
  wait, at full and 4× slowed CPU, first click (cards turn into leaves),
  person to person, Escape, and a `?person=` link. **Numbers** (real Chrome,
  M1 Pro GPU): camera in place ~850ms (swooping) → ~270ms (straight), done
  by ~570ms; with the CPU slowed 4× on My Family Tree, script per switch
  529 → 317ms, click to first paint 264 → 184ms, longest frame 150 → 83ms.
  Left alone: the ~50–100ms (4×) commit of all cards blurring or not.
- **Step 99.9: a comment on a story can be edited** (migration
  `20261001280000_story_comments_editable`). **Aalim asked for:** "let the
  comments on a story be edited too". Each of the viewer's own comments has
  **Edit** beside **Delete**: the text becomes a box with **Save** and
  **Cancel** (focus goes into it, and back to **Edit** after, by
  `useFocusReturn`), and an edited comment says **edited** after its time
  (`story_comments.edited_at`, the latest edit). `edit_story_comment` (its
  author alone, while they can still read the story's comments; the same
  checks as writing it; unchanged words change nothing), `editStoryComment`,
  `list_story_comments` made again with `edited_at`. My unasked calls: its
  author alone (a story's teller or an entry editor may still delete
  anyone's, as before, but not reword it); no approval and no notice, as
  comments never had either. Rehearsed rolled back (author edits, same
  words, empty and too long refused, another member, the story's teller
  and an unknown comment refused), then in the browser as a throwaway Root
  (only their own comment offers Edit; saved, marked edited; Cancel gives
  focus back to Edit).

- **Step 99.8: a story's recording can be replaced or removed** (migration
  `20261001270000_story_recording_editable`). **Aalim asked for:** "let the
  recording be edited too". **Edit story** now has the **Recording**: the
  one it has plays there, to **Replace** (pick a file, shrunk and played
  back before it goes, as when telling) or **Remove** (with **Undo**), or
  **Add a recording** if it has none (`components/tree/story-recording-field.tsx`,
  now shared with **Add a story**; `EntryStory.hasRecording`). The new file
  goes up first into the person's folder, then `edit_story` (made again
  with `p_edit_audio`, `p_audio_path`, `p_audio_seconds`, all defaulted, the
  nine-argument version dropped in the same go so the deployed app's calls
  still resolve) checks it as `add_story` does; a refusal discards it. The
  recording it no longer has comes back as `removed_audio` and `editStory`
  removes it with the service role in `after()`. Same rules as the words:
  its teller alone, a story keeps words or a recording, and a new recording
  from someone who couldn't approve it waits again. Rehearsed rolled back
  (add, replace, remove, someone else's upload or none refused, both gone
  refused, a Root refused on another's, an approver's own stays approved,
  the old nine-argument call), then in the browser as a throwaway Root with
  generated WAV tones (added 0:03 → replaced 0:02, the old file gone from
  storage → removed, the file gone, Undo in between).

- **Step 98.3, follow-up: the child's invite email and "18 or older?" first**
  (no migration). **Aalim asked for:** "fix the email greeting and ask 18
  first", two findings from tracing the journey map (J12, J14). **The
  email:** a claim invite to a placeholder greeted the child as "Second
  Child" and said there was an entry for Second Child. Now it says
  "You're invited", "{Inviter} has kept a place for you on your family's
  tree on ancestree. The link below signs you straight in and makes it
  yours. Your details are hidden from the family until your parent
  approves." (`claimInviteEmail` `placeholder`, sent by `mintClaimInvite`
  when the entry is one; `renderInviteEmail` greets nobody by name when
  given none). **The form:** the person being added is asked "Is this
  person 18 or older?" before their names, not below the connection, once
  the connection makes them someone's child or sibling; a No hides the
  names, the invite box and Add more details, and shows the refusal with
  **Add a placeholder instead** right there, so nothing is typed for
  nothing. Someone added in between is still asked lower down, beside the
  chain. J12 goes from 4 taps and 3 fields to 4 and 1 (the parent's email).
  **Checked:** tsc, lint, 1,769 tests (+2 for the email); headless on a
  phone-sized browser as a throwaway Root (question above the names; No:
  names gone, refusal + placeholder button, Add relative off, the
  placeholder made; Yes: names back and the question names them; an
  in-between person asked below); the email rendered from the template;
  throwaways deleted.

- **Step 99.7: a story's text can be edited too** (migrations
  `20261001250000_story_text_editable`, before the deploy, and
  `20261001260000_drop_set_story_details`, after it). **Aalim asked for:**
  "let the story text be edited too". The card's button reads **Edit** for
  its teller and opens **Edit story**: the title and the text (Markdown,
  Write / Preview, Upload a Markdown file; `components/tree/story-text-fields.tsx`,
  now shared with **Add a story**), then the date and the credits, opened
  as they are; one save (`edit_story`, replacing 99.6's
  `set_story_details`; `editStory`; `components/tree/story-edit-dialog.tsx`,
  renamed from `story-details-dialog.tsx`). Anyone else who may (an editor
  of the entry, the person it's about) still sees **Credits and date**.
  **Only its teller changes its words.** My unasked calls: new words from
  someone who couldn't approve them wait again, since the approver said
  yes to the words: an approved story goes back to **Waiting for
  approval** (hidden from the family, its links paused, comments kept), a
  declined one is asked again (as Step 71's edit and resend), and the
  approver gets "… edited a story about …, waiting for your approval"
  (`private.ask_story_approval`); "Sent for approval." in the toast. Someone
  who may approve it (a Root telling their own) keeps it approved; credits
  and the date never need a new yes; unchanged words change nothing. The
  recording stays as it was. Rehearsed rolled back with throwaway users,
  then in the browser as a throwaway Leaf (approved → edited → waiting,
  the Root notified).

- **Step 98.2, follow-up: the parent fills it in from anywhere** (migration
  `20261001220000_parent_fills_in_from_anywhere`, applied before the deploy:
  the new code asks `is_own_child`). **Aalim asked for:** "let the parent
  fill it in from anywhere" — 98.2's last known gap. A placeholder sits on
  the tree it was added to, under its parent's entry, but the parent may not
  be a member there: their entry was brought over from their own tree and
  their yes hasn't come, they declined, or they were removed from it. They
  were told, but couldn't open it, since every read asks for a tree you
  belong to. Now a parent's own placeholder child, and the child it becomes
  once they've filled it in (it's theirs), is readable to them wherever it
  is, photo included (`private.can_see_own_child`, added to the
  `people_select` and `storage_photos_select` policies; `can_see_person`
  untouched, so bringing people over from another tree still needs a tree
  you belong to). The edit page opens it off the tree being looked at: the
  fill-in form, with no connections and no **Back to tree**; once filled,
  that page says **{Name} is filled in.** Their notice's **Fill in** goes
  straight there, and **View on tree** isn't offered, when they aren't on
  its tree. And on any tree, the fill-in page now shows a placeholder's
  held-back details (98.3) above the form, so the parent chooses what to
  show before typing over it — a fill drops what's still held back (the 98.3
  session's finding). `entryAccess` asks `public.is_own_child` rather than
  reading the parent line, which an off-tree parent can't see. **Checked:**
  tsc, lint, 1,767 tests; a rolled-back rehearsal on live as a parent who
  is a Root of their own tree only: before, nothing readable; after, their
  placeholder and its photo, not the sibling's placeholder, nothing for an
  outsider, the fill saves through RLS and leaves it theirs and readable,
  and `can_see_person` (bringing people over) still false. Applied from
  the file with md5 and policy asserts (statement md5 `99e491a9…`); headless
  e2e on live as a throwaway parent who belongs only to their own tree:
  the notice shows **Fill in** and no **View on tree**, the page is **Fill
  in First Child** with no connections or **Back to tree**, the save makes
  the child theirs, and the page then says **Kidlet Zzz is filled in.**;
  everything deleted after.

- **Step 99.6: the date told can be changed too** (migrations
  `20261001230000_story_details_editable`, before the deploy, and
  `20261001240000_drop_set_story_credits`, after it). **Aalim asked for:**
  "let the date told be edited too". The card's button is now **Credits
  and date** and opens **Credits and date**: the two pickers and **Date
  told**, opened as they are (`toPartialIso`); an emptied date clears it.
  One save for all three (`set_story_details`, which replaces 99.5's
  `set_story_credits`; `setStoryDetails`;
  `components/tree/story-details-dialog.tsx`, renamed from
  `story-credits-dialog.tsx`). Same people may (`can_edit_story_credits`
  covers the date too), the date checked as `add_story` checks it (kept on
  the first day of what's known, never after tomorrow). No new approval.
  Rehearsed rolled back (set, truncated to the month, cleared; future and
  unknown precision refused with credits untouched; another Leaf refused;
  the old function drops cleanly), then in the browser as a throwaway
  member (2019 → July 1985 → none).

- **Step 99.5: a story's credits can be edited after it's told**
  (migration `20261001210000_story_credits_editable`). **Aalim asked for:**
  "let credits be edited after a story is told". An **Edit credits**
  button on the story's card opens **Credits**: the Storyteller and
  Interviewer pickers, opened with whoever it credits now; **Save**
  replaces both at once (`set_story_credits(story, tree, storytellers,
  interviewers)`, `setStoryCredits`, `components/tree/story-credits-dialog.tsx`,
  loaded on the first press). Who may (`private.can_edit_story_credits`,
  shown by `entry_stories.can_edit_credits`): its teller, whoever can edit
  the entry, or the person it's about. Someone newly credited must be on
  the tree it's edited from, in full, as `add_story` asks; someone credited
  already may stay wherever they are (offered by name in the picker even
  where this canvas doesn't have them). Ten a role, a placeholder child by
  their parent alone (98.3's guard). My unasked calls: no new approval and
  no notice (who told it and who asked doesn't change what it says); the
  date told stays as it was told. Rehearsed rolled back with throwaway
  users (teller and Root may, another Leaf may not, newcomers off the tree
  refused, ten a role), then checked in the browser as a throwaway member.

- **Step 98.3, follow-up: a child's own entry merges with their
  placeholder** (migration `20261001200000_child_entry_merges_with_placeholder`,
  applied before the push with Aalim's OK; the old code works with it).
  **Aalim asked for:** "merge the child's own entry when they accept too…
  it should merge whenever the child claims the placeholder. it just
  remains labelled as placeholder to the public until the parent approves
  it being visible" — 98.3's first known gap. A child who already has an
  entry of their own and accepts an invite to claim their placeholder no
  longer ends up beside it: `merge_invited_entry` folds the placeholder
  into their entry (lines, card position, stories, credits, album, as for
  any stand-in), and their entry takes its number: one record, **First
  Child** on every tree it's on, their own included, with everything it
  said (and anything the placeholder held back, theirs winning) in
  `private.withheld_details` (`private.entry_details`) until their parent
  shows it. They see their details and the note; their parent sees the
  list and is told ("First Child's details are hidden from the family.
  Only you can choose what to show."); a reveal leaves it theirs.
  `people_before_write` lets that merge set the number and clear a Root's
  lineage mark, under the privileged flag. Also: a parent can no longer
  delete a placeholder once the child has claimed it
  (`can_delete_person`, re-created from Step 99's `20261001190000`;
  `lib/branch.ts` mirrors it). **My calls, not asked:** a Root's lineage
  mark on the child's entry is dropped, not held back; what the parent
  doesn't tick is dropped from the child's own entry too, as for any
  reveal (they can add it back, the entry being theirs once shown); the
  Roots' "accepted your invite" notice names the child as "First Child".
  **Checked:** tsc, lint, 1,767 tests; a rolled-back before/after rehearsal on
  live (before: two records, the Root sees the child's name; after: one,
  placeholder #1 on both trees, details held back, parent line moved,
  parent told and can't delete it, reveal of name + photo restores just
  those, the child edits it after); applied from the file with the row and
  4 body md5 asserts; headless e2e with a throwaway Root, Leaf parent and a
  child with their own tree: the child joins, sees "First Child · Your
  entry" with their details and "Also on" their tree; the parent's list
  shows them, no Delete; Show name → the Root sees "Kay Zz" and nothing
  else; all deleted after.

- **Step 98.2, follow-up: a Branch invites the parent too** (migration
  `20261001180000_branch_invites_placeholder_parents`). **Aalim asked
  for:** "let a Branch invite the parent too" — 98.2's second known gap. A
  Branch who added a placeholder under someone off their side was refused
  the invite for that parent to claim their own entry, since a Branch may
  only invite to an entry they can edit. Now a Root or a Branch of the tree
  may invite a placeholder's parent while a placeholder waits under them on
  that tree — living, not a placeholder, nobody behind the entry
  (`private.can_invite_to_claim_on`, re-created from 98.3's body with that
  one branch). The canvas offers the invite on the parent's card to a
  Branch the same way (`EntrySubject.waitingPlaceholderParent`,
  `canInviteToClaimHere`). **Checked:** tsc, lint, 1,745 tests (2 new in
  `lib/branch.test.ts`); a rolled-back rehearsal on live with two Roots,
  the parent on the second Root's side: the Branch refused before, allowed
  after; a Leaf, a member's entry, a claimed entry and someone with no
  placeholder still refused; Root and 98.3's placeholder rule unchanged.
  Applied from the file with an md5 assert (statement md5 `beab827f…`);
  headless e2e on live as a throwaway Branch: the parent's card offered no
  invite, then No → **Add a placeholder instead** → **Invite Camila Yyy to
  fill it in?** → invite sent, and the card now offers the invite and lists
  it; everything deleted after.

- **Step 99: stories in Markdown, with credit and a date** (migration
  `20261001160000_story_credits_and_told_on`). **Aalim asked for:** "for the
  stories feature, add the ability to write using markdown or upload a
  markdown file. also, there's no tagging feature to attribute credit about
  a story. people can be tagged in a story as an 'interviewer' or
  'storyteller'. user can also put an optional 'date for story told'".
  **Markdown:** a story's text is Markdown, kept as written (no column; the
  plain-text stories before it read the same, a single line break still a
  line break). **Add a story** has **Write** / **Preview** over the text and
  **Upload a Markdown file** (`.md`, `.markdown`, `.txt`, up to 1 MB): its
  text goes in after anything already written, a front-matter `title:` or
  a first `# Heading` becomes the title if that's empty (`lib/story-markdown.ts`),
  and a file past 20,000 characters is refused. Drawn by
  `components/story-markdown.tsx` (`react-markdown` + `remark-gfm`: headings,
  lists, quotes, code, tables, links; raw HTML never becomes markup, a
  link's address is checked and opens in a new tab with no referrer, a
  picture shows only its description so nobody else's server is called).
  It loads when a story first shows (`story-text.tsx`, lazy, plain text
  meanwhile) so the canvas's first load is unchanged; the public story page
  renders it on the server. A long story folds by height now (Markdown is
  blocks, not one run of lines), with "Read more" only when something is
  actually hidden (measured once drawn). **Credit:** `story_credits`, **Storyteller**
  and **Interviewer**, each a picker over the people on the canvas behind a
  "+ Storyteller" / "+ Interviewer" link (up to ten each; the same person
  may be both), shown under the title as "Storyteller [Nan] · Interviewer
  [Raiya]". **Aalim (review): each credited person is a tag that opens a small card
  saying what they are to the person the story is about**, e.g. on a story
  about Amarshi Sayani: "Aalim Rattansi, Great-grandson of Amarshi Sayani",
  "Sadrudin Sayani, Son of Amarshi Sayani". **No connection, or not on the
  tree, and there's no card**: a plain tag, as the story's own person is.
  The word is the credited person's (`relationOf` + `relationText` in
  `lib/connection-path.ts`, over the canvas's `connectionPath`): son,
  great-grandmother, sister, half-brother, uncle, grand-niece, first cousin
  once removed; wife, former husband; son-in-law, mother-in-law,
  sister-in-law, stepfather, stepdaughter; "Aunt by marriage" past those;
  "Co-parent"; a chain no word fits reads "Connected to … through 3
  people". `StoryCreditTag` (`components/story-credit-tag.tsx`, a Base UI
  popover, `components/ui/popover.tsx`). On the sheet it's worked out from
  everything the canvas has (`describeConnection` from `FamilyTree` through
  `PersonPanel`); on the public page, on the server, from the tree the story
  was told on (`tree_people` + `tree_edges` read with the service role,
  `creditConnections` in `lib/story-links.server.ts`), so only the words
  reach the page, never who is in between. **Aalim: naming the
  credited people on the public page is fine.** **Date told:** optional, as much as is
  known ("1962" will do), never after tomorrow, "Told 16 July 1985" on the
  card (`stories.told_on`, `told_on_precision`, as a photo's date taken).
  The card now says **Added by** (and "you") before the account that added it, since
  "told by" now means the storyteller. The export carries `story_credits`.
  My unasked calls: credits and the date are set when the story is told and
  not edited after (as the album's tags); no notice or approval for someone
  credited; credited people must be on the tree the story is told on
  (add them first if not). A Markdown file is read with the title and story
  boxes held, so typing meanwhile isn't written over; front matter must open
  with a `key:` line, so a story that starts with a `---` rule keeps its
  text.
  **Follow-up migration `20261001190000_story_credits_keep_entries`:** a
  credit in someone else's story keeps an entry, as their story about it or
  their photo of it does (`private.can_delete_person`, re-created from
  98.2's `20261001140000`): a Branch or Leaf deleting an entry they made is
  refused when another member's story credits it; a Root, or a placeholder
  child's parent, still may. Rehearsed rolled back with throwaway users
  (refused after, allowed before; a Root allowed), along with the credit
  move in `merge_invited_entry` (the stand-in's credits land on the
  member's own entry, a doubled one dropped). A placeholder child (98.3's
  guard covers `story_credits`) is credited by their parent alone; anyone
  else is told "Only their parent can add to a placeholder."

- **Step 98.3 — Existing minors become placeholders** (migration
  `20261001170000_existing_minors_become_placeholders`, applied before the
  deploy with Aalim's OK: the live 98.2 code already shows placeholders,
  and only the new code calls the new functions). **Aalim asked for:** the
  living children under 18 added by someone other than their parent "turn
  into placeholders and prompt their parent to give permission on what to
  reveal, if anything"; then: "a root can send an invite for the child to
  claim the node for the child to get access, but the node remains in
  placeholder state until the parent approves for it to be shown to the
  rest of the tree"; the child sees their own held-back details with a
  note that they aren't public until their parent approves; a Root, a
  Branch or the parent may send that invite, "but parent has final say on
  what is revealed". **The data:** the two such entries on live (one tree,
  one non-member parent, nothing else hung on them) are now **First Child**
  (the elder) and **Second Child**; what they'd been given (names, date of
  birth, place of birth, sex) sits in `private.withheld_details` (the old
  columns as jsonb), not deleted. Raiya's two "added to the tree" notices
  and the two "Sent invites" records now name the placeholder; the
  children's own claim invites stay active; holding them back sent no edit
  notice. A third minor on that tree was added by their own parent and is
  untouched. **The parent** sees **Hidden from the family** on the
  placeholder's sheet: each held-back detail with its value, their name
  ticked and fixed (an entry needs one), **Show to the family** ("Show name
  and date of birth to the family?") copies the ticked ones back and makes
  it an ordinary entry, theirs, or the child's if they claimed it
  (`reveal_withheld_details`; the rest is dropped), and **Forget them**
  ("Forget First Child's hidden details?" / "This cannot be undone.")
  drops them, leaving a placeholder to fill in (`forget_withheld_details`).
  A parent joining is told "First Child's details are hidden from the
  family. Only you can choose what to show." (`tell_placeholder_parent`);
  a member parent is told "First Child joined. Only you can choose what the
  family sees." when the child claims it (`claims_placeholder_claimed`).
  **The child:** a Root, a Branch or the parent may now invite them to
  claim any placeholder (`can_invite_to_claim_on`, `lib/branch.ts#canInviteToClaim`;
  the guard lets a claim through only with that invite's vouch); accepting
  makes it theirs, but it stays "First Child" to everyone else. Their sheet,
  `/welcome` and `/account` say "Your details are hidden from the family
  until your parent approves." and list their own held-back details
  (`withheld_details` answers only the parent and the child). They can't
  edit it until it's shown. `merge_invited_entry` never folds a placeholder
  into someone's entry; `seed_self_email` doesn't put the child's address
  on it; `placeholder_entry_guard` also covers Step 99's `story_credits`.
  **My calls, not asked:** numbered eldest first; the reveal is by group
  (name, date of birth, place of birth, sex, and email/photo where there
  are any); the name always goes with anything shown; a fill-in by the
  parent drops what was held back; after a reveal the entry stays the
  child's if they claimed it (so the parent no longer edits it); a child
  who accepts with no name typed is named "First Child" on their account,
  not their own name; their address isn't seeded onto the placeholder.
  **Known gaps:** a child who already has their own entry and accepts the
  invite isn't merged, so a Root sees both side by side (as for any
  unmergeable claim invite; merged since the follow-up above); the emails already sent on 2026-09-28 named
  the children. **Checked:** tsc, lint, 1,743 tests; a rolled-back
  rehearsal on live, 55 checks before and after (Aalim's and Raiya's
  views, a Leaf, a stand-in parent, the real child invite redeemed by a
  stand-in account, reveal/forget/fill refusals and results, guards,
  merge, 98.2's add still working); applied from the file with the
  `schema_migrations` row, 10 body md5 asserts and a two-entries assert in
  one transaction (statement md5 `96db096d…`); regenerated types match the
  hand edit. Headless e2e on live as throwaway Root, Leaf parent and child
  on a throwaway tree: the Root sees First Child, the parent-only note and
  the invite box; the child accepts the invite, lands on the welcome note,
  sees their own details on the sheet and on `/account`; the parent
  forgets one placeholder's details and shows the other's name and date of
  birth, which the Root then sees, place and sex gone; everything deleted
  after (users, sessions, tree, notices: 0).

- **Step 98.2, follow-up: the parent is told when they join** (migration
  `20261001150000_tell_placeholder_parents_on_join`; no app change).
  **Aalim asked for:** "tell the parent about the placeholder when they
  join" — 98.2's first known gap. A parent who wasn't a member when their
  placeholder child was made now gets the same `placeholder_child` notice
  ("{Root} added a placeholder for your child (First Child). Only you can
  fill it in.", with **Fill in**) as soon as their entry becomes theirs:
  the claim invite, "This is me", an approved claim, or a merge that moves
  the parent line onto their own entry. `private.tell_placeholder_parent`
  sends one notice per member and waiting placeholder, from whoever made
  it, never to a parent who has died; after-triggers on `profiles`
  (`self_person_id` set), `claims` (approved) and `relationships` (a parent
  line to a placeholder drawn or moved) call it, and `add_placeholder_child`
  now leaves its member notice to the trigger, so nobody is told twice.
  Existing minors 98.3 turns into placeholders get the same when their
  parent joins. **Checked:** a rolled-back rehearsal on live, 24 checks
  (member told once per placeholder at creation; non-members told nothing
  until their entry is set as theirs, then once per placeholder, not again
  on a re-set; an approved claim; a merge's line move; a deceased co-parent
  untold; a filled-in placeholder and an ordinary child line tell nobody).

- **Step 98.2 — Placeholder children** (migration
  `20261001140000_placeholder_children`, applied before the deploy: the new
  code reads its column, and the old code ignores it). **Aalim asked for:**
  "a root and a branch can put placeholder nodes for parents (First Child,
  Second Child, etc.) with no details and then invite their parent to fill
  it in if they wish"; a parent who isn't a member yet gets a claim invite
  to their own entry, a member a notice. Where adding someone under 18 is
  refused (98.1), a Root or a Branch now sees **Add a placeholder instead**
  (`components/placeholder-child.tsx`), which puts an entry with no details
  at all under the child's parents (the ones the form drew, or a sibling's;
  `lib/placeholders.ts#placeholderParents`), shown as **First Child**,
  **Second Child**… with a **Placeholder** line on its card
  (`people.placeholder_number`, numbered after that parent's other
  placeholders, never renumbered; `lib/placeholders.ts#placeholderLabel`
  mirrors `private.placeholder_label`). `add_placeholder_child(tree,
  parents)` takes one or two parents on the tree, one of them living, from a
  Root or a Branch; the bloodline gate applies; its parent lines skip
  98.1's line question (`note_new_people`). A member parent is told
  (`placeholder_child`: "{Root} added a placeholder for your child (First
  Child). Only you can fill it in.", with **Fill in**); for one who isn't,
  whoever added it is asked **Invite {parent} to fill it in?** and the
  invite is to claim their own entry. Only the parent fills it in (sheet:
  **Fill in**, "Only you can fill this in."; everyone else: "Only their
  parent can fill this in."): their edit (**Fill in First Child**) clears
  the number and makes the entry theirs (`people_before_write`). Until
  then a Root's rights don't reach it (`can_edit_person` is the parent's
  alone, `can_fill_person` never), and nobody suggests a change to it,
  claims it or is invited to, tells a story or tags a photo of it
  (`private.placeholder_entry_guard`); its sheet shows no fields, album,
  stories or Add a relative; it's out of name search, "Same person?",
  suggested connections and the newsletter. The parent, a Root, or the
  Branch who made it may delete it. `people_placeholder_empty` keeps it
  empty; `people_required_identity` asks it for no name; `person_label`
  says "First Child"; filling one in is no Branch edit for a Root to undo.
  **My calls, not asked:** placeholders count per parent and only among
  placeholders still waiting, so after First Child is filled in the next is
  Third Child if Second still waits, else First again; a deceased parent
  alone can't have one (nobody to fill it in); the Report flag stays; a
  sibling refused takes the sibling's parents. **Known gaps:** a parent who
  joins by the claim invite isn't told about the placeholder (closed in the
  follow-up above); a Branch may not be allowed to invite the
  parent (the usual claim-invite rule), then the dialog says so and a Root
  sends it (closed in a later follow-up); a parent who is a member but not of the placeholder's tree can't
  open it (closed in a later follow-up). **Checked:** tsc, lint, build, 1,737 tests (new
  `lib/placeholders.test.ts`, placeholder cases in `lib/branch.test.ts`);
  a rolled-back rehearsal on live, 33 checks (adds by Root/Branch, Leaf /
  deceased-only / married-in / outsider / twice refused, numbering, notices,
  rights as Root/parent/Leaf/Branch-creator, RLS update 0 rows, fill /
  suggest / claim / invite / story refused, number never set, the parent's
  edit clears it and takes ownership with no revision, a later line asks
  nothing); applied from the file in one transaction with the
  `schema_migrations` row and 10 body md5 asserts (statement md5 =
  file, `01dcadad…`), regenerated types byte-identical; headless e2e on
  live as a throwaway Root and member parent: No → **Add a placeholder
  instead** → First Child card and sheet, member notice; non-member parent
  → invite dialog → invite sent; the parent's **Fill in** from the notice →
  filled, theirs; everything deleted after.

- **Step 98.1, the gap closed: lines ask too** (migration
  `20261001130000_ask_when_the_line_is_drawn`). **Aalim asked for:** "close
  the gap too — ask when the line is drawn". 98.1 asked only about people
  being added, so someone added unasked (as a partner, say) with no date
  of birth could be drawn as a child or sibling later and nobody asked. Now
  a trigger on `relationships` (`private.relationships_minor_guard`)
  judges the first line that makes a living person someone's child or
  sibling, whichever way it's drawn: born under 18 is refused (`MINOR`);
  nothing to say they're an adult and no yes on record refuses with
  `ASK_ADULT` (detail `existing:<id>`), which "Add a relative", the edit
  page's **Add a connection** and a suggested connection's **Yes, add the
  parent** turn into **Is {name} 18 or older?** — a yes draws it again
  with every yes so far (`p_adult_existing` on
  `add_people_with_connections`, `p_adults` on `connect_people` and
  `resolve_implied_connection`; old signatures dropped), a no says
  **{Name} is under 18. Only their parent can add them.** A yes is kept
  (`private.adult_confirmations`), and so are 98.1's yeses, so nobody is
  asked about twice. Not asked: their parent drawing it, their own entry,
  the deceased, anyone with a parent or sibling line already. People a call
  is adding are left to 98.1's check once all their lines are in
  (`private.note_new_people`, also for 98.2's placeholders); 98.1's guard in
  `connect_people` moved into the trigger. **My calls, not asked:** the
  question is put after the press, as the line is drawn, rather than
  foreseen in the form (the page doesn't know who already has a parent
  line); a yes on someone's record stays for good. **Checked:** tsc, lint,
  1,728 tests; a rolled-back rehearsal on live as a Root, 28 checks before
  and after (98.1's 17 unchanged, the 2015 partner now refused by the
  trigger; an undated partner then a sibling line asks, a yes draws it, a
  yes for someone else still asks, deceased / 1990 / one's own child
  unasked, a new parent of an undated partner asks and takes a yes, a yes
  kept after its line is removed, an accepted implied parent asks and takes
  a yes).

- **Step 97.3 — Quiet off the spotlight; member mark on My Family Tree**
  (no migration). **Aalim asked for:** "turn off hover-over effects for
  elements not in the spotlight view. it's distracting. instead show it as
  a soft pill element on the bottom right in line with the pill that shows
  the description of what is being highlighted" and, on My Family Tree,
  "don't include iconography for the account type … add a symbol to show
  that that node has been claimed and that person has an ancestree
  account. maybe use a tiny version of the logo where the system
  description is 'ancestree member'". On every canvas, a card, leaf, pill
  or companion blurred off a spotlight's line no longer grows, opens its
  hover card, lights its border or shows a tooltip; whoever the pointer is
  over is named in a soft pill at the bottom right (**Ali Lalji · 1922 –
  1980 · Tanzania**), beside the minimap or the open sheet
  (`components/tree/off-spotlight-pill.tsx`; a small hover store, so a
  pointer crossing the cards draws only the pill). Lit leaves keep their
  hover card. On `/family` the account-type mark gives way to the
  ancestree mark in small (`MemberMark`, titled **Ancestree member**) for
  the reader, members' own entries, settled claims and anyone a tree
  names Root, Branch or Leaf; the key lists it last. **My calls, not
  asked:** the pill says name · years · birthplace (a companion's kind ·
  years); it sits level with the middle pill centre to centre, and just
  above that row where the two would touch (a long "…'s tree" beside an
  open sheet at 1440px); only with a hovering pointer, from `sm` up;
  married-in pills stay name only, no member mark; a tree's own canvas
  keeps its account types. **Checked:** tsc, lint, 1,727 tests; headless
  on a throwaway fixture page (16 people, two trees, three members), light
  and dark: three member marks and no account marks on the view; at rest
  a hover still opens a leaf's card; with Nadia open, hovering blurred
  Sara or Rahim showed no card and the pill, centred on **First
  cousins**; a lit leaf kept its card and no pill; off the cards, none;
  clicking Sara lit her and the pill went. On the tree canvas, Karim's
  spotlight: blurred Ali showed the pill above the row. The fixture was
  deleted after.

- **Step 98.1 — Only a parent adds a child under 18** (migration
  `20261001120000_children_under_18`). **Aalim asked for:** "if a user is
  adding someone else's child, the user will get prompted 'is this person
  older than 18 years old?' … if they are not, then they will be refused …
  only a parent of a child can add their child to the tree." Aalim's
  answers: ask for anyone who could be a child (a child, a sibling, a
  grandchild through anyone in between) unless the member is recorded as
  their parent; never for someone who has died. "Add a relative" and the
  founder's quick add ask **Is {name} 18 or older?** (Yes / No,
  `components/adult-question.tsx`) under the connection, for each person
  `lib/minors.ts#newPeopleToAsk` picks out once the form's lines are drawn;
  a dated adult isn't asked. A No, or a date of birth under 18 whatever the
  answer, says **{Name} is under 18. Only their parent can add them.** and
  holds the button. The database asks the same: each person's answer goes
  to `add_people_with_connections` as `adult`, and it refuses (`MINOR`)
  anyone who could be a child without a yes, or born under 18, unless the
  caller's own entry is their parent (new `private.birth_age`,
  `private.is_own_child`). Behind it, `people_before_write` refuses a
  living person's date of birth under 18 from anyone but their parent or
  themselves (edits, fills, accepted suggestions and undos say **Only their
  parent can give a date of birth under 18.**), `connect_people` refuses
  the first child or sibling line to a living child under 18 that isn't
  their parent's, and the unused `people_insert` policy is gone, so nobody
  can add an unconnected entry to line it up after. Placeholder children
  for Roots and Branches (98.2) and the two minors already on a tree
  (98.3) follow. **My calls, not asked:** "18 or older" rather than "older
  than 18" (18 is the age the rule means); a year of birth that straddles
  the day is asked rather than refused; the question sits under "How they
  connect", since the link decides whether it's asked. **Checked:** tsc,
  lint, 1,727 tests (15 new in `lib/minors.test.ts`); a rolled-back
  rehearsal on live as a Root, 17 checks before and after: own child
  allowed unasked, a parent's child or a sibling refused without a yes,
  allowed with one, refused born 2015 even with one, a straddling year
  refused unanswered, the deceased and a 1990 birth allowed unasked, a
  grandchild through their own child refused unanswered and allowed with a
  yes, a parent's date of birth edited to 2015 refused, their own child's
  allowed, a 2015-born partner then a sibling line refused (1990-born
  allowed), a direct insert refused by RLS; on a throwaway signed-out
  fixture page: the question under a child link, a No's refusal, gone for
  a partner, the deceased and one's own child, asked of the grandchild only
  through one's own child. The fixture was deleted after.

- **Step 97.2 — Click again for their own tree** (no migration). **Aalim
  asked for:** "if the user clicks on the same person again, it highlights
  their individual tree". On `/family` the person open, clicked again,
  swaps their connection to you (97.1) for their own tree, as a click
  shows on a tree's canvas (Step 19.3: their line above and below, the
  partners along it, their siblings; **Nadia Patel's tree** · 4 ancestors ·
  0 descendants); a third click goes back to the connection
  (`ownTreeOf` in `FamilyTree`). Opening anyone else, or the same person
  again after closing them, starts on the connection. **My calls, not
  asked:** the third click toggles back rather than staying; your own leaf
  now shows your own tree on the first click (97.1 lit nothing), there
  being no connection to show; the tip reads **Tap anyone to see how
  you're connected, and again for their own tree.** **Checked:** tsc,
  lint, 1,712 tests; on the throwaway fixture page (16 people), scripted
  clicks: cousin → "You ↔ Nadia Patel · First cousins" (you, Karim, both
  grandparents, Zahra, Nadia), again → "Nadia Patel's tree" (her parents,
  grandparents and brother Omar), again → the connection; Laila → "Siblings"
  then her tree; your leaf → your tree, twice; ✕ then Nadia → the
  connection. The fixture was deleted after.

- **Step 97.1 — On My Family Tree a click shows how they're connected to
  you** (no migration). **Aalim asked for:** "instead, when you click on
  someone, it highlights their direct connection to you and blurs out
  everyone else. essentially a 'show a connection' function but for that
  person". Replaces Step 97's click (their own line pulled out). On
  `/family`, opening anyone but yourself lights the chain from you to them
  (`connectionPath(self, them)`, with any co-parent along it), pulled out
  around your leaf and framed beside their sheet, everyone else a blurred
  leaf; the pill under it reads **You ↔ Nadia Patel** · **First cousins**
  (`connectionLabel`), and its ✕ closes them. A connection picked in
  Search & filters still wins. Your own leaf opens your details and lights
  nothing; nobody's own line is pulled out on the view any more. Minimized
  details fold to their card as before, the connection staying lit. The
  canvas tip there says **Tap anyone to see how you're connected.**, closed
  apart from a tree's (`ancestree:family-tip-dismissed`). Trees' own
  canvases unchanged. **My calls, not asked:** "You" for the reader's end
  of the pill; clicking yourself lights nothing; the tip's words.
  **Checked:** tsc, lint, 1,712 tests; the same throwaway fixture page
  (15 people, two trees): a cousin lit you, Karim, both grandparents,
  Zahra and Nadia ("First cousins"), the sheet open; ✕ closed her and put
  every leaf back; your own leaf lit nothing; married-in Tom read
  "Siblings by marriage"; minimized, the folded card showed with the
  chain still lit. The fixture was deleted after.

- **Step 97 — My Family Tree rests as a spotlight: everyone a leaf**
  (ad-hoc; no migration). **Aalim asked for:** "the default view, 'My
  Family Tree' should be in the spotlight view state where everyone is
  shown as the leaves". On `/family`, with nobody open, every direct
  relative is now a leaf (their birthplace's tree, Step 96) on brown
  branches, every line lit; whoever married in stays a pill (Step 94).
  The view is laid out as a pulled-out line is (`buildPeopleGraph`'s new
  `centreFamilies` → `layoutTree`'s), so each family hangs straight under
  its parents' trunk and every descent line stops above its leaf's blade.
  Clicking someone still pulls their own line forward as on any tree;
  the rest stay leaves, blurred back (`FamilyTree`'s `allLeaves`; the
  edge routing tells a leaf from a pulled-out one). Leaves now fade for a
  search and blur off a spotlight's line as cards do (a lit leaf is never
  faded, as before); on My Family Tree they say **Your spouse** where
  "You" goes (Step 94.1) and wear the yellow **?** (Step 92.4) under the
  leaf, right of the account mark. Trees' own canvases are unchanged.
  **My calls, not asked:** spotlighting someone keeps the others as
  blurred leaves rather than turning them back into cards; the "?" spot.
  **Checked:** tsc, lint, 1,712 tests; a throwaway signed-out fixture
  page of a read-only `FamilyTree` in `family` mode (15 people, two
  trees, a same-person pair, two married-in pills, a spouse): 13 leaves +
  2 pills at rest, none faded, all 14 lines brown; a spotlight on a
  sister pulled her line forward with the rest blurred leaves, and
  closing it came back to all leaves; a search lit the three Patels and
  faded the rest. The fixture was deleted after.

- **Step 96 — Every tree's own leaf in a spotlight** (ad-hoc; no
  migration). **Aalim asked for:** "the banyan tree leaf doesn't look
  anything like the actual leaf. make sure that there are shapes being
  updated for the various trees". The 61 places in `lib/native-leaf.ts`
  shared 7 silhouettes (the banyan was the plain `ovate` leaf, Uganda's
  mvule an `elliptic` lens, Mozambique's mopane a circle, Arabia's date
  palm and Switzerland's spruce lenses too). Now `lib/leaf-shapes.ts`
  draws 47, one for each tree's leaf (or two trees whose leaves look
  alike: mvule and iroko are one species, as are oriental plane and
  chinar; fig, oak, birch, olive, lime, palm, acacia shared): the
  **banyan** broad and blunt-tipped, a faint notch at the stalk, a strong
  basal pair of veins and side veins looping forward; the strangler and
  sycamore figs; iroko's drip tip; clove, ironwood, olive, yellowwood,
  eucalyptus (a sickle), rhododendron, argan, jackfruit/tambalacoque,
  teak, pohutukawa/ivi, shea (wavy, notched tip), traveller's tree (a torn
  paddle); toothed apple, zelkova, chestnut (saw teeth, straight veins),
  beech (wavy), birch (a doubly-toothed triangle), lime and mulberry
  (hearts, the mulberry lobed on one side), holm oak (a few spines);
  English/sessile and red oak, the flag's sugar maple (unchanged, now
  with five palmate veins), oriental plane and Japanese maple (five and
  seven toothed lobes); compound leaves — baobab (unchanged), ceiba
  (seven leaflets), ceibo (three), mopane (two wings), neem, walnut,
  mahogany, narra, msasa, frankincense, acacia and rain tree (twice
  compound); a date palm frond; spruce, Scots pine, cedar tufts and
  juniper sprays. Shapes are generated from small parts (a mirrored
  edge, teeth, leaflets off a rachis, needles raked forward) over a solid
  body along the midrib, so the name always has room; `leafGeometry`
  measures each one where it's drawn, so `BLADE_BOTTOM`/`TEXT_LEFT` are
  gone: the descent line stops above the blade at the leaf's middle and
  the marks hang under its middle (the maple's line lands 3px lower than
  before, still clear of it). `leaf-card.tsx` draws whatever it's given.
  **My calls, not asked:** one shape per tree, even where a place's
  species is a compound or needle leaf (drawn as such, not mapped to a
  simple blade as Step 19 did); colour and the dashed outline for someone
  who has died are unchanged (on the cedar's tufts the dashes read as
  dots); the baobab and maple are left as Step 19 drew them. **Checked:**
  lint, tsc, 1,666 tests (new `lib/leaf-shapes.test.ts`: every blade holds
  its three lines with clearance, stays within its box sideways and the
  maple's height, meets its stem, stays under 6.5 KB, and differs from
  every other; the banyan is broad and blunt), `next build`; a throwaway
  fixture page of the real `LeafCard` for all 47 (light and dark, with
  marks, maiden names, "You" and deceased) and a real read-only spotlight
  of a 14-person fixture family from 14 countries, headless; a
  box-based ink check on every card (the new ones ≥ 1.5px; baobab and
  maple as before). The fixture was deleted after.

- **Step 95 — the weekly newsletter** (migrations
  `20261001090000_weekly_newsletter` and `20261001100000_newsletter_schedule`,
  applied before the code; additive).
  **Aalim asked for:** a weekly "newsletter" with updates on each member's
  family trees — what was added and on which tree — and what's coming up
  (birthdays, milestones); then, mid-build: personal, so Karim Kanji hears
  nothing of the Suleman side of the Rattansi-Suleman tree. **Aalim's
  answers:** sent by **Vercel Cron, weekly** (`vercel.json`, Sundays 15:00
  UTC — the first scheduler taken, after pg_cron in 41.5 and a daily job in
  83 were passed on); **on for everyone**, with an unsubscribe link that
  works signed out and a box in settings; additions are **new people on
  each tree** and **new stories and album photos** (named by whose they
  are, never their words or the picture); milestones are **round numbers,
  up to four weeks ahead**. Each member's issue is cut to their own family
  by My Family Tree's rule (`familyTies`, Step 94): blood relatives on both
  parents' sides, their spouse, and whoever married into the family, never
  the families of those who married in. What's coming up comes first
  (Aalim, after seeing a test): **This Week** (the next seven days, today
  included, as Upcoming lists them) and **Later This Month**
  (round birthdays — 1, 18, 21, every ten from 30, every year from 100 —
  and anniversaries — 1st, 25th, 75th, every ten — up to 28 days out,
  marked **Milestone**, as are round ones this week). Then each tree's
  news, in the order they joined it: "Safia Gulamani joined." (a member
  bringing their own entry), "Sara Khan added Amina Khan, Yusuf Khan and 3
  more." (a member named by their own entry, else their display name,
  which often still reads like an address), "You added …", "A new story
  about …", "New photos of …". Then, before it went
  out, **Aalim asked to see them and to control the schedule**, and chose
  controls in the app over editing `vercel.json`: the beta reviewers'
  dashboard opens on a **Weekly Newsletter** card — the day (a select,
  saved as it changes), **Pause** / **Resume** for everyone, **Email me a
  test** (their own issue, subject "Test: …", not counted as their week),
  the next send in their own time ("Sundays at 15:00 UTC. Next: Sun 4 Oct,
  8:00 AM your time."), and **Yours, as it stands**: their own issue as the
  next send would make it, in a sandboxed frame. The cron job now calls
  daily at 15:00 UTC (Hobby allows one run a day, so the hour stays in
  `vercel.json`) and answers `held: "paused"` / `"not today"` otherwise.
  He kept Sunday 8am Pacific. Every name links to
  its card on My Family Tree; the button opens it. A quiet week sends
  nothing. `/api/cron/newsletter` answers 401 without `CRON_SECRET` and
  counts only with it; `newsletter_due` (service role) says who's due, every
  tree they're on is read once with the service role through `tree_people` /
  `tree_edges` (a basic card stays a name), and `claim_newsletter_issues`
  marks each member done for the week just before the batch goes, so a
  second call sends nothing twice and a run that fails first leaves them
  due. `newsletter_settings` is its own table, not a `profiles` column,
  since relatives can read each other's profiles: nobody else learns who
  turned it off or sees a token. The email carries `List-Unsubscribe` +
  `List-Unsubscribe-Post` (RFC 8058: `POST /api/newsletter/<token>`), and
  its small print links `/newsletter/<token>`, where a button (never the
  visit) turns it off or back on. Settings' Notifications card has **Email
  me a weekly newsletter**. Upcoming's couple naming moved to
  `lib/person-name.ts#coupleDisplayName`; `renderEmail` takes
  `contentHtml` and an optional paragraph; `sendEmails` carries headers.
  The privacy notice says what the address is used for now. **My calls,
  not asked:** 15:00 UTC (8am Pacific in summer, 4pm UK; Hobby's crons
  fire within the hour); the reader's own birthday and anniversary and their
  own entry's arrival are left out; a member with no entry of their own
  gets none (nothing to cut it to); the week told is since their last
  issue, at most eight days back; one that couldn't be sent isn't retried
  that week. `buildWeeklyNewsletters` makes the emails without sending or
  marking anyone, which is how the real previews below were made.
  **Checked:** lint, tsc, 1,511 tests, `next build`; the first migration
  rehearsed rolled back (a member reads only their own switch,
  never the token; others and signed-out callers refused; one claim a
  week), then applied, each recorded migration's md5 = its file's. On a
  throwaway Rattansi-Suleman tree with three `delivered+zz95-…` members,
  the real route sent three, a second call none; read back from Resend,
  Karim's had the new baby, a story about his grandmother, the week's
  Rattansi-side birthdays and her 80th, and nothing of Zara, Omar or Ali
  Suleman; Raiya's had Zara and Omar and her father's 70th, and none of her
  husband's family; phone and desktop renders. The dashboard card as
  Aalim (his own session, local build against live): Pause and Resume, the
  day to Monday and back (status and next send followed; the row read
  `0`/not paused after), Email me a test delivered to him with his week
  left unmarked (from a local build its logo and links pointed at
  `localhost`, so it showed no logo; a second test built with the
  production address loaded it, as every production email does), the scheduled call on a Thursday held "not today";
  `newsletter_schedule` rehearsed rolled back (one row only, a reviewer
  reads and sets it, a bad day, a direct write, a non-reviewer and a
  signed-out caller refused). Then this Sunday's issues of
  three real members, built from live data and not sent (Aalim's, Karim
  Kanji's, Arzu Suleman's): Arzu's had none of the Rattansi-side additions,
  theirs none of the Suleman side. Unsubscribe page, one-click
  POST, a made-up token (same answer), and the settings box as a signed-in
  throwaway, all against live.

- **Step 94.1 — your spouse a full card on My Family Tree** (no
  migration). **Aalim asked for:** their wife as a full card, not a pill.
  `familyTies` has a third tie, `spouse`: the viewer's own spouse, a
  marriage not marked ended, who isn't blood. They're a card beside the
  viewer (and a leaf in a spotlight), with **Your spouse** under the name
  where the viewer's says **You**, and **Your spouse** first among the
  sheet's badges; still none of their family comes in. `loadMyFamily`
  returns `spouseIds`; `marriedInto` no longer names them. **My calls, not
  asked:** a viewer's ex, and someone they had a child with but never
  married, stay pills (**Your former spouse**, **Co-parent with you**);
  every spouse not marked ended is a card; the key is unchanged, the card
  itself saying who she is. **Checked:** lint, tsc, 1,465 tests, `next
  build`; the Step 94 throwaway tree again, headless: the wife a card
  saying **Your spouse** beside the viewer and a leaf in his spotlight,
  her badge **Your spouse**; the brother's, uncle's and aunt's partners
  still pills; her parents and brother still out. Rows and the account
  deleted after.

- **Step 94 — My Family Tree: blood relatives, and who married in as
  pills** (no migration). **Aalim asked for:** the view had become a copy
  of a tree they're a Root of; it's meant to be their *individual* family
  tree — only blood relatives, their wife and none of her family, and
  everyone who married in (their dad's brothers' wives, their brothers'
  wives) as the small pill a sibling's partner gets in a spotlight, with
  "direct relative" and "married in" told apart explicitly. Step 92's rule
  brought in a current partner's whole blood family, which on a tree
  holding both sides is the whole tree. Now `lib/my-family.ts#familyTies`
  is `blood` (the Step 55 walk from their own entry, both parents' sides)
  or `married_in` (anyone a blood relative married or had a child with,
  exes and co-parents included), and nobody else: no married-in person's
  family, their partner's included. `marriedInto` says whom each married
  into (a current marriage first, then an ended one, then a child
  together), and `loadMyFamily` hands that to `/family`. On the view a
  married-in person is a pill (`PillCard`, laid out at pill size through
  `buildPeopleGraph`'s new `compactIds`, on the far side of their partner)
  everywhere: on the overview, lit or blurred in a spotlight, and selected.
  It wears its tree's mark before the name and, when flagged, the **?** on
  its right shoulder; its tooltip says **Married in · Spouse of Idris**
  (**Former spouse of**, **Co-parent with**, **Your spouse**). The key
  under the tree names lists a small card, **Direct relative**, and a small
  pill, **Married in**; the sheet's badges start with one of the two (not
  on their own entry). A couple of a card and a pill (`descentGeometry`)
  now hang their children from the middle of the gap between them, not
  from the midpoint of their centres, which fell inside the card; for two
  cards of one width that's the same point, so every tree's lines are
  unchanged. **My calls, not asked:** their own spouse is a pill too
  (married in, as asked of everyone); exes and co-parents of a blood
  relative stay as pills (they're a parent of blood relatives); the
  married-in badge's tooltip names whom; a tree's own canvas is unchanged.
  **Checked:** lint, tsc, 1,464 tests, `next build`; a throwaway Root of one 22-person
  tree (both parents' sides, an uncle and his wife and her father, an
  aunt's husband, a brother, his wife and her mother, a wife, her parents
  and brother, two grandchildren), headless: `/family` shows the 13 blood
  relatives as cards and the wife, uncle's wife, brother's wife and aunt's
  husband as pills, and none of the 5 in-laws' relatives; sheets, the
  spotlight of the viewer and of the wife, and the tree's own canvas
  (everyone a card, the spotlight's sibling-spouse pills as before).
  Phone and desktop, light and dark. All rows and the account deleted
  after.

- **Step 92.5 — land on My Family Tree, every visit** (the last of Step
  92; no migration). **Aalim asked for:** My Family Tree every visit; a
  switch to a tree lasts until the browser closes. The `ancestree.tree`
  cookie is now a session cookie (no `maxAge`), so a switch — the
  switcher, a "View on tree" or **On** link, joining, founding, an
  invite, an alert email's console button, a story link — holds for the
  visit and a new one starts with none. Signing in lands on `/family`
  (`DEFAULT_NEXT`, so `/join`, `/auth/confirm`, `/auth/callback` and the
  code form all do, and a signed-out visit to `/tree` now carries
  `next=/tree` back), as do the header's mark for a member, the home
  page's **view your tree** and a member opening `/request-invite`
  (`homeHref`: My Family Tree with an entry of their own, else `/tree`).
  `/family` sends anyone it can't be drawn for (signed out, not a member,
  on no tree, no own entry) to wherever `/tree` would, which never sends
  anyone back, so nothing loops; with an entry, it no longer asks which
  tree is shown by default (one read fewer). Emailed links that name a
  tree still open it. **My calls, not asked:** the header's **tree** is
  the canvas being looked at, or from any other page the tree switched to
  this visit, and with none chosen, My Family Tree (`TreeNavLink`,
  `isTreeChosen`), lit wherever it opens; from My Family Tree every way to
  a tree is a switch, even to the tree shown by default (the switcher, and
  the view's **On**, "Which tree" and Edit links get only the tree chosen
  this visit as current), so going to one holds for the visit; the
  switcher's label away from `/family` still names the tree the tree pages
  act on, the home tree when none is chosen; "Back to tree" on the error
  and not-found pages, onboarding, the welcome and a joined tree's landing
  stay on the tree. **Checked:** lint, tsc, 1,459 tests, `next build`;
  three throwaway members, headless (each browser context its own cookie
  jar): one Root of tree A and Leaf of tree B with an entry on both, one
  Root of B only, one Leaf of A with no entry. Sign-in lands on `/family`
  with no tree cookie (5 and 3 cards); `/join`, `/request-invite` and
  **view your tree** go there too; the no-entry member lands on
  onboarding, and `/family` → `/tree` → `/onboarding` without a loop.
  Switching to B sets a session cookie (`expires: -1`, httpOnly); **tree**
  then opens B from `/account`, `/tree/review` and `/family`, the mark
  opens `/family`, and picking B again from there needs no server action;
  a new tab keeps B; a new browser context lands on `/family` with no
  cookie, `/tree` showing the home tree. Picking the default tree from the
  switcher, or its **On** link in a sheet, switches (one action, cookie
  set); once chosen, that **On** link is plain. An alert email's console
  link (signed out and in) and an emailed invite (accepted signed in) open
  their tree and remember it for the session. Phone and desktop, light and
  dark. All rows, sessions and accounts deleted after.

- **Step 92.4 — "Same person?" on My Family Tree** (the fourth of Step
  92; no migration). **Aalim asked for:** duplicates shown both, and
  likely pairs flagged "Same person?" (two mothers with matching names);
  merging them is a later step. `lib/same-person.ts#likelySamePeople`
  flags two different entries in the view when their **names agree** (a
  given name, first or preferred, and a family name, last or maiden, in
  common, and no two different maiden names), **nothing tells them
  apart** (no line between them, not two members' own entries, no two
  sexes, birth or death years no more than one apart — five for a "c."
  date — and the same birthday where both know it, no death before the
  other's birth, no two countries of birth) and they **stand in the same
  spot**: both parents of one child; or, unless one tree of the
  reader's shows them side by side, children of one parent, partners or
  siblings of one person, or born on the same known day. A pair already
  flagged counts as one person, so a side of the family entered on both
  trees is flagged from where it hangs on, and each pair says what it
  stands on. `loadMyFamily` works the pairs out per request from what it
  already read; nothing is stored and nobody else is told. On `/family`
  each such card wears a yellow **?** at its foot, across from the
  account mark (its name: "Same person as Fatima Rattansi?"; not on
  leaves or pills, like report counts), and its sheet asks above **On**:
  **Same person as ● Fatima Rattansi?**, the other card's name (with its
  tree's mark) opening that card, and **Not the same**, which puts the
  question away at once with **Undo** in its toast. **My calls, not
  asked:** the rule above, tuned so ordinary namesakes aren't asked
  about — a grandson named for his grandfather, cousins named for one
  grandfather, a brother named for one who died young, a second wife of
  the same name; two entries one tree already shows side by side are
  that tree's to tell apart, except two parents of one child; "Not the
  same" is remembered in this browser only (no stored answer, so nothing
  new about the view for Aalim to approve), and a pair that stood only on
  one put away goes with it (the grandfathers of two mothers said to be
  two people); no "Yes" (nothing to do until merging exists); the
  other's name opens their card rather than a side-by-side compare.
  **Checked:** the rule in tests (31: the namesakes above stay unasked);
  on live, read-only, every entry as one view, each tree alone, and with
  the side-by-side rule off: of 5 namesake pairs, none asked; one
  throwaway member, the Root of one throwaway tree and a Leaf of a
  second, each with its own copy of their mother and her father, in
  headless Chrome on a desktop and a phone, light and dark: both mothers
  and both grandfathers asked, the cousin named for his grandfather not;
  the sheets' names opening each other; Not the same hiding the mothers
  and, with them, the grandfathers, Undo bringing both back, the answer
  kept through a reload and absent in another browser; no flag, question
  or pairs in the payload on either tree's own canvas; no server action
  sent; the production build. Then removed.
- **Step 93 — On a tree's canvas, Edit follows the entry's home tree**
  (ad hoc, after Step 92.3; no migration). **Aalim asked:** fix `/tree`
  offering Edit by the member's account type on the tree being looked
  at. An entry's details follow its **home** tree's rules
  (`private.can_edit_person`, `can_fill_person`, `can_delete_person`), and
  the edit page already asked those (`entryAccess`), but each card's sheet
  asked the open tree's: a Branch saw **Edit** on an entry homed on
  another tree and the page then sent them to Fill in or Suggest, a Leaf
  saw **Fill in** on an entry their other tree lets them edit, and a Root
  saw **Delete entry** on someone homed elsewhere, which the database
  refuses. Cards could also be dragged that the database won't let them
  move. Now `/tree` reads, once its people are in and only for trees of
  theirs that are home to someone shown, who the member is there
  (`getHomeTreeAccess`: a Root's needs no walk, a Branch's or Leaf's is
  `getViewer` on that tree, kept to the people shown), and the canvas asks
  each card's home tree: **Edit** and **Fill in** by `entryRights` (the
  rule `entryAccess` and My Family Tree now share, in `lib/branch.ts`),
  moving a card as `tree_placements_update` allows (a Root of this tree,
  or whoever may edit the entry), **invite to claim** as
  `can_invite_to_claim_on` (this tree's Root, or the home-tree rules:
  `canInviteToClaimHere`) and **Delete entry** as `can_delete_person`
  (`canOfferDeleteHere`: shown from another tree, only a Root of its
  home). Lines, adding and Suggest are unchanged. Step 92.3's
  `reachOnTree` / `viewerOnTree` moved to `lib/branch.ts` with
  `TreeReach` / `TreeAccess`. **Checked:** the new rules in tests; on
  live, one throwaway member who is a Branch on one throwaway tree, a Leaf
  on a second and the Root of a third (a fourth, not theirs, home to one
  card): every card on the three canvases offered exactly what the
  database answered for them as that member (edit, fill in, delete,
  invite, move, read in one rolled-back block), Edit, Fill in and Suggest
  landing on the matching pages, My Family Tree unchanged, the production
  build. Then removed.
- **Step 92.3 — Acting from My Family Tree** (the third of Step 92; no
  migration). **Aalim asked for:** the view's sheet to offer stories, the
  album, Edit details (or Fill in), Suggest a change and Report a
  problem, each against the card's own tree with the member's account
  type there; lines editable only where drawn on a tree they're a Root or
  Branch of; no claim invites; and **Add a relative** asking **Which tree
  do you want to add to?**, all their trees from the canvas, from a person
  only the trees showing them where they may add, and straight into the
  add flow when there's one. `loadMyFamily` now says, from the reads it
  already made, who the member is on each tree (`reachOnTree`: a Branch's
  part of a Root's side, a Leaf's own line, kept to the view's people, as
  `getViewer` works them out; `viewerReach` in `lib/branch.ts` is that
  walk, shared), which trees show each card in full (`full_tree_ids`) and
  whose own entry each is (one more read beside the cards' finishing).
  In `Canvas`'s `family` mode a card's sheet gets the card's tree as
  `treeId` (stories, album, reports go there; `add_story`,
  `add_album_photo`, `report_entry` and `suggest_entry_change` already
  ask for a tree that is the member's and shows them in full, which it
  always is unless the card is basic, when the sheet offers none of it),
  its rights from the home tree's rules (`entryRightsFromView`, as
  `entryAccess` reads them: the viewer on the card's tree when that's
  home, else only their own entry), a Root badge's powers when they're a
  Root of the card's tree, the album's tag choices kept to those the
  card's tree shows in full, and its lines from `lineEditableFromView`.
  **Edit**, **Fill in**, **Suggest** and **Edit and resend** on another
  tree than the remembered one switch to it first (`switchTreeForm`, as
  `TreeTarget`), and the page carries `?back=family` to come back.
  `/family` reads suggested changes as `/tree` does. No migration, and no
  server action reads the remembered tree: each takes ids, and the pages
  that do read it are reached after the switch. **My calls, not asked:**
  an entry's page opened from the view goes back to it (Back to tree,
  and after filling in or suggesting); the add flow, once a tree is
  picked, is that tree's own and lands on it, since the new person may
  not be in the view; the canvas's button with someone selected counts as
  adding from them, and with nobody, or nobody they may add from, offers
  every tree unconnected; "one tree" means one to offer; **Delete entry**
  isn't offered in the view (not in the list), **Reposition photo** is
  (an edit); companions only show, since a pet's tree isn't read there;
  waiting and declined suggestions show and are answered as on a tree;
  acting on another tree moves the remembered tree there, as **On**'s
  links do; the dialog shows each tree's mark and name, not the account
  type. **Checked:** `viewerReach`, `reachOnTree`, `entryRightsFromView`,
  `lineEditableFromView`, `addTreesFromView`, `full_tree_ids` and the
  `back=family` links in tests; on live, one throwaway member who is a
  Branch on one throwaway tree, a Leaf on a second and the Root of a
  third, with a fourth tree they aren't on as one card's home, in
  headless Chrome on a desktop and a phone, light and dark: every sheet's
  buttons by the home tree's rules (Edit on their side, Suggest on a
  Root's own entry and on the entry homed on the fourth tree, Fill in on
  the Leaf's own line), lines changeable only on the Branch's and the
  Root's trees, no claim invite, This is me, Delete or companion add; a
  story told about Mom (`stories.tree_id` her tree, waiting, the notice in
  that tree's inbox to its Root), a report raised on the Branch's tree, an
  album photo on the Root's tree (tag choices that tree's people only,
  approved, file in its folder), a suggestion sent from the card's tree
  (its home's Root asked in the home's inbox), a marriage date saved;
  Edit, Fill in and Suggest switching trees and coming back; Add from
  nobody, from Me (three trees, then the add flow on the one picked) and
  from Lin (straight to the Leaf's tree); a member JWT refused where the
  account type there doesn't allow (the Leaf's line, a story on a tree
  not showing the person, a report from a tree they aren't on, a
  suggestion on their own Root tree, edits by PostgREST); `/tree`
  unchanged; the dialog off both pages' first load; the production build.
  Then removed.
- **Step 92.2 — My Family Tree on the canvas, and the switcher** (the
  second of Step 92; no migration). **Aalim asked for:** the view drawn
  with the tree's own canvas, always arranged around the member, nothing
  dragged; each card wearing its tree's mark, a key naming the trees, and
  the details sheet naming every tree of theirs that shows the person;
  Search, Upcoming and companions as on a tree; and the switcher for
  everyone, one-tree members too: My Family Tree first, each tree with
  their account type's mark, and starting a tree for anyone who hasn't
  founded one (Step 28's states). Not yet the landing page (92.5), and
  nothing acts from it yet (92.3). `/family` (`app/family/page.tsx`)
  draws `loadMyFamily` with `FamilyTree`'s new `family` mode: computed
  layout only (positions came null from 92.1), anchored on the member,
  `editable` off, so no drag, no Add a relative, no Auto-arrange, no
  "Show only your Root's side", no who's-here room, no Getting started,
  no "Is this you?", and the sheet read-only. Marks and key in
  `components/tree/tree-mark.tsx`; lanes named by
  `generationLabelFromYou`; the sheet's **On** row
  (`PersonOnTrees`); companions from all their trees in one read
  (`getTreePets` takes several trees; one tree's read is unchanged) kept
  to those with someone shown (`companionsShowing`). The switcher reads
  where an ask stands (`my_tree_request`) beside the header's counts,
  only for a member who isn't on a tree they founded; `useStartTree` is
  `StartTreeButton`'s logic shared with it, and "Request received" is its
  own module, fetched after paint, so the header doesn't put Base UI's
  dialog on every page's first load. **My calls, not asked:** the view has
  an address of its own rather than a value of the tree cookie, so the
  remembered tree, "View on tree" and "Also on" mean what they did, and
  92.5 points the landing at `/family`; lanes are the cohorts named from
  them — **Your generation**, **Parents'**, **Grandparents'**,
  **Great-grandparents'**, then **2× great-grandparents'**, and
  **Children's** / **Grandchildren's** down — not numbers; a card's mark
  is a dot in its top corner, across from the report count, and under a
  leaf beside the account mark, but not on a sibling's partner's pill
  (still name only) or a companion; the key sits under **Search &
  filters**, since on the left it covered the first lane's name; the
  sheet's **On** row links each tree to that tree's canvas on the person,
  as "Also on" does, and until 92.3 the sheet shows no stories, album,
  edit, suggest, report or Manage (each would act on a tree); in the menu
  each tree's account type is its mark (the name for screen readers and
  as a tooltip), My Family Tree has a people icon and shows only to a
  member with an entry of their own, and starting a tree is the last item
  — **Ask to start a tree**, **Asked to start a tree** (shows "Request
  received" again), **Start a tree** — with a sprout; the canvas keeps
  this tab's view of `/family` under `my-family`. **Checked:** lane names,
  `companionsShowing` and `myFamilyHref` tests; on live, four throwaway
  accounts on three throwaway trees, the member Leaf, Branch and Root of
  one each, in headless Chrome on a desktop and a phone, light and dark:
  19 of the trees' 22 people (an aunt's father, an ex's father and an
  unrelated entry left out), blue, magenta and blue-ring marks and the
  key, the four lanes, nothing draggable, sheets listing one to three
  trees with nothing to edit, no sheet reads, no server actions and no
  realtime join on `/family` (the tree still joins its room), Search,
  Upcoming (a birthday and an anniversary) and companions (a dog from one
  tree, a cat from another), the switcher both ways and the sheet's tree
  links (the remembered tree as a plain link, another by switching); the
  page's RSC payload holds nobody outside the view; the start-a-tree
  states on a temporary page, so no ask reached the reviewers; the header
  one row at every width from 320 to 1,400 px on `/family` and `/tree`,
  touch and mouse, and from 704 to 1,024 px beside an open sheet; the
  production build. Then removed.
- **Step 92.1 — Who's in My Family Tree** (the first of Step 92; no UI;
  no migration). **Aalim asked for:** every account's own view, pulled
  from every tree it's a member of and joined through shared entries: the
  member's blood (Step 55's walk from their own entry), plus the blood of
  their current partner (a spouse line not ended; an ex's family stays
  out), then anyone in those married or had children with, as cards
  without their own families. A full card beats a basic one; only lines
  one of their trees draws; each card labelled with the tree it came from
  (home tree if theirs, else the tree of theirs that has shown it in full
  longest) and a colour per tree. `lib/my-family.ts` holds the rule
  (`familyTies`: `blood`, `partner_blood`, `partner`), the label
  (`cardShowing` / `mergeShowings`, by `tree_placements.created_at`, the
  order `delete_tree` picks a new home by), one copy of each line
  (`mergeLines`) and the marks (`treeMarkOf`). `loadMyFamily`
  (`lib/my-family.server.ts`) reads every member tree at once and finishes
  only the cards that are in. `getTreeGraph` is split into `cardOf` /
  `lineOf` and `finishCards` so both share the same card-building; its
  output is byte-identical to before. **Tree marks:** `--tree-mark-1`
  (blue) and `--tree-mark-2` (magenta) in `app/globals.css`, filled for a
  member's first two trees and as rings for the next two, in the order
  they joined (docs/design-system.md, "Tree marks"): the only pair of the
  data-viz reference palette's hues that means nothing else here (red is a
  card's report count, orange and brown Root and Branch, yellow
  attention, green the leaves) and passes its validator against each
  other in both themes; adding violet or aqua failed in dark. **My calls,
  not asked:** a co-parent is anyone sharing a child with someone in,
  married or not; only `is_divorced` ends a marriage, so a late spouse's
  family is still theirs; ties in placement date go to the earlier known
  date, then the tree id, and a basic-only card to its longest showing;
  a card's account type and "added by" are read on its own tree; card
  positions are dropped, since the view is always arranged around them;
  a line's dates show if any tree of theirs shows them, `drawn_here`
  means drawn on any tree of theirs and `drawn_on_tree_id` comes along
  for 92.3; past four trees the marks repeat, and leaving a tree moves
  the later trees' marks up; the loader throws rather than draw a family
  from half its lines, and is `null` with no own entry, no tree, or no
  tree of theirs showing them; companions wait for 92.2. **No
  migration:** a member already reads every placement, card and line of
  their trees (`tree_placements_select` is `can_view_tree`; both views are
  security invoker), confirmed live as real members. **Numbers:** 9
  requests in 3 waves whether one tree or two (`my_trees`; then
  `tree_people`, `tree_edges`, `tree_placements`, `historical_names`,
  `member_directory` together; then claims, reports and names, plus
  places and photos when there are any), where two trees' canvases take
  about 18. **Checked:** 19 new tests on Aalim's example (Karim, Raiya
  and his mom, an ex, a co-parent, two current wives, a cousin marriage,
  a cycle); `getTreeGraph` old against new on both live trees with every
  option, JSON byte-identical (signed tokens masked); live, three
  throwaway accounts on three throwaway trees (Mom on her own side and
  Dad's, Dad basic on hers, Raiya in full on both at different dates)
  read 16, 12 and 3 people with 23, 16 and 3 lines as expected, labels,
  per-tree account types and marks right, and opening Raiya's tree to
  Dad's side as a visited tree changed nothing; then removed, live back
  to 2 trees, 202 people and 383 lines.
- **Step 87.7 — Phone paint and hidden work** (the last of Step 87,
  audit Phase 3, findings C5–C7; the hover previews in C7 went in 87.5; no
  migration; landed after Steps 88.6 and 91). **Aalim asked for:** a
  performance trace first (phone emulation, 4× CPU), then on a phone dim
  with opacity only and drop the leaf shadow; the minimap only from `sm`
  up; line selectors that return early when their cards haven't changed;
  FitText skipping `document.fonts.ready` once fonts have loaded, and one
  shared ResizeObserver instead of one per line. The trace agreed with the
  audit: on a phone, in a spotlight, the 74 blurred cards roughly doubled
  raster and composite time during a pan, and every pan or zoom frame
  worked out every line's route again (2,812 geometry calls per pan on the
  77-person fixture). Now the canvas carries `data-phone` on a phone (the
  same test that keeps its cards from dragging, Step 49) and a `phone:`
  variant (`app/globals.css`) turns the filter off there: cards and
  companions off a spotlight fade to 30% as before, without the blur and
  desaturation, and the leaves lose their drop shadow, the selected
  leaf's green glow included (its thicker outline and deeper wash stay).
  `WideMiniMap` mounts the minimap only from `sm` up (`useIsSm` in
  `use-is-phone.ts`), in a component of its own so learning the width
  after hydration redraws it and not the canvas. `useCardsStore` in
  `canvas-edges.tsx` wraps each line's store selectors: it keeps the x, y,
  width and height it last saw for each of the line's cards and hands back
  its last answer while they're unchanged. It compares the numbers, not
  the objects, because a measure or a drag gives every card a new position
  object whether it moved or not. `FitText` shares one ResizeObserver
  across the page: a line's first fit is the observer's first report of
  it, before it is painted; each batch writes every font size, reads every
  width and then settles each, so it costs one layout; a new text is
  watched afresh, so it is fitted again; `fonts.ready` is awaited once for
  the page, and only while a font is still loading. **My calls, not
  asked:** "phone" is Step 49's phone (coarse pointer, screen short side
  under 600), so tablets and narrow desktop windows keep the blur and the
  shadows; the visitor blur on hidden people is opacity-only on a phone
  too (their cards say only "Hidden"); `onlyRenderVisibleElements` (the
  audit's "try above about 150 cards") is left off, since the biggest live
  tree has 117. **Numbers** (the 77-person zz-p3 fixture, production
  builds of main at `2e463c1` and this side by side, headless, 4× CPU,
  ×12, medians; phone = 390 × 844, touch, `isMobile`): pan and zoom
  geometry calls 2,812 / 1,900 → 0 (phone), 3,192 / 912 → 0 (desktop);
  per drag step 77–78 → 3 (the dragged card's lines), a whole drop 1,959
  → 80; opening a sheet 3,581 → 57; load 323 → 95. Script time during a
  phone pan 390 → 311 ms, a zoom 151 → 104. A phone pan in a spotlight:
  composite 220 → 101 ms, raster 308 → 256, paint 59 → 84 (the cards are
  painted into the page instead of being filtered as layers), so 587 →
  441 ms in all; frames over 20 ms while a phone sheet opens 6 → 3.
  ResizeObservers per load 87 → 11, their callbacks 89 → 13; FitText
  measures per load 231 → 154 (77 cards, once when shown and once when
  the web font lands; 77 when it already has); nothing runs while the
  canvas is idle, before or after. Load itself unchanged (script 1009 →
  986 ms desktop, 969 → 929 phone). Screenshots against main: desktop and
  a touch tablet (744 × 1133) pixel-identical in light and dark (load,
  search dimming, spotlight); a phone differs only in a spotlight. Live,
  as a seeded throwaway Root (12 people, 5 photos, a cat) on phone, tablet
  and desktop: loads, pans, pinch/wheel zoom, search dimming, a spotlight
  (leaves, fading, minimized), a `?person=` load with no console errors, a
  real drop kept after a reload, lines following a card mid-drag and
  after; read-only runs of main and this differ only in the phone's
  `data-phone`, minimap and filters.
- **Step 91 — A portrait the browser couldn't redraw isn't uploaded as
  picked** (ad-hoc privacy fix; no migration). Found during Step 88.6:
  `compressImage` (`lib/image.ts`) redraws a picked photo on a canvas,
  which keeps none of its EXIF, XMP or IPTC, but when the redraw failed
  (the file wouldn't decode, no 2d context, `toBlob` gave nothing) it
  handed back the file as picked, and the portrait picker
  (`components/photo-picker.tsx`) took it, so a person's or companion's
  photo could reach the `photos` bucket with its camera's details, GPS
  included. Even the picker's own "That image couldn't be read." (from the
  crop editor) left that file selected, to go up on save. The album already
  refused it (88.6). **Now** `compressImage` returns `null` on any failure,
  a thrown one included, and never the original, so no caller can upload
  one by mistake; the picker shows its existing line, "That image couldn't
  be read. Try another file.", keeps whatever photo was there before, and
  selects nothing; the album's check reads the `null` (its copy is
  unchanged: "That photo couldn’t be read.", or "Choose a JPEG, PNG, or
  WebP image." for a type it doesn't take, such as a HEIC outside Safari).
  The portrait picker already refuses anything but JPEG, PNG and WebP by
  type, HEIC included. `lib/photo-upload.ts` no longer expects a PNG or
  WebP the picker couldn't remake: it only ever gets the JPEG it drew.
  **Verified** in headless Chrome on live as a throwaway Root, on the edit
  page: a "JPEG" with intact EXIF + GPS in front of undecodable data was
  refused with that line, no editor or thumbnail, and after Save changes
  nothing had been sent to storage and `photo_path` stayed empty; a real
  2400×1800 JPEG with EXIF (camera make, date, GPS) then saved as a
  1280×960 JPEG in the person's folder whose segments are only JFIF + ICC
  (no EXIF, XMP or the camera's name); the undecodable one again, with
  that portrait saved, was refused and the portrait kept. The throwaway
  user, tree and file were deleted. 5 new unit tests (`lib/image.test.ts`:
  each failing step gives `null`, two of them failed on the old code);
  1388 pass; tsc, lint and `next build` are clean.

- **Step 88.6 — Tags suggested from a photo's own details** (the last of
  Step 88, the person sheet redesign; migration
  `20260930030000_album_taken_date`, additive, live before the deploy).
  **Aalim asked for:** Add a photo reads the photo's metadata before it's
  shrunk (the canvas re-encode keeps none of it): named face regions
  (Metadata Working Group and Microsoft) and XMP keywords matched to people
  on the tree, suggested as tags; the date taken, stored as the photo's
  "taken" date and used to rank toward people alive then; GPS dropped, not
  stored; no face recognition. Now `lib/photo-metadata.ts` reads a picked
  JPEG, PNG or WebP in the browser, beside the shrink: EXIF (the date taken
  and Windows' Tags; the GPS directory is never opened), XMP (MWG and
  Microsoft regions, IPTC's person shown, `dc:subject`, Lightroom / digiKam
  / Windows / Media Pro keyword trees, the XMP and Photoshop dates; long
  packets rebuilt from JPEG's extended segments, PNG's compressed ones
  inflated), and IPTC (keywords, date created), through a small
  namespace-aware XML reader (`lib/xml-lite.ts`), never throwing. The
  names it finds are matched to people on the canvas (`lib/photo-tags.ts`)
  and offered under "Who's in it" as **Suggested**, one press each or
  **Add all**; the date fills in **Date taken** (`DateField`, as much as is
  known), or "+ Date taken" when the photo gives none; the carousel shows
  "Taken 16 July 1985" under each photo. `album_photos.taken_on` +
  `taken_on_precision` (a person's date convention: first day of its
  period, both or neither); `add_album_photo` takes `p_taken_on`,
  `p_taken_precision` (the four-argument version dropped, so the old
  code's call still resolves; refuses a date after tomorrow);
  `entry_album` returns them. **My calls, not asked:** a full name
  (given or preferred, then last or maiden, with any middle names or
  initials between; case, accents, "Doe, Jane" and brackets ignored)
  suggests from any source; a given name alone ("Jane") only from a face
  region or a People keyword, and only when one person has it; a name
  fitting several keeps those alive when it was taken (born before, not
  died before; a "c." date widened five years) and drops the rest, but
  nobody a name fits alone is dropped for their dates, since a scan's
  camera date is the day it was scanned; of a photo's several dates the
  oldest wins (a scan's 2023 against a written-in "1962" gives 1962); a
  date before 1826 or after tomorrow in a photo is ignored; the same date
  orders everyone in the picker (alive then, can't say, couldn't have
  been); two suggestions of one name get "(b. 1920)"; basic and blurred
  cards are never matched; the photo's date goes if the photo is removed
  or replaced, a typed one stays; a photo the browser couldn't redraw is
  refused rather than uploaded as picked (it would have carried its GPS:
  88.5 sent the original up when the canvas failed); HEIC isn't read (the
  browsers that can't draw it refuse it anyway); a photo's caption isn't
  used for the description. `tagPersonOf` lives apart
  (`lib/tag-person.ts`) so only it joins `/tree`'s first load; the reader
  and the matching load with the dialog. Privacy notice: two lines on
  what's read on the device and what's kept. **Verified** on live as a
  seeded throwaway Root (seven people, two of them "Ali Testwood" 75
  years apart), headless, with photos a real encoder wrote: a camera date
  1985, GPS and Lightroom-style faces "Ali Testwood", "Fatima Oakes" (her
  maiden name), "Hassan" and keywords "Zainab Testwood", "Beach" suggested
  exactly the 1920 Ali (b. 1920), Fatima, Hassan and Zainab, filled in 16
  July 1985 and stored it at `day`; typing 2000 instead suggested the 1995
  Ali; a scan (camera 2023, written 1962) filled in 1962 and stored
  1962-01-01 at `year`; a bare photo got "+ Date taken", refused
  1 December 2026 ("That’s after today.") and stored March 1990 at `month`,
  the picker then led with those alive in March 1990. Every stored file:
  JFIF + ICC only, no EXIF, XMP, IPTC or GPS, 1600px. The four-argument
  call through PostgREST still resolves. Phone (390px): no sideways
  scroll. 25 new unit tests (Lightroom, digiKam, Windows Photo Gallery,
  IPTC, extended XMP, PNG, WebP fixtures from sharp; truncation and
  noise; names, dates, ranking). Throwaways and their files removed.

- **Step 87.6 — One GET for the sheet** (the sixth of Step 87, audit Phase
  3, finding S6; no migration; landed after Step 88.5 and bundles its
  album). **Aalim asked for:** one GET route that returns everything the
  details sheet reads on open, in parallel, fetched with an
  `AbortController` and kept per person, like the ancestral lands. The
  sheet read "Also on", its open reports, the album and its stories
  through four server actions from effects, and the client sends actions
  one at a time, so they went in single file, waited behind any save (a
  card drop), and clicking through relatives queued reads for people no
  longer open. Now `PersonPanel` calls `useLoadPersonSheet`
  (`components/tree/use-person-sheet.ts`), which asks
  `GET /api/person-sheet?person=<id>&want=trees,reports,album,stories`
  once for whatever that person's sheet lacks: "Also on" unless the tree
  is read-only, reports only while the card counts some (again when the
  count changes), the album and stories unless the entry is locked. The
  route reads the sections side by side as the viewer, through RLS, with
  the same queries as before (`lib/person-sheet.server.ts`); a section
  that fails is named and the others still arrive, so "Couldn’t load the
  album / the stories. Try again" work as before. `PersonTrees`,
  `EntryReports`, `EntryAlbum` and `EntryStories` read their person's
  entry (`usePersonSheet`) and write their own changes to it
  (`setPersonSheet`: a story told, answered, shared or deleted, a comment
  counted, a photo added, answered or taken out, a report dealt with), so
  coming back to someone shows what was done; an answer sent before such
  a change doesn't overwrite it. `listPersonTrees`, `getEntryReports`,
  `getEntryAlbum` and `getEntryStories` are gone. Place search's
  per-keystroke action is in the same finding, so it moved too:
  `GET /api/places?q=` (`searchPlacesAction` gone), and a newer search
  calls off the last one when it goes out (not on the keystroke, so a
  result can still land between keys, as before). **My calls, not
  asked:** a person's reads count as fresh for a minute (clicking back and
  forth between relatives reads nothing) and every new page from the
  server marks them all stale (`FamilyTree`), so after any save that
  redraws the page, or coming back to the tree, each person is read again
  when next opened; an open sheet isn't read again when the page is
  redrawn (it wasn't before either); a minimized sheet still reads, as its
  sections stayed mounted. The ancestral lands keep their own GET: keyed
  by place, not person, shared with share links, and a slow answer from
  Native Land Digital would hold up the rest. A share link's sheet and a
  visitor's read none of these, as before. The pet sheet's comments are
  still an action (not in S6). An abort stops the browser waiting; the
  server's queries still finish. Agreed with the Step 88.5 session by
  message: documents stayed out while they were going; 88.5 landed first,
  so this rebased and took the album in. **Numbers** (live, a seeded
  10-person throwaway Root, production builds of main at `76f00e5` and
  this side by side, headless, ×12, opening Dad, who has "Also on", two
  stories, two album photos and a report): per open, 4 actions one after
  another → 1 GET; 4.0 KB across four replies → one of 3.6 KB. Every
  section now shows in the same frame at 407 ms (median; 311–498):
  "Also on" 513 → 407, the album 865 → 407, stories 1056 → 407, but
  **reports 328 → 407**, since the answer waits for its slowest part
  (the album's signing) where the reports used to arrive first. Opening
  the same person again: 4 actions, stories at 1063 ms → no read, 13 ms.
  Right after a card drop: the reads waited for the drop's reply (251 ms)
  → the GET goes out beside it; stories 1082 → 424 ms. Five relatives
  clicked through 120 ms apart: 18 actions, 15–16 finishing after the
  last click, the last person's stories at 3534 ms → 5 GETs, 4 called
  off, 341 ms. Place search: typing "Toronto" 60 ms a key, one search
  either way, results 816 → 810 ms after the last key (the query's own
  time); 260 ms a key, six searches either way, results 9 → 9 ms after
  the last key (main's worst 817, queued behind the one before; this
  one's 12). **Verified** on live against both builds as the throwaway
  Root and a Leaf: the same sheets on main and on this (diffed): the
  Root's pending story, waiting photo and Root-only report hidden from
  the Leaf, the Leaf's own report shown to them, "Also on" for the people
  on the second tree, a `/tree?person=` load with no console errors, and
  a share link's sheet reading nothing (no `/api/` request, no action).
  On this build: a story told on Mom showed at once, stayed after opening
  Sister and coming back (no read for Mom), and after a reload; approving
  a waiting story, and a waiting album photo, stayed approved on coming
  back; resolving a report took it away at once and after the page caught
  up; the Leaf's new report made the count, and the sheet read only the
  reports; a drop then an open showed the sheet; asking the route as the
  Leaf for Uncle's reports or Grandma's stories returned none of the
  Root's; bad ids or sections 400; signed out is sent to `/join` by the
  proxy, as for every `/api/` route. `npm test`, `tsc`, `eslint` and the
  build clean. The throwaway accounts, trees, rows and album files were
  deleted.

- **Step 88.5 — The album replaces documents** (the fifth of Step 88, the
  person sheet's redesign; two migrations: `20260930010000_album`,
  additive, live before the deploy, and
  `20260930020000_documents_become_album` after it). An entry's
  **Documents** section is gone; in its place is an **Album**: a carousel
  across the sheet, one photo at a time, swiped (scroll-snap) or stepped
  with ‹ › and the arrow keys, "2 / 7" beside its details: who added it
  ("You" for your own) and when, **Waiting for approval** / **Not
  approved**, the description, "With …" for anyone else in it the viewer
  may see (a waiting or declined tag says so to the uploader), and what the
  viewer may do: **Approve** / **Decline**, **Remove** (from this album)
  and, for its uploader, **Delete** (from every album: "It goes from every
  album it's in." when it's in others). A press on the photo shows the
  whole of it. **Add** opens **Add a photo**: Photo, Description, Who's in
  it (the album's person locked in, anyone else on the canvas added from
  the companion picker, up to 20). A picked photo is shrunk at once to
  1600px JPEG (`compressImage`, which drops EXIF, GPS included); a HEIC the
  browser can't open, or a file over 10 MB, is refused there. The album
  shows each photo from an 800px storage transform (`resize: contain`,
  WebP to browsers; one signing call a photo, in parallel), the whole photo
  only in the dialog. **Aalim asked for:** anyone on the tree can add; the
  uploader can tag several people and the photo shows in each album, so
  approval is per tag; nobody else sees it until it's approved, by the
  person on a claimed entry, else whoever can edit it; documents go
  entirely, no PDFs, the one on live moving into its person's album,
  waiting; not on share links. So: `album_photos` (file, description,
  uploader, the tree it was added on) and `album_tags` (a person each,
  `pending` / `approved` / `declined`), `add_album_photo` (one notice per
  approver, `photo_to_approve`: "… added a photo of you and 1 other,
  waiting for your approval."), `decide_album_tag` (`photo_approved` /
  `photo_declined` to the uploader), `entry_album` for the sheet, the
  approvers being Step 88.3's (`private.story_owner`, else
  `can_approve_story`'s editors), and a private `album` bucket at
  `<tree>/<uuid>.<ext>`: any member of that tree uploads, whoever sees the
  photo reads, the uploader alone removes an upload no photo took. A tag a
  viewer could approve is approved at once (a Root adding a photo of an
  ancestor, anyone adding one of themselves).
  **My calls, not asked:** one photo per add; the description can't be
  edited, nor the tags after the add; a tag the uploader could approve
  needs no approval; **Remove** takes someone out of one album (the
  uploader, the approver or whoever may edit the entry), and a photo nobody
  is in any more goes, file and all (`album_tags_last_gone`); a declined
  photo stays for its uploader, marked; someone else's photo of an entry
  keeps a Leaf from deleting it and a placeholder from merging away, and a
  merge ("This is me", a claim invite) moves the tags along; the uploader's
  account going leaves their photos, added by nobody. The live document
  (a 4096×3072 JPEG, 1.8 MB, with EXIF) is re-encoded upright at 1200×1600
  (163 KB, no metadata) into the album bucket by a one-off service-role
  script after the deploy; the second migration then makes it a photo of
  its person uploaded by them, waiting for their own yes, with no notice
  (they put it there), and refuses to run while any document's copy is
  missing; the emptied bucket goes through the Storage API. Gone with
  documents: `documents`, its bucket and storage rules,
  `private.can_see_document(s)` / `can_write_document` / `document_rule_in`
  / `documents_guard`, `app/actions/documents.ts`,
  `components/person-documents.tsx` (on the sheet and the edit page),
  `lib/document-path.ts`, `canSeeDocuments` and the "See documents" row of
  the account types (now "Add stories and photos, and report problems").
  Every sweep that knew documents knows the album: `deletePerson` (the
  photos nobody else is in), `deleteTree` (`treeFiles`), the claim merge,
  `exportTreeData` (`album_photos` + `album_tags`, not `documents`),
  `deleteAccount` and `remove_tree_member` (nothing to hand over). The
  dashboard counts "Album photos added"; the privacy notice and the three
  consent boxes no longer mention documents. **Verified** on live with a
  rolled-back rehearsal of both migrations (68 checks as five throwaway
  members: uploads by tree, per-tag visibility and answers, notices, untag
  rights, the last-tag cleanup, delete and placeholder rules, the claim
  moving a tag, the document's move, every body's md5), then end to end in
  headless Chrome as a throwaway Root and three Leaves on a seeded tree:
  a 3000×2000 PNG stored as a 1600×1067 JPEG with no EXIF, shown as an
  800×534 WebP of 6 KB and whole in the dialog; the person approved two
  and declined one (gone for them, "Not approved" for the uploader), the
  Root declined the ancestor's tag; a third Leaf saw only the approved
  photos, through the sheet and through PostgREST with their own token
  (no signed link for the declined one's file, 403 on a direct insert);
  Remove kept the photo in the uploader's own album; Delete removed the
  file within 1.2 s; storage let only the uploader remove a stray upload
  and refused an upload to another tree; a refused add (someone tagged no
  longer on the tree) took its upload back; deleting the ancestor kept the
  photo the person was also in and removed the one only of them; the
  export carried the album; the phone carousel swiped; and deleting the
  tree left the album bucket empty. Throwaways removed after. **Then, at
  Aalim's ask,** the sheet's **Family** and **Companions** folds moved
  below the Album and Stories: details, Album, Stories, Family,
  Companions, Manage.

- **Step 88.4 — Story links and story comments** (the fourth of Step 88,
  the person sheet's redesign; one migration,
  `20260929200000_story_links_and_comments`, additive, live before the
  deploy). **Aalim asked for:** an approved story gets a **Share** button
  (the phone's share sheet, copied on a desktop) whose link opens the
  story read-only with no account; the person or whoever can edit the
  entry can turn a link off; and **anyone who can see a story can comment
  on it**, with no approval. So an approved story's card has **Comment**
  (or "2 comments"), which opens its comments under it (oldest first, "Add
  a comment", **Post**), and **Share**; once a link works it's marked
  **Shared**, and whoever may turn it off sees **Stop sharing** ("Stop
  sharing this story?", "Its links stop working."). The link is
  `/shared/story/<token>`: the title (else "A story about <name>"), "About
  <name> · Shared by <name>", the text and the recording, and **Sign in to
  see the comments** (**See the comments** when signed in), which goes
  through `/stories/<id>` to the person's sheet on a tree of the member's
  that shows them, with that story's comments open. `story_links` and
  `story_comments` are new, with `share_story`, `stop_sharing_story`,
  `shared_story` (service role only), `story_place`, `add_story_comment`
  (tells the teller and the person, `story_commented`) and
  `list_story_comments`; `entry_stories` also gives each story's comment
  count, whether a link works, whether the viewer may share it or stop
  it, and their own link; `stories.links_off`.
  **Defaults already chosen, not asked:** anyone who can see an approved
  story may make its link, and its teller may turn it off too; the page
  shows the story, the person's name and who shared it, not the comments,
  with a way through for members; no link for anyone hidden from visitors;
  a comment is deleted by its author, the story's teller or the entry's
  editors; built like the tree's share links (a service-role read, no
  grant to visitors). **My calls, not asked:** each sharer gets their own
  link (pressing Share again sends the same one), so the page names who
  sent it; **Stop sharing turns off every link at once and keeps them
  off**: after that only the person, an editor of the entry or the teller
  can share it again (their Share turns links back on, with new tokens),
  so a relative can't undo it by sharing again. A link also stops working
  while the person is hidden from visitors, and once its sharer is no
  longer on a tree that shows the person; it goes with the sharer's
  account. Tokens are 24 URL-safe characters (144 bits), shorter than a
  tree link's for pasting into chats. The share sheet is used wherever the
  pointer is coarse (phones and tablets); a desktop copies. When the link
  took long enough to make that the browser no longer counts the press, a
  toast holds it with **Share** / **Copy**. Comments are for approved
  stories only, up to 2,000 characters, not editable; the teller and the
  person (claimed and living) are told of each, on a tree of theirs that
  shows the story. The page isn't indexed; a chat's preview reads the
  story's title and "A story about <name>, shared by <name>." Views aren't
  counted. The tree export carries the exported stories' comments, not
  their links. The dashboard counts "Comments on stories"; the privacy
  notice says a shared story is the one thing anyone with its link can
  read. **Verified** on live as a seeded throwaway Root and Leaf in
  headless Chrome against this build: the Leaf shared the Root's story
  (one action; a second press sent the same link with none), the card
  showed **Shared**, the Leaf commented ("You", "1 comment", the box
  cleared and kept focus); signed out, the link showed the story, "About
  Nanima Zz884 · Shared by Amina Zz884", no comment, `noindex`, the
  preview's title and description, and its sign-in link led to
  `/join?next=/stories/<id>`; the Root's `/stories/<id>` opened the sheet
  with the comments open and the story in view, `story` gone from the
  address, and the Leaf's comment deletable; **Stop sharing** made the
  Leaf's link say "Link not available" and took the Leaf's Share away,
  while the Root's new link worked ("Shared by Rahim Zz884") and the old
  one stayed dead; the Root deleted the Leaf's comment, the Leaf deleted
  their own; on a phone the share sheet got the title and link, and a
  stale press fell back to the toast's **Share**. A bad id and a story on
  a tree the Leaf isn't on both opened the plain canvas. The Root's inbox
  had "Amina Zz884 commented on your story about Nanima Zz884." The
  migration was rehearsed in a rolled-back transaction on live (62
  checks as real member ids, an outsider, anon and the service role: who
  may share, stop, read tokens, resolve, comment, delete; hidden
  people; a pending story; cascades), then applied from its file with
  every function body md5-checked in the same transaction. The throwaway
  accounts, tree, links, comments and notices were deleted. **Known:** a
  link paused by hiding the person works again if they're unhidden. The
  run also caught a hydration error on every `/tree?person=` load, from
  Step 87.4; that session fixed it ("Step 87.4 fix", below).

- **Step 87.5 — Card-sized photos** (the fifth of Step 87, audit Phase
  3, finding C3 and C7's hover preview; no migration). **Aalim asked for:**
  a small signed storage `transform` for cards, full size for the sheet
  and the photo dialog, and the hover preview mounted on hover. So
  `getTreeGraph` and `getTreePets` sign each photo twice: `photo_url` as
  before, and `photo_card_url` (`signedCardPhotoUrls`, one
  `createSignedUrl` per photo with `transform`, in parallel, since storage
  signs transforms only one at a time; the full address stands in where it
  won't sign one). Every small face draws the card copy: person cards, pet
  chips, the pet sheet's header, the minimized card, Upcoming, who's-here
  faces. The sheet's portrait, its photo dialog and the cropper stay full
  size. A person card's, pet chip's and leaf's hover preview mounts on the
  first pointer over it (then CSS shows it on each hover as before), with
  the card copy under the full photo until it lands. `keepSignedUrl` keys
  on the address plus the token's `transformations`, so the full photo
  and each size of card copy are kept apart and a save refetches neither.
  `useSteadyPhoto` keeps a face's picture while a new address loads: Base
  UI's `AvatarImage` fell back to the initials on every `src` change, so a
  photo signed again (after 50 minutes, or a crop zoomed into a larger
  copy) blinked. **My calls, not asked:** `resize: contain` in a square,
  not a width: a width alone keeps the full height (128 × 1280, 27 KB) and
  would stretch the crop; retina: 128 px at zoom 1 (a portrait's short side
  gets 128, a 4:3 landscape's 96: 2.4–3.2 px per point on a 40 px avatar),
  and 64 px more per step of the crop's zoom so the part a card shows
  keeps that (`cardPhotoEdge`: 1.21 → 192, 1.57 → 256, 2.43 → 320, capped
  at 1280), since half of live's photos are zoomed; the card avatar now
  clips to its circle (`overflow-hidden`, as every other face already
  did): a zoomed crop's CSS scale drew a bigger circle over the name, on
  main too; the hover preview keeps the full photo (224 px wide, so a
  small copy would be soft), so the first hover loads it, and the sheet
  opened after that finds it cached. Pages off the canvas (/account,
  /welcome, the edit form, onboarding) still show the full photo: one
  face each. **Numbers.** Live throwaway tree (5 photos, 130 KB each):
  photo bytes on load 647 → 42 KB (5 card copies: 96×128, 256×192,
  320×320, 192×192, 128×128, WebP), the same on its share link (647 →
  42 KB); photos shown 1514 → 1387 ms, cards shown 915 → 905, document
  end 719 → 645 ms (10 alternating loads; the extra signing is hidden in
  the page's parallel reads); hovering a card 0 → 1 image (133 KB), then
  the sheet and its photo dialog 0 new requests either way; a crop saved
  from zoom 1 to 2 fetches one 8.7 KB copy (main 0), 0 initials frames;
  a drop 0 refetches. 77-person fixture (41 photos, 4× CPU, ×12,
  alternating, main at `f1a686e`; the fixture's card copies are local
  JPEGs, 9–33 KB): images on load 5,450 → 471 KB, photos shown 1085 →
  1024 ms locally and 7028 → 2042 ms on a Fast-4G-like link, cards shown
  937 → 888 and 1466 → 1437 ms, first paint unchanged; hover previews in
  the DOM 41 → only those hovered; saves, a rename, an add and a replayed
  drop refetch nothing either way; a save that re-signs every photo
  refetched 41 full photos (5.4 MB) and showed initials on 41 cards for a
  frame on main, and now refetches 41 card copies with 0 initials frames.
  Framing checked by 2× screenshots of 8 avatars against main (same
  crop, zoomed ones included). **Known:** the live-cursor faces don't use
  `useSteadyPhoto` (a peer's face may blink once when re-signed after 50
  minutes); a tree with many photos makes that many signing calls per
  render.
- **Step 90 — A removed document's file goes** (ad-hoc bug fix; no
  migration). Found verifying Step 87.4 on live: removing a document from a
  person's details deleted its row, then asked the member's own client to
  remove the file, and every time (7 of 7) the file stayed. The bucket's
  `storage_documents_select` shows a document's file only while a
  `documents` row points at it, storage deletes only what the caller can
  see, so with the row gone the remove matched nothing and said nothing
  (the result wasn't checked). The same was true of an upload that couldn't
  be recorded (the client removed a file no row pointed at yet). **Now**
  `removeDocument` deletes the row as the caller (a refusal still says "Only
  someone who can edit this entry can remove its documents.", and nothing
  is removed), reads the path back from that delete, and removes the file
  after the response with the service role, only when no row points at it;
  `recordDocument` removes its own upload the same way when the row is
  refused, only a file in that entry's folder on that tree
  (`isDocumentOf`). A removal storage says it didn't find is now logged.
  **Also checked the other paths:** `deletePerson` already removed
  documents with the service role, but read their paths as the caller, who
  may not see all of them (a Leaf deleting an entry they added): it reads
  them with the service role now. **Deleting a tree** removed no files at
  all (the Step 82 gap): `deleteTree` now reads the tree's photos (entries
  and companions), its documents and its entries' story recordings before
  `delete_tree`, and after it removes each that nothing points at, so an
  entry that moved to another tree keeps its photo and recordings. Claim
  merges (`claim_person`, `merge_invited_entry`) move document rows, never
  delete them, so they leak nothing. Step 88.5 (the album replaces
  documents) will drop the bucket; until then this keeps it tidy.
  **Orphans on live:** none to sweep — the documents bucket held 1 file
  with its 1 row (the 87.4 run's files were already gone), photos 11 with
  none unshown, stories none. **Verified:** in headless Chrome on live as a
  throwaway Root with a seeded tree, reading the buckets back through the
  Storage API: two documents uploaded through the sheet's **Add
  documents**, one removed → its file gone within 0.7 s, the other stayed
  (file and list); **Delete entry** on that person → the last file gone;
  a third document on another entry with a seeded photo and story
  recording, then **Delete this tree** in the Root console → the document,
  photo and recording all gone. No `[file-cleanup]` warnings. The
  throwaway user, profile, tree and files were deleted; live's counts are
  as before. 1349 tests pass (2 new); tsc, lint and `next build` are clean.

- **Step 87.4 fix — No hydration mismatch on a `?person=` link** (no
  migration). Reported by the Step 88.4 session: `/tree?person=<id>` on
  87.4 logged React's hydration error (#418) every load. The canvas
  preloads the sheet's code as its script runs when the address names a
  person, so by hydration `lazyComponent` could draw the loaded sheet
  where the server had drawn `next/dynamic`'s boundary. `Lazy` now draws
  the boundary while hydrating (`useSyncExternalStore`, server snapshot
  "hydrating") and the loaded component only in instances made after, so
  dialogs and sheets mounted later still open in the same render.
  **Verified** on the fixture's prod build: `?person=` loads 4/4 with the
  error → 0/4 (1× and 4× CPU), the sheet still open each time; the
  sheet, cropper, Add a companion and Ask to join still animate in on
  their first frame with focus landing and returning as before.

- **Step 87.4 — Lighter first load** (the fourth of Step 87, audit Phase
  3, finding C1; no migration). **Aalim asked for:** the labels out of the
  zod modules, which takes zod off every page (the bell's list reached
  `lib/person-schema` through `lib/suggestions`, so the root layout carried
  zod); `next/dynamic` for the sheets, dialogs, the photo cropper and the
  bell's list; the Supabase client and presence after first paint. So sex
  and lineage labels live in `lib/person-labels.ts` and species labels,
  glyphs and `petYears` in `lib/pet-labels.ts` (both schemas re-export
  them); `components/lazy-component.tsx`'s `lazyComponent` wraps
  `next/dynamic` (`ssr: false`) with a `preload()`, and an instance made
  once the code is here draws it in the same render, so nothing opens
  through an empty Suspense frame; `useLoadedSoon` mounts a piece, closed,
  once the page is idle (or sooner on a pointer over what opens it).
  `PersonPanel` and `PetPanel` load that way (a card hovered loads them
  early; a `?person=` link asks for the sheet's code as the canvas script
  runs), and the sheet fetches `ReportDialog`, `AddCompanionDialog` and
  the cropper once it's mounted; `PhotoPicker` fetches the cropper when
  it mounts; the bell's list and Clear load when the bell is pointed at,
  focused or opened (its skeleton shows meanwhile); the share link's
  "Ask to join" is a plain button with the dialog behind it
  (`request-invite-dialog.tsx`; `finalFocus` back to the button); the
  presence room imports the Supabase client inside its join, and a
  document upload inside the upload. `NOTIFICATIONS_READ_EVENT` moved to
  `lib/header-counts.ts`. **My calls, not asked:** mount-on-idle rather
  than mount-on-open, so every sheet and dialog still opens with its
  transition and its focus handling exactly as before; the six form pages
  whose own forms validate with zod keep it (/account's own-entry form,
  /people/new, edit, suggest, /welcome, /onboarding); TreeSearch and
  Auto-arrange's confirm stay in the canvas bundle (not asked for);
  `lib/first-load.test.ts` walks the header's and the canvas's static
  imports and fails if they reach zod, react-hook-form, the form schemas
  or the browser client (it fails on main). **Numbers** (prod builds, main
  at `71af02d` → 87.4, gzipped first-load JS from the client reference
  manifests): every page 315.8 → 233.1 KB (zod ≈ 94 KB of it gone from the
  layout); /tree and /shared/[token] 548.0 → 357.1 KB (no zod, auth-js,
  realtime, react-hook-form, cropper, sheets or bell list before the
  cards); home 322.6 → 255.9, /account 461.1 → 400.0, /people/[id]/edit
  439.9 → 376.0, /join 323.2 → 256.7; only /people/[id]/suggest grew
  (366.4 → 366.6). On the 77-person
  fixture (4× CPU, ×12, alternating, main at `0857c9e`): JS on the wire before the cards show
  557 → 368 KB; cards shown median 907 → 829 ms locally, 1395 → 1167 ms on
  a Fast-4G-like link, read-only 839 → 767 ms; first paint unchanged (148
  vs 148 ms, 276 vs 272 ms); render counts on load unchanged (77 cards, 1
  layout, 1 sheet); drops unchanged. Opening, main vs 87.4: a sheet
  431 / 436 ms, the cropper 105 / 99, Add a companion 134 / 128, Ask to
  join 113–123 / 112–120, a `?person=` link's sheet 918 / 866 ms (its
  cards 1188 / 1236 ms); every one animated in on its first frame with its
  content, focus landing and returning to the same element. Known: a card
  clicked within ~300 ms of the cards appearing, before the page is idle,
  opens ~90 ms later than main (4× CPU) while the sheets' code arrives.
  **Verified** on live as a throwaway Root and Leaf (5 people, a cat, a
  photo), main beside the change, twice each: presence both ways and the
  Leaf's pointer seen by the Root; a person's sheet, the cropper (focus to
  the frame and back to Reposition photo), the companion's sheet, a
  document upload (the lazy client) and its removal, the bell (5 unread,
  list, Clear, count cleared) and the Leaf's Report dialog (focus to the
  box and back), all alike, with no console errors. Removing a document
  leaves its file in storage on main too (spun off). The throwaway
  accounts, tree, files and sessions were deleted.

- **Step 88.3 — Stories** (the third of Step 88, the person sheet's
  redesign; four migrations). **Aalim asked for:** stories in place of the
  entry's comments board, each long-form text or an uploaded recording,
  showing who added it and when; and **a story needs approval**, from the
  entry's own person once it's claimed, or else whoever can edit it
  (the album's approvers, Step 88.5). Nobody else sees a story until it's
  approved; its teller sees their own while it waits. So the sheet's
  **Stories** section (where Comments was) lists the stories the viewer
  may see, newest first: title, teller ("You" for their own), when, the
  recording's length, **Waiting for approval** or **Not approved**, the
  text folded past six lines or 480 characters ("Read more"), and a
  player. **Add** opens "Add a story": Title, Story, and **Add a
  recording** (any of them but the title alone). Whoever approves a
  waiting story sees **Approve / Decline** on it; its teller and whoever
  can edit the entry see **Delete** ("Delete this story?", "This cannot be
  undone."). `stories` (`20260929180000_stories`): select RLS lets the
  teller see their own, members of any tree showing the person in full see
  approved ones, and `private.can_approve_story` see waiting ones; told
  only by `add_story` (approved at once when its teller could approve it,
  else the approvers are asked in their inbox), answered by
  `decide_story` (the teller is told), deleted through RLS.
  `entry_stories` (`20260929185000_story_list`) reads an entry's stories
  in one call as the viewer, with each teller's name and whether the
  viewer may approve it. Recordings go in a private `stories` bucket
  (25 MB, audio types only), in the person's folder, uploaded from the
  browser by a member who may tell that person a story, and read by
  whoever can see the story; the uploader can remove an upload no story
  took (`20260929187000_story_upload_discard`: storage finds a file before
  deleting it, so the uploader needs to read it). The 3 live comments
  became approved stories with the same ids;
  `20260929190000_comments_become_stories`, after the deploy, carries
  anything written on the old board meanwhile and drops `entry_comments`
  and its notice trigger.
  **Defaults already chosen, not asked:** the teller or the entry's
  editors delete; a recording is shrunk in the browser to one channel of
  speech; not on a share link's read-only canvas (nor for a visitor, nor
  on a basic card); the comments carried over approved. **My calls, not
  asked:** a story is the person's, not a tree's: an approved one shows on
  every tree that shows the person in full (the board was per tree), and
  the album will be too. The approver is the person only while they're
  living (`private.story_owner`: `person_owner_member`, but not for
  someone who has died), and a story told by someone who could approve it
  is approved at once, with nobody asked. A declined story stays, marked
  **Not approved**, for its teller alone, so their words aren't lost; they
  can delete it. The approvers' notice goes where a suggested change's
  does (Step 68): the person themself ("…added a story about you, waiting
  for your approval.", on a tree of theirs that shows them), else the
  owner, the home tree's Roots and its tending Branches. A title is
  optional, up to 120 characters; a story up to 20,000. A recording is
  remade as **AAC in an .m4a** where the browser can encode it (plays
  everywhere), else **Opus in an .ogg** (Firefox; Safari plays it from
  18.4), both mono 48 kHz (AAC 48 kbps: macOS refuses less once it starts,
  though it says it can; Opus 24 kbps), each encoder tried in turn;
  **Mediabunny** reads the file as a stream, so an hour's recording never
  sits in memory, and loads (138 KB gz) only once someone picks one. With
  no encoder, the file itself goes if the bucket takes it; a smaller
  original that plays everywhere (MP3, M4A) goes as it is. A recording is
  a file picked from the device; nothing records in the browser. A teller's name is `member_label`
  wherever the story is read, so a teller on another tree is still named;
  their stories stay, told by nobody, when their account goes (the
  per-tree hand-over the comments had is gone). A deleted story's
  recording goes after the response, with the service role; deleting an
  entry removes its stories' recordings; the tree export carries the
  stories told on the tree and the approved ones about its people, not a
  waiting or declined one told on another tree. Someone else's story keeps a Leaf from
  deleting an entry and a placeholder from merging, and a merge moves
  stories along, as comments did. Copy: the Leaf join line, the account
  types table ("Add stories and report problems"), the privacy notice and
  the dashboard ("Stories told"; "Comments on companions") say stories.
  **Verified** on live as three seeded throwaways (a Root, a Leaf, and a
  Leaf behind his own entry), in headless Chrome against this build: the
  Leaf told an entry nobody claimed a story, then two with a recording (a
  10 s, 1.76 MB stereo WAV went up as a 51.7 KB mono .m4a); only the Root
  was asked; the Root saw all three with Approve / Decline / Delete,
  approved two and declined one; the other Leaf saw only the approved two
  with no buttons, and the recording played (`audio/mp4`, 10.07 s); the
  teller saw the declined one marked, deleted it, and its file went. On the
  claimed Leaf's own entry, only he was asked, the Root saw nothing until
  he approved, and his own story was approved at once; his inbox showed
  the ask with **View on tree**. A share link's sheet had no Stories. On a
  phone the dialog fit (358 px of 390, no sideways scroll). The Opus path
  (forced first) made an Ogg Opus file that played. Storage through its
  API with real member tokens: a stranger's upload to that folder and a
  non-audio type were refused, the uploader removed his loose upload but
  not one a story used, another member couldn't read a loose upload.
  Deleting the entry took its stories and their recordings. Each
  migration was rehearsed first in a rolled-back transaction (the first
  and last together, 70 checks as throwaway users, every function body
  md5-checked), and the three before the deploy were applied from their
  files with a self-check. The throwaway accounts, tree,
  stories, recordings and notices were deleted. **Known:** a waiting
  story isn't in the Root console or any count (only the inbox); a story
  can't be edited, only deleted and told again; deleting a whole tree
  leaves its stories' recordings in the bucket (as it does photos, Step
  82); an upload whose story couldn't be reached stays.

- **Step 87.3 — A card drop without a redraw** (the third of Step 87,
  audit Phase 3, finding S3, Step 61's leftover; no migration). **Aalim
  asked for:** a local position applies only while the server still has
  the pre-drop value, so Auto-arrange or a later refresh wins. So
  `setPersonPosition` and `setPetPosition` no longer call
  `revalidateTreePages`, and the canvas lays a dropped card out itself:
  `lib/local-drops.ts` holds each drop (what the row held before, the
  rounded nudge saved, and once the save answers, the newest page the tab
  had then), and `placeDrops` puts it on the rows before the layout while
  the row still holds its old value and the page is no fresher than the
  save. A refused or unreachable drop is taken out again, so the card
  goes back with the toast, as before. **My calls, not asked:** the drops
  live for the tab, not the canvas, because Back reuses the page this tab
  was handed before the drop (Next reuses pages on back/forward whatever
  `staleTimes` says) and, with no revalidation, nothing else would mark it
  stale; pages are told apart by the props object itself (`pageNumber`),
  which is the same object when Back brings it again; any page drawn
  after the save retires the drop, even one whose row reads as it did
  before (so another member's Auto-arrange wins on this tab's next page);
  the placed rows go through `useKept(…, shareEqual)`, so the page that
  brings the saved value draws nothing. No other page draws where cards
  sit, so nothing else needs revalidating; other members see a move on
  their next page, as before. **Numbers:** live as a throwaway Root (4
  people and a cat, prod builds, main → 87.3, 6 drops each, twice): the
  drop's action reply 27.8 KB (the whole page, `x-action-revalidated: 1`)
  → 71 bytes, median time to the reply's end 663–701 → 179–188 ms; cards
  drawn 1 → 1 and layouts 1 → 1 either way, now at the drop instead of
  after the round trip. On the 77-person fixture (4× CPU): main's replayed
  revalidation 1 card + 1 layout, 87.3's drop 1 card + 1 layout, the later
  page with the drop saved 1 + 1 → 0 + 0, no long tasks either way.
  **Verified** on live, main beside the change: the dropped card stayed
  where it was dropped, and a second tab, Back from the account page and
  a reload all showed it there; a second drop then Back straight away
  held too; an unreachable drop (action request aborted) put Dad back with
  "Couldn't reach the server"; the cat's drop saved and held through a
  reload; Auto-arrange after a fresh drop reset every card and the cat,
  and Back afterwards showed them arranged; no console errors but the
  aborted request's own. A refused drop takes the same path as an
  unreachable one (the undo is unit-tested; not staged live). The
  throwaway account, tree and sessions were deleted.

- **Step 88.2 — Report a problem** (the second of Step 88, the person
  sheet's redesign; two migrations). **Aalim asked for:** flags off the
  comments board, as a flag button that opens a dialog to say what's
  wrong; the claim dispute (under Manage) as a choice in that dialog, only
  where it applies; and **a report seen only by whoever can fix it**: the
  entry's editors and the Roots, on the sheet and in the Root console, its
  reporter seeing their own, the open count on the card and the sheet by
  the same rule. So a report is a row of its own, `entry_reports`
  (`20260929160000_entry_reports`), readable by its reporter and, for a
  problem with the details, whoever `can_edit_person`, or, for a dispute
  (`claim_id` set), the Roots of the entry's home tree; written only by
  `report_entry`, `resolve_entry_report` and `decide_claim_dispute`,
  withdrawn (deleted) by its reporter while open. The flag sits at the end
  of the tag row beside **Edit** / **Suggest** (`TagButton`, icon only,
  "Report a problem"); `report-dialog.tsx` is "Its details / Who claimed
  it" (the choice only for whoever added a claimed entry) and "What's
  wrong?". The sheet lists the open reports the viewer may see
  (`entry-reports.tsx`, read only when the card counts some): **Mark
  resolved** for an editor, **Uphold / Reverse claim** for a home Root,
  **Withdraw** for the reporter. The Root console's **Disputed Claims**
  became **Reports** (both kinds, `admin-reports.tsx`, same card), under
  "Requests & Reports"; its stats' "Open flags" and "Disputes" are one
  "Reports", and the header's queue counts open reports on the tree's own
  entries. The claim notice's **Dispute this claim** opens the same
  dialog on "Who claimed it". **My calls, not asked:** a dispute no longer
  changes the claim: it stays `approved` while its report is open, so
  nobody outside the rule learns of it from the claim (the "Ownership
  disputed" badge and Manage's dispute link and line are gone); the
  claimant is still told it was disputed, as before, but can't read it.
  A report is told to the entry's owner, its home tree's Roots and the
  Branches tending it (as a suggested change is asked, Step 68), no longer
  to the creator of an entry someone has claimed. The flag shows to
  whoever can't edit the entry, or may dispute its claim. "What's wrong?"
  is needed for a dispute too (its reason was optional), up to 1,000
  characters. Resolved reports leave the sheet and the console (the
  reporter is told); there's no Reopen. A report raised on another tree
  that shows the entry goes to the home tree's fixers, not that tree's
  Roots. A reporter whose account goes leaves the report for the fixers
  (`created_by` set null). A placeholder merged away takes its reports
  along (`claim_person`, `merge_invited_entry`, one line each); a report
  doesn't stop an entry being deleted. The export carries `entry_reports`.
  `20260929170000_flags_leave_the_comments`, applied once this build was
  live, moves any board flag and any still-disputed claim across, keeps
  the one old rejected claim's reason as a resolved dispute, and drops
  `entry_comments.is_flag` / `status` / `resolved_*`, `claims.
  dispute_reason`, `dispute_claim`, `resolve_claim` and
  `resolve_entry_flag`; `entry_comment_notify` tells of comments only.
  `claims_status_check` still allows `disputed`, unused. **Verified** in a
  rolled-back rehearsal on live (both migrations, six throwaways on two
  trees: who reads what, every refusal, reverse and merge) and end to end
  on live as a seeded Root, the entry's creator, its claimant and an
  unrelated Leaf, headless Chrome on the worktree's dev server: the
  claimant reported a wrong birth year on an entry she can't edit (no
  choice shown; "Report sent."), the creator disputed her claim ("Sent to
  a Root."). The creator, an editor of the first entry, saw its report
  with **Mark resolved**; the claimant saw hers with **Withdraw** and
  nothing of the dispute on her own entry; the unrelated Leaf saw no
  badge, count or report, nor any in the page's RSC payload. Through
  PostgREST with each member's own token: the Root and creator read both,
  the claimant one, the unrelated Leaf none; an insert or update answered
  403 `42501`. The Root's console listed both, the header said "2 need
  attention"; **Uphold claim** kept the claim `approved`, **Mark
  resolved** told the reporter. The notice's dispute opened on "Who
  claimed it" and its button went once sent. A 390px phone wraps the tag
  row with the flag right-aligned, a 44px target. Known: a spotlight's
  leaves show no count (as with flags); the dialog offers "Who claimed it"
  while the creator's own dispute is open, and the server says "You've
  already disputed this claim." The throwaway accounts, tree and sessions
  were deleted. 1,322 unit tests, `tsc`, `eslint` and `next build` clean.

- **Step 87.2 — Search keystrokes and closed panels** (the second of Step
  87, audit Phase 3, finding C4; no migration). **Aalim asked for:**
  search results capped at 6, like `PersonPicker`, with a count of the
  rest. So the filter reaches the canvas's dimming, Upcoming and the
  results list through `useDeferredValue` (`shownFilter` in
  `family-tree.tsx` and `tree-search.tsx`): the box shows each key at once
  and the rest catches up, skipping keys typed meanwhile. The list is a
  memoized `SearchResults` with at most 6 rows and "and 71 more" under
  them, each row plain truncated lines instead of two or three `FitText`
  measurements. `PersonPanel` and `PetPanel` are `React.memo`, and
  `FamilyTree` hands them kept props: `useCallback` handlers, memoized
  companions, suggestions and connection prompt, module constants for
  empty lists, `peopleOptions` through `useKept(…, shareEqual)` and
  `shownIds` through the new `keepSet` (`lib/canvas-nodes.ts`), so a card
  drop's new row doesn't draw either sheet. The companion's edit form
  (`PetEditForm`, with its `useForm`, photo draft and save action) mounts
  only while it's open. **My calls, not asked:** the 6 rows stay in the
  12rem scroll box (without it the card reached 697px on a 390×844 phone,
  covering the canvas it dims); "N matches" stays above the list; a
  cancelled or saved edit starts afresh from the companion next time.
  **Numbers** (77-person fixture, prod build, 4× CPU, main → 87.2, five
  runs): keyboard event to next paint, median 64 → 24 ms, worst 88 → 40;
  five keys at once 275 → 192 ms; "a" (everyone matches) 77 rows and 171
  `FitText`s → 6 rows, none; PersonPanel/PetPanel renders on load 4 → 1
  and 4 → 1 (pet form 4 → 0); while closed, 11 each per search, 11 per
  10-step drag, 1 per save → 0; beside an open person, 5 per search and 1
  per save → 0; opening a companion runs no form (was 2). Card renders per
  key are unchanged (only cards whose dimming flips, since 87.1), now in
  the deferred render. **Verified** on live as a throwaway Root with 8
  people and a dog, main beside the change: "z" showed 6 of 7 with "and 1
  more"; picking Zara opened her details with the connection prompt; a
  real drop drew neither closed sheet (main: 11 each); the dog's sheet
  opened with no form, saved a new name and back, focus returned to Edit
  companion, Cancel dropped a half-typed name; no console errors. Known:
  the first key of a search still costs ~40 ms (the results block and the
  first dimming land before the frame); cards can't be dragged while a
  person's line is pulled out, and a drop closes the companion sheet, both
  as before. The throwaway account, tree and sessions were deleted.

- **Step 88.1 — A person's details: Edit on the tag row, Family and
  Companions fold** (the first of Step 88, the person sheet's redesign;
  ad-hoc, Aalim 2026-09-29; no migration). **Aalim asked for:** no "No
  maiden name yet." box; Family and Companions, low priority, fold away
  and start closed; the header's **Edit entry** becomes **Edit**,
  right-aligned on the account type tag's row and the tag's size. So the
  dashed box is gone for everyone. **Edit** sits at the end of the badges'
  row (Deceased, Claimed, the account type…), a `Badge` drawn as a link
  (`TagLink` in `person-panel.tsx`), 20px like the tag, with a 44px target
  on a touch screen. Family and Companions go through `SheetFold`
  (`components/tree/sheet-fold.tsx`): the heading is the button, with a
  count beside it ("Family 4"), and a chevron. **My calls, not asked:**
  **Fill in** (was "Fill in what's missing") and **Suggest** (was "Suggest
  a change") take the same place as **Edit** when they're what applies,
  their full names as tooltips; a section opened stays open as the reader
  moves from person to person, until the details close; folded, a
  section's content stays mounted and hidden, so a marriage date half
  typed survives folding it; the sections stay where they were in the
  sheet. **Verified** on live as a throwaway Root and Leaf on a seeded tree
  (a spouse with a maiden name, two parents, one dead and unclaimed, a
  child who is the Leaf's own entry, a dog), in the pane on desktop and
  the `mobile` preset. The Root saw **Edit** on every entry, level with the
  Root, Leaf and Deceased tags and flush right (the same 20px height,
  12px type, border and rounding as the tag). The Leaf saw **Fill in** and
  **Suggest** on the dead parent and only **Suggest** on the Root's own
  entry, each linking to the right page. Both sections started closed with
  their content hidden, opened, kept "12" typed in a marriage date across
  a fold, stayed open onto another person and were closed again after the
  details closed and reopened. On a phone each target is 44px tall. No
  maiden-name box anywhere. The throwaway accounts, tree and sessions
  were deleted after. 1,312 unit tests, `tsc`, `eslint` and `next build`
  clean.

- **Step 89 — Share the week from Upcoming, and a scope for a family-chat
  bot** (ad-hoc; no migration). After the WhatsApp group bot research
  (Step 17 backlog: Meta's Groups API makes only the business's own
  groups, 8 people at most, for verified Official Business Accounts, and
  Ancestree isn't a registered business), Aalim asked for "a share button
  and … a product scope for the bot route that can work for imessage,
  whatsapp, and slack". **89.1:** Upcoming's **Share** menu (see
  **Upcoming**): WhatsApp, Messages, Copy, and the share sheet where the
  device has one, sending the week ahead as names and occasion only (his
  answer: no ages, no maiden names, no tree link). The family link's
  WhatsApp button now builds its link with the same `whatsappHref`.
  Checked on a throwaway fixture page (since deleted): the links carry the
  text, More… hands it to `navigator.share`, nothing past the week and no
  maiden name goes out, and the menu fits at 375px. The pane refuses
  clipboard writes, so Copy there said "Couldn't copy" (it doesn't say
  "the link" any more). **89.2:** the bot scope lives on the Notion epic,
  not here: nothing of it is built.
- **Step 87.1 — Stable canvas across saves** (efficiency audit Phase 3,
  C2 and C8; no migration). Every save's revalidation handed `FamilyTree`
  every row afresh and every photo newly signed, so the layout ran again,
  the canvas was re-seeded with unmeasured nodes (React Flow hides those,
  and their lines), and every avatar fell back to initials and downloaded
  again. Now: (1) `FamilyTree` passes what it's given through
  `shareEqual` (`lib/structural-share.ts`) against what it had, so every
  row, list and prop equal to last time's is the very same object (rows
  matched by id); (2) each photo's address goes through `keptPhotoUrl`
  (`lib/signed-url.ts`) first, which keeps the tab's first signed address
  per photo, keyed on the address without its query (share links carry no
  path), until it has under 10 minutes left, read from the token's `exp`;
  (3) a re-seed (`keepNodes`, `lib/canvas-nodes.ts`) keeps the canvas's own
  node wherever nothing about the card changed and otherwise carries its
  `measured` over, and lines go through `shareEqual`; (4) the per-card
  `data` keeps last time's object where its flags came out the same
  (`keepEntries`, via `useKept`), and `PersonNode` / `PetNode` compare only
  `data`, so a card the layout merely moves isn't drawn again; (5)
  `buildGraph` split into `buildPeopleGraph` and `withPets`, so switching
  companions doesn't lay the people out again; (6) the canvas starts from
  the locked nodes, so a Leaf's or Branch's isn't seeded twice. **Numbers**
  (77-person fixture, 41 photos, production builds, headless, 4× CPU, main
  → this): a save with nothing changed went from 231 card renders, all 77
  cards hidden, 0 lines, all 77 cards on initials and 82 photo downloads to
  0 renders, 0 hidden, all 76 lines, 0 initials, 0 downloads and 0
  layouts; a save renaming one person, 1 render; one adding a child, 1
  render (only the new card waits to be measured); first load 154 → 77
  renders, and 230 → 77 for a Leaf; a drag frame 1.1 → 0 renders; the
  Pets switch 1 → 0 layouts; first paint unchanged (median 853 vs 860 ms
  over 12 loads). On live as a throwaway Root (8 people, 6 photos): a
  dropped card redrew 1 card instead of 25, kept all 8 cards and 7 lines
  on screen and fetched no photo again (main: 8 hidden, 0 lines, 8 on
  initials, 6 downloads); leaving for the account page and coming back
  fetched no photo again (main: 6). Search keystrokes are 87.2's, the drop's
  revalidation 87.3's.

- **Step 77.7 — Cache Components spike: left off** (efficiency audit S9
  and N4, the last of Step 77; no migration, nothing shipped). Tried
  `cacheComponents: true` on Next 16.3.2 against production builds, the
  branch's beside main's, as a throwaway Root on live. **Getting it to
  build** took four things: the footer (it reads the path) in its own
  `<Suspense>`; `instant = false` on `/`, `/join`, `/request-invite` and
  `/auth/confirm`, which wait on who's signed in before they draw
  anything; and the link-preview image's fonts in a `"use cache"` helper
  (`cacheLife("max")`), or it turned dynamic. Sixteen pages then
  prerender a shell (the header bar and the page's `loading.tsx`) and
  stream the rest. **What it gained:** almost nothing. Full loads served
  their first byte 5–6ms sooner locally (4 against 10–13ms), with first
  paint and the page's content unchanged: since Step 61 main already
  streams the same skeleton at once. On Vercel the shell would come from the
  edge rather than the function, perhaps tens of milliseconds, only on a
  full load, not measured. Back to the canvas from another page was no
  faster: 40ms on both with 3 people; with 75, 55–78ms on main against
  70–81ms, and 190–240ms against 213–277ms with the CPU slowed 4×.
  Main's router cache and Step 77.3's canvas memory already make Back
  cheap, and showing a kept canvas again re-measures every card.
  **What it broke**, since Next now keeps up to three pages hidden
  (React `<Activity>`) rather than unmounting them: (1) the canvas camera
  came back at the origin and 1×, because React Flow sets up its pan and
  zoom afresh when the page is shown again (fixed in the spike by putting
  the view back from `FamilyTree` after it); (2) **a fresh link** to a kept
  page, not just Back, brought back its state: the edit page showed a first
  name typed and never saved instead of the saved one, *Add a relative*
  its last draft, and account settings the *Delete your account?* dialog
  still open; (3) Back and Forward brought back open dialogs and the
  Search & filters card. Saved data was fresh after Back either way (the
  canvas, the sheet and the edit form all showed the new name). **To ship
  it later:** key every page's content on `useRouter().bfcacheId` (a small
  client wrapper, since a root `template.tsx` would reset on Back too), so
  that only Back and Forward bring a page back; close each dialog, sheet,
  menu and select on hide (a `useLayoutEffect` cleanup that closes its
  *own* state: the uncontrolled ones in `components/ui/`, `ConfirmDialog`,
  and about ten opened from a parent's state, which must never call the
  parent's `onOpenChange` from a cleanup that also runs on unmount); keep
  the camera fix; then run the same checks again. Worth it only if the
  shells measure well on Vercel. The spike's diff and scripts were not
  kept; the build fixes above are all of it apart from the camera.

- **Step 85 — Two fixes: the invite form's hydration warning, the header
  on a phone** (ad-hoc, Aalim 2026-09-29; no migration; both seen while
  testing Steps 80 to 84). **85.1, the invite form:** every member's
  account settings logged a React hydration warning, from **Invite a
  Relative**: its rows took their ids from a count kept by the module
  (`let nextKey`), which on the server ran on with every page drawn
  (`row-10-first`) and in the browser began again (`row-0-first`), so the
  two never matched and React gave up patching the labels to their fields.
  The count is now the form's own, from its first row, behind a `useId`
  that keeps two forms on a page apart (`components/direct-invite-form.tsx`).
  **Verified** in headless Chrome as a throwaway Root: three loads of
  account settings, the ids the server sent the same as the ids drawn each
  time, no hydration warning and no console error there, in the Root
  console or on the trees page; no id twice on any of them; rows added and
  removed keep ids of their own and what was typed in them; a label still
  focuses its field; nothing was sent. The throwaway rows and accounts were
  deleted after. 1,280 unit tests, `tsc`, `eslint` and `next build` clean.
  **85.2, the header** (landed after Step 86, so the entry sits above it):
  on a phone the signed-in header wrapped onto three rows, 118px, whatever
  the tree's name: its buttons could wrap, and the grid gave the centre
  column, the tree switcher, its full width first. The buttons never wrap
  now and a long name ends in "…". On a narrow bar, a phone's or one beside
  a docked sheet below 64rem, the header goes compact (`header-compact`, a
  variant in `app/globals.css`): the mark without the wordmark, **tree**,
  **connections** and **account** as their symbols with the words kept as
  their names, the connections and unread counts on the buttons' corners,
  and the tree's name in what's left. The mark and the switcher answer to a
  44px square on a touch screen like the buttons, and the Root console count
  is at least 36px wide so its square stops short of **account**'s. Below
  44rem (was `sm`) a details sheet starts under the header, as on a phone:
  beside it the header had less room than the narrowest phone's. **My
  calls, not asked:** symbols rather than words on a narrow bar (the fullest
  header, two trees, open connections, a Root console count and unread,
  can't fit its words on any phone); the wordmark gone on every phone,
  signed out too, so the bar doesn't change as its buttons stream in; the
  44rem. **Verified:** a throwaway page of every header state swept headless
  from 320 to 1,400px, touch and mouse, sheet open or not: one 57px row
  everywhere, nothing past the bar or over another control, no sideways
  scroll, every target a whole 44px, except the fullest header at 320–340px
  (704–724px beside a sheet), where the name is down to its ▾ and the
  mark's and switcher's targets are 32–42px: five 44px buttons, the switcher
  and the mark need 296px of the 288 there. Then as throwaway members on
  live, a Root of a long-named tree and a Leaf of a short one: account
  settings, `/onboarding` and the canvas with a person's sheet open, at 320,
  375, 390 and 768px (700, 1,024 and 1,280 with the sheet), and signed out:
  one row each time, and the switcher switched trees at 320px. The same
  settings page on main: 118px; here: 57px. Throwaway rows and accounts
  deleted after. 1,289 unit tests, `tsc`, `eslint` and `next build` clean.

- **Step 86 — Added by / invited by at the foot of a person's details**
  (ad-hoc, Aalim 2026-09-29; no migration). The details sheet ends with a
  footer of tags for how the person came onto the tree: **Added by** whoever
  made the entry (`people.created_by`) and **Invited by** whoever invited its
  member to *this* tree (`tree_members.invited_by_user_id`, through
  `member_directory`). They're two tags when two people did it (a Root adds
  a cousin, a Branch sends the invite that claims it) and one, **Added and
  invited by …**, when it's the same person; the viewer is "you". A member
  who added their own entry isn't "added by" anyone, so a founder's entry
  has no footer. Names come from the tree's directory, and a creator who
  isn't on it (they left, or the entry was added on another tree) from
  their profile, read only for them; nobody readable, no tag. Members only:
  loaded with `account_type` (`withAccountTypes`), so share links and
  visitors never get it, and a basic card shows none. Pure logic in
  `lib/joined-by.ts` (tested), read in `getTreeGraph`, drawn in
  `components/tree/person-panel.tsx`. **Verified** headless as a throwaway
  Root and Leaf on live (Root → Branch invited by Root → Leaf invited by
  Branch, the Leaf's entry added by the Root): the Root saw "Invited by you"
  on the Branch, "Added by you" + "Invited by Branch" on the Leaf, "Added
  by Branch" on the Branch's aunt and nothing on their own; the Leaf saw
  "Added by Root" + "Invited by Branch" on their own entry. Throwaway rows
  and accounts deleted after. 1,289 unit tests, `tsc`, `eslint` and `next
  build` clean.

- **Step 84 — A Root can invite someone to claim an entry their tree
  shows** (ad-hoc, Aalim 2026-09-29; migration
  `20260929140000_claim_invites_from_the_tree_they_join`, applied before
  the code; two new functions, nothing existing changed). A claim invite
  could be sent only by someone who may edit the entry on its home tree
  (Step 22.1), so a Root of a tree that shows it as a basic card couldn't
  send one, and the person it is had to join and find themselves by name
  (Step 83). **The rule** is now judged on the tree the newcomer joins,
  which must show the entry (`private.can_invite_to_claim_on`): whoever may
  hand it over on its home tree, as before, into a tree they belong to; or
  a Root of that tree, for any entry on it nobody is behind (the owner
  never moved from whoever created it, no claim stuck, no member's own,
  living). **On the card:** a basic card's sheet offers a Root "Invite …
  to claim this entry" when the rest of it waits on its home tree rather
  than on a member whose own it is (`canInviteToClaimCard`); everyone else
  on the tree sees that an invite is out, as on any card (Step 38). The
  invite names the entry as the card does (`readInvitedEntry` reads
  `tree_people` when the entry itself can't be read), and a refusal says no
  more than "That entry can't be claimed.": why is the home tree's to know.
  **Accepting** is unchanged: `redeem_invite` claims the entry on the
  invite's tree, which since Step 83 takes a basic card and shows it in
  full from there; whoever added the entry is told in their own tree's
  inbox and can dispute, and whoever brought it over is told. **Aalim's
  answer (asked before it went live):** any unclaimed card from another
  tree, not basic cards only, so the invite doesn't go the moment the home
  tree approves a card. **My call, not asked:** an invite sent from a
  tree's canvas joins that tree (the panel passes it), where it joined the
  entry's home tree; they were the same tree for every entry but one
  carried over that its sender may edit at home. **Verified:** rehearsed
  in a rolled-back transaction on live (22 checks: a Root and a Leaf of
  the new tree on a basic card nobody is behind, a member's own, one of
  someone who has died, one the tree doesn't show, a carried card shown in
  full; the home tree's Root and Leaf as before, and into a tree they
  aren't on; an invite refused to another account, accepted by its own,
  the entry his, his card in full, both notices), the home tree's reads the
  same before and after, both bodies md5-equal to the file; applied by a
  transaction that checked them before it committed, the recorded
  statements md5-equal to the file, the types regenerated byte-identical
  to the ones written by hand. Then in headless Chrome as throwaway
  members of an invented family: a member's own basic card offered no
  invite and one nobody is behind did; the invite sent and delivered, the
  card saying so to its Root with the address and to a Leaf without; a
  new address opened it signed out, accepted, landed on the welcome with
  the entry his and in full; the home tree's Root approved another card
  and its invite, refused before, went. Every row and account deleted
  after. 1,280 unit tests (14 new), `tsc`, `eslint` and `next build` clean.

- **Step 83 — Carried lines: claim a basic card, a reminder, and asks that
  lapse** (ad-hoc, Aalim 2026-09-29; migration
  `20260929120000_carried_line_gaps`, applied before the code; Step 80's
  three known gaps). **Claiming a basic card:** someone new to a tree
  couldn't say a basic card was them until it was approved, so they'd add
  themselves again. Now the onboarding search and the canvas's "Is one of
  these you?" find a basic card by what it shows (`search_self_candidates`,
  `person_claim_candidates`: never a maiden name, no dates, and of its
  parents only those this tree draws), "This is me" takes a name that
  matches it (`private.basic_candidate_score`), and the basic card's sheet
  offers "This is me — claim it". Whoever added the entry is told, in an
  inbox they have (their own tree's, when they aren't on this one), and
  can dispute; claiming it on a tree is its owner's yes to showing it there
  in full, and whoever brought it over is told
  (`private.claimed_shows_in_full`). A claim a Root reverses makes the card
  basic again and asks afresh (`private.claim_undone_shows_basic`).
  **A reminder:** an ask unanswered after 7 days gets one reminder, the
  ask's own email with "Reminder:" before its subject. **Lapsing:** an ask
  lapses 30 days after it was made, as a relay ask does (Step 41.5). The
  row keeps `asked`, so the card stays basic and a yes is still taken;
  `tree_people`, `placement_asks` and `tree_carried` call it `lapsed`
  (`private.placement_approval_now`). The card says "… hasn't answered.",
  Asked of You lists it under **Earlier** (was "Answered") as "Basic
  details · no answer", and the Root who asked is told once
  (`placements_lapsed`, "No answer in 30 days about …") and can **Ask
  again** from Who This Tree Shows (`ask_placements_again`, Roots only:
  another 30 days, with the notices and the email of a first ask; a
  decline is an answer and isn't asked again). Both emails now say when
  the ask lapses. **No scheduler** (pg_cron was declined in Step 41.5): the
  tree's own page sets the sending off once it has answered (`after()`),
  when `tree_people.nudge_due` says something is owed, and
  `run_placement_nudges` (the server's key only) hands each reminder and
  each word of a lapse out once, however many pages ask at once. A tree
  nobody opens sends nothing until someone does. `place_people`'s notices
  moved, unchanged, to `private.ask_about_placements`, which asking again
  shares. **Aalim's answers (asked before it went live):** a claimed basic
  card is theirs at once, not held for the home tree's yes; one reminder
  after 7 days, with no scheduler. **My calls, not asked:** 30 days, by
  Step 41.5's precedent; a lapsed ask can still be answered; only a lapsed
  ask can be asked again; a reversed claim goes back to `asked`, not to
  what it was before the claim, which isn't kept. **Verified:** rehearsed
  in a rolled-back transaction on live with a throwaway family across two
  trees (44 checks: what a newcomer's search finds and doesn't, both
  claims, a dispute and its reversal, 8 and 31 days on, who is emailed,
  that nobody is sent anything twice, every refusal), the home tree's
  reads the same before and after, all 18 function bodies md5-equal to the
  file; applied by the same statements (eight functions patched in place
  from their live bodies, so the recorded row differs from the file on
  purpose), the transaction checking its own bodies and views before it
  committed, and the types regenerated byte-identical to the ones written
  by hand. Then end to end in headless Chrome as six throwaway members of
  an invented family, asks aged in the database in between: 5 brought
  over; a newcomer with no entry sent to onboarding, offered her basic
  card by name and place, claimed it and landed on her welcome, her entry
  in full; another who'd added himself offered his on the canvas and on
  the card's sheet, merged into it, one card left; 8 days on, opening the
  tree sent 4 reminders, all delivered, and opening it again sent none; 31
  days on, the card, the Root's list ("Basic · no answer"), the notice
  and Asked of You ("Earlier (3)") all said so; Ask again sent the email
  again and the member approved. Run again after rebasing onto Steps 77.6
  and 82, as a second throwaway family: the carry, both claims, the lapse
  and asking again, the same. Every row and account deleted after. 1,266
  unit tests (13 new), `tsc`, `eslint` and `next build` clean.

- **Step 82 — A replaced photo's old file goes** (ad-hoc; no migration; the
  follow-up Step 77.5 left: verifying it, three photo edits on one companion
  left three files under `{tree}/pets/{pet}/`. It predates 77.5: the photo
  actions only ever swapped `photo_path`). Live had 14 files in `photos`, 4
  of them replaced photos nothing shows. **Now** each writer of `photo_path`
  reads what it held before the write (`updatePerson` in the read it already
  made; `setPersonPhoto`, `setPetPhoto` and `updatePet` with a new photo in
  one small read) and, once the write has gone through, hands it to
  `lib/photo-cleanup.server.ts`, which removes the file after the response
  (`after`), with the service role, only when it lies in that entry's or
  companion's own folder (`photosLeftBehind`: all the bucket's delete
  policies read of a path, so nothing the saver couldn't remove themselves;
  a path planted from another folder is never followed) and nothing points
  at it: no entry or companion (a claim merge moves files between folders),
  and no Branch's edit a Root can still undo, since the undo puts the old
  photo back from `entry_revisions.before` (kept until that undo is
  pressed). When that can't be read, or storage refuses, the file stays, as
  before; the save has already answered either way. Two saves of one entry's
  photo at the same moment can still leave a file behind, never remove one
  that's shown. **Also:** a Root's **Undo this change** removes whichever of
  the edit's two photos the entry no longer shows (`removeUndonePhotos`: the
  Branch's, or the old one once only that undo could have brought it back),
  and "This is me" on an entry with a photo of its own removes the
  placeholder's, which was left in a folder nobody can read; one that was to
  move into the claimed entry stays, moved or not. Filling in blanks only
  adds a photo where there's none; `deletePerson` and `removePet` are
  unchanged. The 4 files the old code had left on live were removed at
  Aalim's go, once checked again that nothing pointed at them: the bucket
  now holds 10, each a photo an entry or companion shows. **Verified:** in
  headless Chrome on live as throwaway members of a throwaway tree (a Root,
  a Branch, two Leaves with placeholders), against a production build,
  reading the bucket back after each press: an entry's photo replaced twice
  left one file, the one it shows; three photo edits on a companion left one
  — on the code before this step, three; a Branch's new photo on a Root's
  entry left both files, the edit kept for the undo, and the Root's Undo
  brought the old one back and removed the Branch's; "This is me" on an
  entry with its own photo removed the placeholder's, and on one without
  moved it in and removed nothing; a file another entry pointed at stayed,
  and so did one planted from another entry's folder; a new companion and a
  new relative kept their photos. Each press made the one save it made
  before; no console or server errors. `storage.objects` agreed. Rebased
  onto Step 77.6 (which split the entry's actions into their own file), the
  whole run again on a fresh build: all 40 checks passed. The throwaway
  users, trees, rows and files were deleted after each run, leaving the
  bucket as it was. 1253 tests pass (18 new); tsc, lint and `next build` are
  clean.

- **Step 77.6 — Efficiency audit, phase 4: the tidy** (ad-hoc; no
  migration; the audit's findings R6–R10, its dead code and its file
  seams; the sixth of seven parts). Nothing a member sees changes but two
  pages' spacing. **Revalidation (R6):** every write now goes through
  `revalidateTreePages`; the last paths named by hand (claim, dispute,
  clearing notifications, the relatives-can-ask switch, deleting an
  account) and the one `refresh()` (an invite for another address) are
  gone. **One walk (R7):** `lib/graph-walk.ts` is the walk along a tree's
  lines that the bloodline, a branch, a person's own line, "Only
  descendants of" and the canvas's spotlight each wrote themselves.
  **The Root console (R8):** its twelve pieces that sat at the top of
  `components/` moved into `components/admin/`; its sections are listed
  once (`lib/admin-sections.ts`), and the side nav, each group and whether
  a section shows all come from the list; the Needs attention card maps
  the queue's sections. `RowCard` and `RowList` are the bordered rows and
  their "No …" line across the console, the notifications, an entry's
  suggestions and comments, a companion's comments and the connection
  prompts, and `CandidateRow` the one close-match row in the three places
  a name's matches are offered. **Page chrome (R10):** `PageColumn` and
  `CenteredPage` draw every page's shell and its skeleton's, so the
  connection review and privacy pages take the others' spacing; the header
  and a form's floating buttons share `bar-chrome`; the person and pet
  sheets' width classes, which lost to the sheet's own, are gone. **Dead
  code:** `requireTreeRoot`, `siblingPairs`, `imageSize`, `isBloodline`,
  `resolveConnectionSuggestion`, `setDocumentShared` (never had a way to
  press it), two props nobody passed, a Step 9 flag nothing read,
  create-next-app's images and the places backfill that has run. The
  bare-invite card stays until its last link lapses (9 Oct). **Files:**
  `app/actions/people.ts` split into the entry's, a connection's and a
  document's actions; `family-tree.tsx` gave its lines, lanes, graph,
  phone check and folded card their own files (2,841 → 2,209 lines; its
  hooks wait for Phase 3); `person-panel.tsx` its family and companions
  sections (1,216 → 973); `lib/tree-layout.ts` its measures, lines'
  geometry and lanes (1,627 → 1,182); the add-a-relative form its schema,
  now tested; the account page its settings loading (652 → 534).
  **Verified:** the new code against main (`f3413d0`) side by side in dev,
  as seven throwaway members of two throwaway trees and a signed-out
  visitor: 50 page loads' data identical but for the header's class list
  and the review page's spacing; 25 screens photographed on both — the
  Root console's lists, requests with a close match, the side nav,
  settings with a relative's ask, the canvas and a spotlight, a person's
  sheet, comment threads, forms on a phone — pixel for pixel the same but
  for the two pages meant to move and a clock that had ticked; the sheet
  293 px on a phone and 384 px wider, as before. On the new code: the side
  nav opens each group at its section; the lines are drawn and a clicked
  one lights its run; the spouse row edits its dates; a phone can't drag a
  card; the add form refuses a bad address; documents list; a sent invite
  resends. No console errors. The throwaway users, trees and rows were
  deleted after. 1235 tests pass (16 new, 2 gone with `isBloodline`);
  tsc, lint and `next build` are clean.


- **Step 80 — Carry a family line to another tree: all descendants of,
  basic cards, approvals** (ad-hoc, Aalim 2026-09-29; migration
  `20260929090000_carry_a_family_line`, applied before the code). A member
  founding a tree for the side of the family that isn't on one brought
  relatives across one at a time, a member's own entry wasn't drawn until
  they'd said yes to a notice nobody emailed them about, and anyone else's
  entry came over whole with nobody asked. **Pick a line:** the founder's
  family step and the Root console's **Who This Tree Shows** share one
  picker (`components/carry-picker.tsx`): **All descendants of** a person,
  **And their partners** ticked (whoever they married or had a child with;
  `lib/carry.ts#lineOf`, a generation at a time, never climbing, sibling
  lines not followed), each name untickable, or anyone one by one by name.
  Under each name is what bringing them asks (`placement_preview`): **In
  full**, **Basic until they approve**, **Basic until a Root or Branch
  approves**. **Everyone arrives at once:** `place_people` puts each on the
  tree as `active`, with `approval` `none` for the Root's own entry and any
  entry they may already edit on its home tree, and `asked` for the rest,
  which show as **basic cards**: first or preferred name, last name, place
  of birth, their lines, and "Basic details" where the years would be.
  **The database keeps the rest back:** `tree_placements.detail` (generated
  from `approval`) is `basic` while asked or declined;
  `private.can_see_person`, the photo and document rules, comments,
  suggestions, "This is me" and the onboarding search all ask for a full
  placement; `tree_people` and `tree_edges` are now `union all` views whose
  second half (`private.basic_tree_people`, `private.basic_tree_edges`,
  read as their owner, checking who may look) carries a basic card's name
  and place and nothing else, and a line's kind and whether a marriage
  ended but its dates only on the tree it was drawn on. Even the Root who
  brought them sees the basic card there. **Who is asked:** a member about
  their own entry (notice `placement_requested`, and an email); for
  nobody's own entry, whoever may edit it on its home tree: its Roots, the
  Branches who tend it, the Branch or Leaf who added it (one notice
  `placements_requested` and one email each for the batch,
  `lib/placement-alerts.server.ts`, `lib/emails/placement-asked.ts`; a
  call's emails go in one Resend batch, Step 77.5's `sendEmails`).
  **Answering:** **Asked of You**, first on `/account` settings
  (`components/placement-asks.tsx`): Approve or Decline each, or **Approve
  all** a tree asked for; whoever answers first answers for everyone, and
  whoever brought them is told once for the call. A no leaves the basic
  card; under **Answered** either answer can be changed, so a yes can be
  taken back (`answer_placements`; `respond_to_placement` kept for the
  notice's buttons). Accepting an invite to the tree, or moving the entry's
  home there, is a yes. **What changed for Step 25:** the person shown can
  no longer delete their own placement (their name and place need nobody's
  yes; what they take back is the rest); `delete_tree` hands entries only
  to a tree that shows them in full; a line to a basic card is changed by
  whoever drew it or a Root of the tree it was drawn on. **Aalim's answers
  (asked first):** nobody's own entries show as basic cards at once too; a
  decline keeps the basic card; an entry the founder may already edit comes
  over in full. **My calls, not asked:** the member who added an entry
  nobody has claimed is asked along with the Roots and Branches (they may
  edit it, and are who a parent adding their children is); partners
  include the other parent of a child when they never married; marriage
  dates are kept back with the rest but "divorced" is not, so a former
  partner isn't drawn as a current one; a basic card says "Basic details",
  never "Living"; nobody is asked twice about the same card; a basic card
  on another tree can't be carried on from there. **Known gaps:** a
  newcomer to the new tree can't claim a basic card as themselves until
  it's approved (they'd add a duplicate); nothing reminds someone who
  hasn't answered; the asks don't lapse. **Verified:** the migration
  rehearsed twice in rolled-back transactions on live with a throwaway
  family across two trees (45 checks: what each of five members reads
  before and after, every refusal, both answers, taking one back, an
  invite accepted, a home moved), the home tree's reads byte-identical
  before and after, all 26 function bodies md5-equal to the file; then
  applied, and the same 26 plus both views and three policies compared
  again. The recorded row's statements differ from the file on purpose:
  the eight big functions it re-creates were patched in place from their
  live bodies rather than retyped. End to end in headless Chrome as five
  throwaway members of an invented family (first run, the picker, 6
  brought over, basic cards as a member of the new tree only sees them,
  four emails delivered to Resend's test inbox, approve all, a Branch
  taking one back and giving it again, the Root console's count, removal),
  then every row and account deleted. Run again after rebasing onto Step
  77.5, as a second throwaway family: 6 brought over, 5 basic cards to
  the founder and to a member of the new tree alone, the four emails
  delivered from one batch, both approvals, 7 of 7 in full, no console
  errors; live's counts the same before and after. 1,221 unit tests (25
  new), `tsc`, `eslint` and `next build` clean. Screenshots of the flow are in Notion
  (Ancestree Hub → "Start a tree for the other side of the family").

- **Step 77.5 — Efficiency audit, phase 4: one save per press, and invites
  sent together** (ad-hoc; no migration; the audit's finding S8; the fifth
  of seven parts). **Saves:** an edit with a new photo is one write, the
  photo in the same update as the fields (`updatePerson` / `updatePet` take
  it), so someone else's edit is one notice and one undo, not two. A new
  parent with their partner as the other parent is one call
  (`connectExistingPeople` takes the co-parents) and one redraw. Adding a
  relative looks for implied connections, adds the people and their lines
  and sends the invite asked for, in one call (`addRelative`; it was
  detect, add, photo and invite, each but the first redrawing the page); a
  photo follows in a second call, which does the only redraw. The first
  run's quick relative uses it too. **Invites:** up to 20 at once — direct,
  founder, and a claim invite's one — are made in one insert, emailed in
  one Resend batch and recorded in Sent Invites in one insert
  (`lib/invite-mint.server.ts`): three round trips however many, where each
  took three in turn. A batch Resend refuses over one address goes again
  one by one, so each answers for itself; one Resend didn't answer isn't
  sent again, as it may have gone; asked too fast, it waits once and asks
  again. People are told "the address was refused" or nothing, never
  Resend's own words, which can repeat the address; the logs keep only its
  status. The alerts to Roots and reviewers go as one batch too.
  **Approvals:** a request is answered before its invite is made, and put
  back if the invite can't be, so a second press or a second Root can't
  send another. **Verified:** in headless Chrome on live as throwaway
  members of two throwaway trees, against a production build, counting the
  server actions each press made: an entry's edit with a new photo made one
  and one notice ("…was updated: name, photo."); a companion's edit with a
  photo, one save; a relative added with a photo and an invite, the add and
  its photo, the invite bound to its address and recorded as emailed; a new
  parent with their partner, one action and both lines; three direct
  invites, one action (0.6–0.8 s), made in one insert and all emailed; two
  founder invites, one action; a claim invite from an entry's card, one
  save, recorded under her name; a resend from Sent Invites went. Two Roots
  pressing Approve at once: one invite, and the other was told "That
  request has already been reviewed." — on the code before this step, the
  same two presses minted two links and sent two emails, one link live but
  missing from Sent Invites, and neither Root was told. Against Resend
  itself: two emails in one request; three with an address it refuses,
  refused whole, then sent one by one — two sent, one refused. No console
  errors. The throwaway users, trees, photo files and rows were deleted
  after. A replaced photo's old file still stays in the bucket, as it did
  before; left for a follow-up. 1196 tests pass (16 new); tsc, lint and
  `next build` are clean.

- **Step 77.4 — Efficiency audit, phase 4: one copy of each shared piece,
  and the bugs the copies hid** (ad-hoc; no migration; the audit's findings
  R2–R5; the fourth of seven parts). **Photos:** seven forms each uploaded
  a photo their own way; now one does (`lib/photo-upload.ts`, the bucket's
  layout in `lib/photo-path.ts`, the picker's state in `usePhotoDraft`).
  With it: a companion's **Reposition** on the photo it has now saves (it
  was dropped); a picture the picker couldn't remake is stored as the PNG
  or WebP it is, not as a `.jpg`; a photo the entry refused is removed
  rather than left in the bucket; the photo actions take only a path in the
  entry's own folder, a companion's on its own tree; the Supabase client
  loads only when a photo is sent. **Marriage dates:** one set of fields
  for the add-a-relative form, a first run's partner, a new connection and
  a spouse's row on the sheet, stored one way everywhere (a divorce date
  only for a divorce) and read one way by the three actions. **Helpers:**
  one copy each of the limits both sides hold to (the emails and pages
  that name the invite lifetime read it), of when something has lapsed (at
  the database's own boundary: an invite or share link at its expiry
  moment is expired everywhere now), of a short date ("23 Sep 2026", the
  same on the server and in every browser, so the page no longer changes
  as it loads), of plurals (nought reads as plural), of the email check,
  of member names, of copying a link, of an entry's photo address and
  place names, and of the entry-to-form mapping. **Actions:**
  `membershipOf` and `rootOf` answer the membership or why not, never
  neither, so a guard can't hand back a silent success; each action's
  refusals are said through one `friendlyDbError`; and a write that
  row-level security quietly skipped now says so rather than reporting
  success — unlinking a companion, removing one (its photo went too),
  deleting a companion's comment, revoking a share link, deleting an
  invite record. **Verified:** in headless Chrome on live as throwaway
  members of two throwaway trees, against dev and a production build: a
  new photo on an entry landed in its folder as the JPEG the picker made,
  and a new framing alone saved on the same file; a companion's photo
  landed under `pets/` on its tree, and its Reposition alone saved — on the
  live code (`8554ffe`) it didn't; a new companion with a picture the
  picker couldn't read was stored as `.png` / `image/png` — on the live
  code, as `.jpg` / `image/jpeg`; a Leaf's photo filled in her mother's
  unclaimed entry; a relative added with a photo got it; the spouse row
  handed focus to the marriage date, saved a new one and refused a divorce
  before it; a new connection's marriage and a spouse added from the form
  saved their dates (`2011-02-03`, `2005-06-07`, no divorce date); the Root
  console spelled dates "29 Sep 2026" and counted "0 views"; the trees page
  counted entries and members. As a Leaf, row-level security skipped an
  unlink, a revoke and a delete with no error (0 rows) — what the old code
  took for success, rolled back. The live code and this side by side in
  dev, 50 pages loaded as the same seven throwaway members: every page's
  data identical, but for the build's own script chunks. No console errors
  but one the live code shows too (Add a companion resets its form while
  drawing). The throwaway users, trees, photo files and rows were deleted
  after. Rebased onto Steps 79 and 81, the account page's own entry opens
  their circa dates through the same mapping as the edit page. 1180 tests
  pass (30 new); tsc, lint and `next build` are clean.

- **Step 81 — Circa: a rough date of birth or death** (ad-hoc; migration
  `20260929010000_circa_dates`). Aalim: "when inputting DOB and DOD, allow
  for the user to select circa for rough estimates". A **Circa** tick sits
  at the right of each date's label (on a phone too, so the date boxes keep
  their width), and a date marked so reads "c. 1950" wherever it or its
  year shows: the details sheet ("c. 3 May 1950" at any precision), the
  card and its hover ("c. 1950 – c. 1990", "b. c. 1950"), the lifespans in
  search, the person picker, claims, the first run and placements, a
  suggestion's rows ("1999" → "c. 1999") and the welcome line ("born
  c. 1950"). Circa needs the date's year: ticked with none, the date says
  "Add the year, or untick circa." (and stops saying it once either
  happens). A circa birthday stays on Upcoming, with no age. In the
  database, `people.date_of_birth_circa` / `date_of_death_circa` (false by
  default), a check that each has its date, and `people_before_write`
  clearing it whenever its date is emptied, so a writer that knows nothing
  of circa (someone marked as living through a suggestion, an undo) still
  fits. It goes through every writer that lists a person's columns:
  `tree_people` (two trailing columns), `fill_person_blanks` (a date fills
  in with its circa), `suggestion_columns` and `decide_entry_suggestion`
  (a suggestion can make a date circa), `revision_fields` (a Root's undo)
  and `person_edit_notify` (changing it is changing the date), each
  re-created from its latest migration with only those lines changed. The
  add flow sets it on the new rows afterwards, as it does their places, so
  `add_people_with_connections` is untouched; so is `suggest_entry_change`,
  which Step 80's draft also re-creates (its session was told, and put the
  two columns into its own `tree_people`). Left as it was: the onboarding
  "Is this you?" list, whose rows `search_self_candidates` returns without
  them, shows no "c.". **Verified:** rehearsed on live in a rolled-back
  transaction with throwaway members: a circa date saved and the view
  carried it; emptying the date cleared circa, and circa alone didn't stay;
  with the trigger off the check refused it; `fill_person_blanks` filled
  both dates with circa; a Leaf's suggestion made a Root's date circa and
  the Root's accept applied it; marking living someone whose death date was
  circa fitted; the 184 entries were untouched; the six bodies' md5s equal
  the file's, and the view's grants and options were unchanged. Applied
  through the MCP (row renamed from `20260929085534`; its statement's md5
  equals the file's); `db push --dry-run` up to date; the regenerated types
  add only the two columns. In the pane as a throwaway Root on live:
  ticking Circa with no year said "Add the year, or untick circa.", typing
  1950 cleared it; born c. 1950 and died c. 1990 saved both flags; the
  sheet read "c. 1950" / "c. 1990", the card "c. 1950 – c. 1990", its hover
  "b. c. 1950" over "d. c. 1990"; a child added as born c. 1975 through **Add a
  relative** saved circa; the edit page reopened with Circa ticked. The
  throwaway user, tree and rows were deleted after. 1150 tests pass (13
  new); tsc, lint and `next build` are clean.

- **Step 79 — A country alone as a place of birth** (ad-hoc; migration
  `20260928190000_country_places`). Aalim: "allow for a user to just put a
  country for place of birth". The picker only knew GeoNames' cities500,
  which has no countries, so someone known only to have been born in
  Tanzania couldn't be entered. Now each of the 249 ISO countries is a row
  in `places` (id 9,000,000,000 plus its letters' character codes, no
  coordinates, no `search_name`), and the picker offers the countries the
  search names, with a globe instead of a pin: by its English name or
  another name for it (UK, USA, Tanganyika, Ceylon, Burma, Rhodesia; DR
  Congo, Republic of the Congo, Cabo Verde, East Timor and Holy See are
  new), from its start or a later word's ("Korea"), "St." read as
  "saint", a leading "the" dropped ("The Gambia"), ä, ö and ü spelled out
  or not ("Türkiye"). Zanzibar, a part of Tanzania, still finds only the
  town. A country named whole or from its start comes before places that
  match as closely ("Singapore": the country, then the city; "Ind": India
  and Indonesia, then Indianapolis); one found by a later word, after them
  ("Man": Manila, Manchester, then the Isle of Man); a region after a comma
  still comes first ("Georgia, US"). Picking one keeps no town:
  `city_of_birth` empty and `country_of_birth` the country, through one
  helper the person and companion forms share (`placeText`), so the card,
  the details sheet, search and its country filter, and the leaf all read
  it as a country. A place of death and a companion's place of birth take
  a country too (same picker), a place of death keeping just its name. A
  whole country's period name has no town before it: born in Tanzania in
  1950 reads "Tanganyika (British mandate) · now Tanzania". Found on the
  way: a place of death with a period name read "Nairobi, Kenya, Kenya
  Colony · now Kenya", as `place_of_death` holds the whole label; it now
  takes the town's own name. No entry showed it yet. The birthplace boxes
  read "Search for a town, village, or country…". No ancestral lands are
  asked for a country (it has no coordinates, and isn't a populated
  place). **Verified:** the migration rehearsed on live in a rolled-back
  transaction: 249 rows whose md5 (code and name) equals the file's, ids
  following the rule, none found by the name search, the FK taking a
  country as a person's birth and death place, a member reading them
  through RLS, a Root's next hand-added place id unchanged. Applied
  through the MCP (row renamed from `20260929082743`; its statement's md5
  equals the file's); `db push --dry-run` up to date. In the pane as a
  throwaway Root on live: "Tanz" listed Tanzania first, with a globe;
  picking it saved `place_id_birth` 9000008490, no town and
  `country_of_birth` "Tanzania"; the edit page opened again on
  "Tanzania" (with its globe in the list, after a fix: a place the form
  opens with was always drawn with a pin); the details sheet read
  "Tanganyika (British mandate) · now Tanzania"; "Tanganyika" offered
  Tanzania, "Zanzibar" the town, "UK" the United Kingdom before Uk, Russia,
  "Singapore" the country before the city; Kenya as the place of death
  saved "Kenya"; a companion born in Uganda saved no town. The placeholder
  fits a phone's box (248 of 293 px). The throwaway user, tree and rows
  were deleted after. The loader's tests fail on the old code ("Tanzania,
  Tanganyika…", "Nairobi, Kenya, Kenya Colony…"). 1137 tests pass (22
  new); tsc, lint and `next build` are clean.

- **Step 77.3 — Efficiency audit, phase 4: moving around keeps your place**
  (ad-hoc; no migration; the audit's findings N2, N3 and N4; the third of
  seven parts). Every way to a page on a tree — a notice's **View on
  tree**, **Also on**, Your Trees, the header's Root console count — was a
  form that switched trees and redirected, which drew the whole app again
  even on the tree already open, and nine of them showed nothing
  meanwhile. Choosing another account view or first-run step left the old
  one up until the new one had been read, and Back to the tree lost who was
  open, the camera and the filters. **A link on the tree you're on:**
  `TreeTarget` is a plain link there (it opens in a new tab too, is never
  fetched ahead, and its label pulses until the page is on its way); on the
  canvas it opens the person without drawing the page again, and on the
  Root console it opens the section in place. On another tree it's a button
  that switches first and stays busy until the page has arrived, without
  drawing the app again from the top. It serves the notices' buttons in the
  bell and on settings (**View on tree**, **Edit and resend**, **View in
  Root console**, **View family link**), the header's count, Your Trees,
  settings' tree list, the console picker, **Also on** and an invite to a
  tree you're already on. **Views and steps show their shape at once:**
  each account view and each first-run step reads behind its own boundary,
  so the one chosen shows its skeleton straight away; the toggle's and the
  steps' labels pulse meanwhile; the **root** view is never fetched ahead,
  since the console archives lapsed invites as it's drawn. **Back finds the
  canvas as it was:** who's open goes in the address as they're opened and
  closed (replaced, so Back doesn't step through them), and the camera, the
  filters (your side, descendants of, the search), a lit connection and
  folded details are kept for the tab, per tree. They come back after Back,
  **Back to tree** or a reload; the camera, a lit connection and folded
  details only when the same person is open as when it was left. The
  header's **tree** opens the tree with nobody open. **Verified:** in
  headless Chrome on live, against dev and a production build, as a
  throwaway Root of one throwaway tree who is a Leaf on another: opening
  someone put them in the address with no new history entry, and closing
  took them out; with **Show only your side** and a search on, Salim open
  and the camera moved, **Edit entry** then Back, **Back to tree**, and a
  reload each reopened Salim with the same two filters and exactly the
  same camera; the header's **tree** closed him; the bell's **View on
  tree** for this tree opened Amina in place with nothing fetched and
  closed the bell, and Back closed her again; for the other tree it was a
  button that said "Opening…" and landed on Vali there; Your Trees opened
  the current tree by link and the other by a busy button; nothing was
  fetched ahead for any of these links or the Root console; settings'
  skeleton showed 230–330 ms after the click and the next first-run step's
  within 250 ms; the Root console's count opened Requests for Access in
  place. On a phone, Back reopened Salim with the camera as it was; signed
  out on a share link, a reload reopened Karim with the camera as it was.
  No console errors. The throwaway users, trees, share link and rows were
  deleted after. 1115 tests pass (3 new); tsc, lint and `next build` are
  clean.

- **Step 75 — Root, not admin: every message, label and email says Root**
  (ad-hoc; migration `20260928170000_root_not_admin_messages`). Aalim,
  after Step 70 listed three messages that still said "admin": "update
  everywhere to show root rather than admin". The account page's view
  toggle reads **profile / root / settings** (the tab, "root"), and what a
  Root runs is the **Root console**: the link beside a tree you run in
  settings, **Root console** on Your Trees (was **Admin**), a notice's
  **View in Root console** (was **View in admin**), the header count's label
  ("1 needs attention in the Root console") and the console's two navs for
  screen readers. Every toast, error and line that sent someone to "an
  admin" or "the admin page" now names a Root or the Root console: a
  dispute sent, a duplicate flagged, who may change a flag, an invite whose
  email didn't send, approving a tree request, onboarding's note about an
  entry on another tree, naming a new tree, the privacy notice and the
  alert email's cap note. In the database, the notices each Root gets when
  someone joins bringing their own entry (by any invite, or a claim invite
  when they had one already) and the family-link guard's refusal say "from
  the Root console": `redeem_invite` and `family_link_guard` re-created with
  only those three strings changed, their live bodies first checked against
  `20260925150000_family_link` (md5 identical). No notice already sent said
  "admin", so no stored text changed. Addresses keep `admin`
  (`/account?view=admin`, `/account/admin`), so links in emails already sent
  still work, and so do the code's names. `docs/design-system.md` has the
  rule ("Root, never admin"). **Verified:** the migration rehearsed on live
  in a rolled-back transaction with throwaway members: both notices and the
  guard said "the admin page" before and "the Root console" after, and the
  new bodies' md5s equal the file's. Then applied: the recorded row renamed
  to the file's version, its statement md5 equal to the file's, `db push
  --dry-run` up to date, regenerated types byte-identical. In headless
  Chrome as a throwaway Root on live: the tab reads "root · ancestree", the
  toggle "profile / root / settings", the header count "1 needs attention
  in the Root console" and opens the console at Requests for Access;
  **Root console** on settings and Your Trees opens the console; **View in
  Root console** opens it at Who This Tree Shows; none of those pages says
  "admin" anywhere. The privacy notice, signed out, says Root throughout.
  Once rebased onto Step 77.2, whose header reads its counts and the bell's
  list on its own, a second throwaway Root saw the same count label and the
  bell's **View in Root console**. The throwaway users, trees and rows were
  deleted after. 1112 tests pass (two updated); tsc, lint and `next build`
  are clean.

- **Step 77.2 — Efficiency audit, phase 4: a light header whose counts
  keep up** (ad-hoc; no migration; the audit's findings S4 and N7; the
  second of seven parts). The header drew up to 50 notifications, with the
  reads behind their buttons, into every page and every save's reply, and
  between saves its counts went stale: moving to another page doesn't draw
  the header again. **Counts only:** the header now asks how many
  notifications are unread (one read, on the index of unread rows), how
  many connections wait (the audit `/tree` already runs, once between
  them) and what waits in the admin consoles. **The bell's list when it's
  opened:** `GET /api/notifications` (a route, so it never waits behind a
  save), grey rows until it arrives, then read again while it's open when
  the page is drawn again (an answer given in it) or something new comes
  in; what was there stays up meanwhile, and the reads behind its buttons
  run side by side. **Counts that keep up:** on moving to another page, and
  on coming back to the tab or the window, the header asks
  `GET /api/header-counts` again, at most every 30 s; a save's reply still
  wins over an ask sent before it. Nothing else on the page changes.
  **Verified:** the live code (Step 77.1) and this side by side in dev, 49
  pages loaded as the same throwaway members of two throwaway trees on
  live: each differs only in the header's buttons, never in the page, and
  no page's data carries a notification any more. Per load, header
  included: `/tree` 27 queries in 4 waves → 24 in 3; edit entry 18 in 4 →
  15 in 2; add a relative and the trees page 17/14 in 4 → 14/11 in 2. As
  a throwaway Root in headless Chrome: a fresh load showed "3 unread";
  opening the bell showed grey rows, then all four, and cleared the count;
  reopening showed them at once while they were read again; a notice
  added behind their back showed as "1 unread" on moving to another page
  once 30 s had passed, and not before; coming back to the window asked
  again; Clear from the bell left "No notifications yet" with focus on its
  heading; the admin count still opened "Requests for Access". No console
  errors. The throwaway users, sessions, trees and rows were deleted
  after. 1112 tests pass (3 new); tsc, lint and `next build` are clean.

- **Step 77.1 — Efficiency audit, phase 4: each page reads its data side
  by side, each row once** (ad-hoc; no migration; the audit's Phase 4,
  findings S5, S7 and R7; the first of seven parts, 77.1–77.7). Aalim:
  "Continue to Phase 4" of the [Ancestree Efficiency
  Audit](https://claude.ai/artifact/MGmcpvsEkFnhWrQ24Xvyjo), in seven parts
  landing one at a time. Pages waited on their queries one after another:
  every tree page spent three round trips finding the tree before reading
  anything, `/tree` read the tree's people and lines three times (the canvas,
  the connection audit, the header's count of it) and every claim and
  profile in the database, and the admin console ran eight stages in a row.
  **One wave to find the tree:** who you are and your trees are read
  together, and a tree of yours needs nothing more (`listMyTrees` carries
  the tree's own columns and answers `getRoleIn` too); a visitor's unused
  `tree_visibility` read is gone. **Each row once:** the canvas, the audit
  and the header's count of it, the Branch and Leaf walks, the bloodline and
  the member pickers share one read per request of the tree's people and
  lines (`loadTreePeople`, `loadTreeEdges`), of its member directory, and of
  its claims, which, like the profiles behind "spoken for", are read for
  this tree's people only rather than the whole database (`readIn` splits a
  long list of ids); the edit page asks about the one entry it shows
  (`entryFacts`). **Side by side:** a page's reads start beside the check
  that your own entry is on the tree (`requireTreeSelfPersonWith`), whose
  redirect still comes first; the admin console's reads are chains, each
  starting as soon as what it needs arrives (lapsed invites are still
  archived before they're listed); the account page reads your entry only
  for its profile view, and its settings loops run together; pets come with
  their companions, a share link with its tree, an invite with the tree it
  joins, in one read each; a founder's first-run visit with no step reads
  only what picks the step. Nothing on screen changes but how soon it
  arrives. **Verified:** the old code (`bf30717`) and the new side by side
  in dev, the same 50 pages loaded as the same throwaway members of two
  throwaway trees on live (a founding Root, a second Root, a Branch, a Leaf
  with a claimed entry, a Leaf with a disputed claim, a Root and a Leaf of
  the second tree, one visiting the first; a share link and an invite
  signed out): every page's data came back identical, but for the second
  tree's canvas, whose list of entries spoken for now holds only its own
  people (it only asks about its own). Round trips per load, header
  included, old → new: `/tree` 36 in 8 waves → 28 in 4; edit entry 24 in 7
  → 18 in 4 (a Branch's 25 in 10 → 19 in 5); the admin console 46 in 15 →
  42 in 4; account settings 22 in 8 → 19 in 4; a Leaf's suggest page 20 in
  9 → 16 in 4; a share link 11 in 5 → 8 in 3; dev load times fell by a
  third or more (the admin console's by two thirds). The canvas draws every
  card with no console error. The
  throwaway users, sessions, trees and rows were deleted after. 1109 tests
  pass (18 new); tsc, lint and `next build` are clean.

- **Step 78 — "Add someone in between" up front on Add a relative**
  (ad-hoc; no migration). Aalim, on a screenshot of the form connecting a
  new entry as someone's child: "there's no 'add people in between' button
  here when adding a net new person". Since Step 44 the yellow button
  (Step 54) showed only once **Add more details** was pressed, and Step 58
  took away the line pointing there. It now sits under **How they
  connect** as soon as someone is picked, as it always has when adding
  yourself; an in-between person still gets just their name, the rest
  behind "More about them". Marriage dates and "This person connects to
  more people on the tree" stay behind **Add more details**.
  **Verified:** in Chromium on a throwaway page with made-up people
  (deleted, never committed): the button shows before **Add more
  details**, and not until someone is picked; one in between reads "Noah
  Rivera is child of Sam Rivera" and "Mia Rivera is child of Noah Rivera",
  and **Add relative** turns on once both are named; **Remove** puts focus
  back on the button; **Add more details** still focuses its heading and
  leaves one button; a Leaf sees it too, and adding yourself is unchanged;
  a 375 px phone and both themes; no console or server errors. 1091 tests
  pass (none new: it's layout); tsc and lint are clean.

- **Step 76.9 — Maiden name in the Upcoming feed** (ad-hoc, after Step
  76.8; no migration). Aalim: "show the maiden name in the upcoming feed
  too". A birthday reads "Nurbanu Rattansi / née Kassamali Rahemtullah /
  Turns 74 tomorrow", the maiden name on a line of its own under the name,
  as everywhere else since Step 76. An anniversary's name is the couple's
  ("Ali & Nurbanu Rattansi"), so a bare "née …" wouldn't say whose; its
  line names the partner: "Nurbanu née Kassamali Rahemtullah", and both,
  joined by " · ", when each has one ("Maya née Nathoo · Leila née
  Jaffer"). Rows without one are unchanged. Long ones shrink to fit (the
  longest couple's line here went to 11px) before they are cut short; the
  card is 288px wide on a phone too. **Verified:** the real card on a
  throwaway page, fed birthdays and anniversaries from `upcomingOccasions`
  (single and couple rows, one or both maiden names, the longest maiden
  name on live), light and dark. 1091 tests pass; tsc, lint and
  `next build` are clean.

- **Step 76.8 — Maiden name in the tree search results** (ad-hoc, after
  Step 76.7; no migration). Aalim: "show the maiden name in the tree
  search results too". The search has always matched maiden names, so
  "Jaffer" found Fatima Rattansi with nothing on the row to say why. Each
  result in **Find a person** now reads "Fatima Rattansi / née Jaffer /
  1925 – 2010 · Zanzibar, Tanzania", the maiden name on a line of its own
  as on the card rather than crowding the years and birthplace; with no
  years or birthplace it stands alone, not over "No other details". The
  person picker (`person-picker.tsx`) does the same in its suggestions,
  since it matches maiden names too: **Show a connection**, the
  descendants filter and the sheet's "How is … connected to…". Long ones
  shrink before they are cut short, as the rows' other lines do; the
  card is 288px wide on a phone too. **Verified:** on a throwaway
  read-only `FamilyTree` (nothing sent to the server), "Jaffer" in Find a
  person and "Kassamali" in Show a connection. 1091 tests pass; tsc, lint
  and `next build` are clean.

- **Step 76.7 — Maiden name on the minimized details card** (ad-hoc, after
  Step 76.6; no migration). Aalim: "add the maiden name to the minimized
  card too". The card a minimized sheet leaves at the foot of the canvas
  (`FoldedDetails`, Step 49) repeats the header's lines: "Fatima Rattansi /
  née Jaffer / 1925 – 2010". The maiden name has a line of its own, like
  the years, rather than joining them: on a phone the card's text is 129px
  wide, and a shared line would have cut off the years first. Each line
  truncates on its own, as the card's lines always have, so on a phone a
  21-letter maiden name ends in an ellipsis ("née Kassamali Rahe…") while
  ordinary ones fit whole; the card grows by a line (74px tall) and stays
  clear of the zoom controls. **Verified:** on a throwaway read-only
  `FamilyTree` (nothing sent to the server), minimizing a sheet with a
  photo on the desktop and the viewer's own entry on a 375px phone. 1091
  tests pass; tsc, lint and `next build` are clean.

- **Step 76.6 — Maiden name in the details sheet header** (ad-hoc, after
  Step 76.5; no migration). Aalim: "show the maiden name in the details
  sheet header too". The header reads "Fatima Rattansi / née Jaffer /
  1925 – 2010", on the photo when there is one and beside the initials
  when not; the details below still list **Maiden name**. On a phone a
  long one wraps rather than being cut short. Over a photo, the words sit
  inside a button that speaks only "View photo of …", so a screen reader
  gets the maiden name from a hidden line between the sheet's title and
  description, as it gets those two. The extra line made the photo's
  scrim taller, which stretched its gradient and left the name on a
  lighter part of it: on a near-white photo the name's contrast fell from
  3.2–4.4 to 2.5–3.6. The gradient's middle stop now sits 48px below the
  top of the scrim instead of halfway (`via-[calc(100%-48px)]`), which is
  exactly where it was on a scrim without a maiden name, so those are
  unchanged and the name keeps its shade (3.2–4.1) under a maiden name.
  The folded card a minimized sheet leaves on the canvas still shows only
  the name and the years. **Verified:** on a throwaway read-only
  `FamilyTree` (nothing sent to the server): the photo and no-photo
  headers, the viewer's own entry, a 21-letter maiden name wrapping on a
  375px phone, the gradient's computed stops. 1091 tests pass; tsc, lint
  and `next build` are clean.

- **Step 76.5 — "You" keeps its own line on a leaf with no maiden name**
  (ad-hoc, after Step 76; no migration). Aalim: "keep You on its own line
  when there's no maiden name". The viewer's own leaf reads "Fatima
  Rattansi / You / b. 1952" again; only beside a maiden name does "You"
  share the years' line ("You · b. 1952"), so a leaf still never runs past
  three lines. Three lines of either kind hang from where two put the
  name, so "You" on its own line no longer lifts the name into the gaps
  between the baobab's leaflets, as it did before Step 76.
  **Verified:** the ink check on a throwaway page of the real leaf, all
  seven blades with and without a maiden name, "You" and years, found at
  least 2px between lettering and outline on all 49; side by side with the
  leaf before Step 76, light and dark. 1091 tests pass; tsc, lint and
  `next build` are clean.

- **Step 76 — Maiden name on the leaf and the hover cards** (ad-hoc, no
  migration). Aalim: "show maiden name on the leaf and hover over view. make
  sure that it is formatted to fit cleanly in the UI". A spotlight's leaves
  now say "née Jaffer" under the name, as the cards already did, and so do
  both hover cards: the leaf's, and a card's photo preview, which covered
  the card's own line while hovered. A sibling's partner's pill says it in
  its tooltip ("Leila Rattansi, née Nathoo · Spouse of Karim"). One helper,
  `maidenLine` (`lib/person-name.ts`), writes it everywhere, trimmed.
  **Fitting it in the leaf** (`leaf-card.tsx`): at most three lines, the
  name, the maiden name, then "You" and the years together ("You · b. 1952";
  "You" had a line of its own), set tighter (15px under the name, 12px under
  the others). Three hang from where two put the name rather than centring
  on it: centred, the name rose into the gaps between the baobab's
  leaflets, as it already did on the viewer's own baobab leaf. The elliptic
  blade (Uganda, Zanzibar and 33 more places), a lens pointed at both ends,
  starts its lines at 58 rather than 52 (`TEXT_LEFT`), where it is deep
  enough for three. A maiden name stops 110px along, short of the baobab's
  and the maple's narrow tips, and a long one shrinks (to 8.5px) before it
  is cut short; the longest on live, 21 letters on a baobab, fits whole.
  On live, 34 of 174 entries have a maiden name, 7 of them born in
  Tanzania. **Verified:** on a throwaway page of the real leaf in all seven
  blades, with two and three lines, long names and long maiden names, an
  ink check (each line drawn on a canvas, every column of ink tested
  against the blade's fill) found at least 2px between lettering and
  outline everywhere except a 17-letter shortened name on a baobab (1.5px);
  inside the real canvas (a read-only `FamilyTree` of a made-up family,
  spotlight open) at least 3px. Both hover cards, the pill's tooltip, and
  light and dark looked right side by side with the old leaf. 1091 tests
  pass (3 new); tsc, lint and `next build` are clean.

- **Step 74 — Undo a dismissed suggestion, and a review of Steps 67–73**
  (ad-hoc, no migration). Aalim: "review the work done for suggesting
  changes on uneditable entries. allow for a suggester to undo a dismiss".
  **Dismiss** on a declined suggestion (Step 73) now says "Suggestion
  dismissed." with **Undo**, which puts it back on the card, and back in
  the form's "Your last suggestion was declined." hint when it was the
  latest answered one. It follows the rule Step 70 wrote into
  `docs/design-system.md` (cheap to put back: at once, with **Undo** in the
  toast), like unlinking a companion: a plain toast, no second one once the
  card shows it back, and the error in a toast if it fails
  (`toastError`). The Dismiss button is still Step 70's `ActionButton`,
  focus still moves on to the next suggestion, and its `onSuccess` shows
  the toast. `restoreEntrySuggestion` clears `dismissed_at`, sharing one
  update with `dismissEntrySuggestion`; nothing new in the database, since
  Step 73's column grant and `entry_suggestions_dismiss` policy already let
  only the suggester write that column, both ways, on their own declined
  suggestions. The details sheet stays open when the toast is pressed
  (`disablePointerDismissal`, which Base UI also reads as don't close on
  focus out). Once the toast has gone, a dismissed suggestion comes back
  only as a new one, through its notice's **Edit and resend**.
  **Review of Steps 67–73**, left for Aalim: (1) accepting a suggestion
  made while an entry was marked as having died, after it has been marked
  living, puts the suggested date or place of death on a living person:
  `decide_entry_suggestion` doesn't re-apply `suggest_entry_change`'s rule
  that the living have no death details, and no CHECK does, so the canvas
  shows a year of death and the claim checks read them as having died
  (shown on live in a rolled-back transaction); (2) "Declined by …" on the
  suggester's card and resend form names the decider from
  `member_directory` (their display name, and nobody at all when the
  suggestion was made from another tree, since the view is security
  invoker), while the notices name them by `private.member_label` (their
  entry's name), which differs for 5 of the 14 members on live; keeping a
  `decided_by_name` as `suggested_by_name` is kept would settle both;
  (3) `listPendingSuggestions` reads every waiting suggestion the viewer may
  see, so RLS runs `can_edit_person` over all of them, site-wide, on every
  render of `/tree` (none on live yet). The notes on suggested changes
  above still said nothing else writes a suggestion, untrue since Step 73's
  update policy; fixed. **Verified:** in a rolled-back transaction on live, the
  suggester dismissed and put back their declined suggestion (1 row each),
  a Root putting it back and the suggester touching one still waiting
  updated nothing, the suggester setting `status` was refused (42501), and
  it ended declined, not dismissed, with both notices. End to end in
  headless Chrome on this worktree's dev server, as a throwaway Leaf of a
  throwaway Root's tree on live, once before Step 70 landed and again on
  top of it (everything deleted after, auth users included): with the 12th
  and the 13th declined, **Dismiss** took the 13th off, focus moved to the
  12th's **Edit and resend**, and **Undo** put it back, still declined; by
  keyboard alone (Enter, then Alt+T and Tab to **Undo**) the same; the
  form's hint went with the dismissal and came back with **Undo**;
  dismissing both took the section away and the newest toast's **Undo**
  brought back only the 12th; on a 390 px phone the toast comes in under
  the header and **Undo** works by tap; with the suggestion deleted behind
  the page, **Undo** said "Couldn’t put it back. Refresh and try again." in
  red for 10 s. No page errors. 1088 tests pass (none new); tsc, lint and
  `next build` are clean.

- **Step 70 — Efficiency audit, phase 2: buttons that never stick, a
  question before a loss, errors where they're looked for** (ad-hoc; no
  migration; the audit's Phase 2, findings B1, B2, B5–B8, B10, R1). Aalim:
  "continue to phase 2" of the [Ancestree Efficiency
  Audit](https://claude.ai/artifact/MGmcpvsEkFnhWrQ24Xvyjo). An inventory
  found 92 handlers calling server actions: 47 left their button disabled
  for good if the call threw (after a deploy, say), 14 made a neighbouring
  button read "Working…" while it ran, 7 cleared the busy state before the
  next page arrived so a second press saved twice, and 27 action forms
  showed nothing at all while they ran.
  **One way to call an action:** `useAction` (`components/use-action.ts`)
  runs the call in a React transition, so only the pressed button shows
  it's busy (a spinner and its own words, "Deleting…"; `PendingButton`),
  and it stays busy until the page's new render, or the next page, has
  arrived; it ends however the call went. A refusal or a call that threw
  ("Couldn't reach the server — reload the page and try again.") is said
  once, by the button in a form (`FormError`) or in a toast; a `redirect()`
  from the action counts as done (Next rejects the caller's promise while
  the router goes there, `lib/action-feedback.ts#isRedirect`), and nothing
  is remounted to go there twice. `ActionButton` is one button with one
  action, `SubmitButton` a `<form action>`'s, now with a spinner; every
  hand-rolled busy flag, try/catch and "Couldn't reach the server" copy is
  gone. Rows that don't depend on each other have a call each: answering
  one invite request, notification or tree request no longer disables
  every other row.
  **A question before a loss:** `ConfirmDialog` / `ConfirmButton`, on Base
  UI's AlertDialog, replace all ten `window.confirm`s and ask before what
  asked nothing: Auto-arrange ("Every card moved by hand goes back to its
  place."), removing a document, a connection (a spouse line says its
  dates go with it), a placement, a nickname group, a pet comment,
  revoking a share link, clearing notifications, upholding or reversing a
  claim, and "This is me" (the inline merge note is now the dialog's).
  The question is the title, "This cannot be undone." sits on its own line
  where something is lost, Cancel comes first with focus, the confirm is
  the only solid red button (`destructive-solid`); it runs the action
  itself, stays open busy, and shows a refusal inside. Unlinking a person
  from a companion, or a nickname from its group, happens at once with
  **Undo** in the toast; the companion sheet no longer closes when the
  toast is pressed.
  **Errors where they're looked for:** forms and dialogs show a failure by
  their button (the photo picker's and documents' file checks, the invite
  forms' kept rows with each row's reason, the comment boxes, the marriage
  editor, the crop, the dispute, the add-a-place dialog…). Toasts are red
  or green (`richColors`), can be closed, keep a failure up 10 s, come in
  at the top under the header on a phone (at the bottom they covered the
  canvas's pill, minimized card and zoom buttons) and stay left of a
  docked details sheet. About 50 success toasts that repeated the screen
  ("Comment posted.", "Name updated.", "Deleted.", "Tree re-arranged.")
  are gone; those for what happens off screen (an email sent, a link
  copied, who was removed and whether their login went) stay.
  **Moves at once:** tree visibility, home tree, relatives-can-ask, the
  family link's cap, account types, a companion's people and its primary,
  flag toggles, connection prompts and a nickname's × change as they're
  pressed and go back by themselves if the save fails (`useOptimistic`);
  a failed pet-comment delete no longer jumps to the top.
  **Focus kept** (`components/use-focus-return.ts`): a busy button keeps
  focus; opening an inline form (marriage dates, a dispute, a decline
  reason, Search & filters, Upcoming) focuses its first field and closing
  it returns to its button; a removed row hands focus to the next row's,
  or the section it was in; Escape in the bell's panel returns to the bell.
  **Touch:** small controls answer to a 44 px square on a touch screen
  (`tap-target`, an invisible hit area, so nothing moves), the canvas's ✕
  buttons are no longer faded (2.3:1), and the zoom buttons are 40 px.
  **Also:** the header's admin count is `attention`, not the red of a
  removal; "Send dispute" is an ordinary button; row buttons name their
  row to a screen reader ("Remove Will.pdf"); `revokeShareLink` reports a
  failure instead of looking like success; Add a relative's connection
  check no longer blanks its answers when Save is pressed; the edit form
  no longer uploads the same photo again on a second save; a thrown
  invite email after a save is a warning, never a second save. Steps 69
  and 71–73's suggestion answers (decline with a reason, dismiss, withdraw)
  landed meanwhile and are on the same primitives. **Verified:** in
  Chrome, headless, on a throwaway page with throwaway server actions
  (deleted): only the pressed button is busy and it ends with the new
  render (1.5 s), through a `router.push` and a `redirect()` to a page
  that takes 1.5 s to draw, with no false error; a refusal and a throw
  both end it with a red, closable toast still up at 7 s; keyboard focus
  stays on a busy button; a confirm opens with Cancel focused, Escape
  returns to its button, and a removal moves focus to the next row's; the
  hit area is 44 px on touch only; phone toasts sit under the header. As
  a throwaway Root (and a throwaway Leaf) of throwaway trees on live, all
  deleted after (users, sessions, rows): Auto-arrange, Delete entry, a
  spouse line's Remove and a share link's Revoke ask with the words above;
  marriage dates save with focus in and back and no toast; a comment posts
  with the box focused again, and a failed network call leaves the text
  and says so by the button; unlinking a companion is instant and Undo
  brings it back with the sheet open; Clear asks, and focus lands on the
  panel's heading; a Leaf's suggestions are declined with a reason
  (Enter sends it), accepted from the bell, dismissed and withdrawn, each
  with its own busy words and no toast; nothing scrolls sideways on a
  390 px phone; no console errors. 1088 tests pass (7 new); tsc, lint and
  `next build` are clean.

- **Step 73 — Dismiss a declined suggestion from the card** (ad-hoc;
  migration `20260928150000_suggestion_dismissed`, live 2026-09-28, before
  the code). Aalim: "let the suggester dismiss a declined suggestion from the
  card". Each declined suggestion on its suggester's card (Step 72) has
  **Dismiss** beside **Edit and resend**. It takes that one off their card
  ("Dismissed."), and off the form's "Your last suggestion was declined."
  hint when it was their latest answered one; with nothing left, the card's
  **Suggested changes** goes. Nothing else changes: it stays declined, the
  notices of those who were asked still show it, and its own notice still
  opens it to edit and resend. It isn't deleted, since those notices point
  at it. `entry_suggestions.dismissed_at` records it, only ever on a declined
  suggestion (a CHECK); a column grant and the `entry_suggestions_dismiss`
  update policy let only its suggester set it, on their own declined ones,
  and set nothing else. **Verified:** rehearsed on live in a rolled-back
  transaction: the suggester's update marked it dismissed and left it
  declined with both its notices; a Root, another Leaf, and the suggester
  on their own pending suggestion updated nothing; the suggester changing
  the status or the suggested values was refused; the table refused a
  dismissal on a pending suggestion; answering still worked. Applied: the
  recorded statement's md5 equals the file's. End to end on live in
  headless Chrome as a throwaway Leaf and Root of a throwaway tree (deleted
  after, auth users included): with the 12th and the 13th declined, the
  card showed both with **Edit and resend** and **Dismiss**; dismissing the
  13th took it off and left the 12th; the form showed no hint; the 13th's
  notice still opened it; the Root's notices were unchanged; dismissing the
  12th took the section away. 1081 tests pass (none new); tsc, lint and
  `next build` are clean.

- **Step 72 — The suggester sees their declined suggestions on the
  entry's card** (ad-hoc, no migration). Aalim: "let the suggester see their
  declined suggestions on the entry's card". Until now a declined suggestion
  left the card, and only its notice said so. Now the card's **Suggested
  changes** lists the viewer's own declined suggestions after anything still
  waiting, newest first: "You" with a **Declined** badge and when, what they
  suggested (against the entry as it was then), their note, "Declined by …"
  with the reason if one was given, and **Edit and resend** (Step 71's form,
  `?from=` that suggestion). Nobody else sees them, not even whoever may
  edit the entry: `listOwnDeclinedSuggestions` asks only for the viewer's
  own, and the tree page hands the card those on people it shows. **Verified:**
  end to end on live in headless Chrome as a throwaway Leaf and Root of a
  throwaway tree (deleted after, auth users included): with two suggestions
  declined (one with "Check her passport again.") and a third waiting, the
  Leaf's card listed the waiting one with **Withdraw**, then the 13th
  (declined, no reason) and the 12th (with its note and the reason), each
  with **Edit and resend**; the Root's card listed only the waiting one;
  **Edit and resend** on the 12th opened the form on it, the note and the
  reason above, and said the waiting one would be replaced; at 390 px the
  card holds. 1081 tests pass (none new); tsc, lint and `next build` are
  clean.

- **Step 71 — Edit and resend a declined suggestion** (ad-hoc; migration
  `20260928140000_suggestion_outcome_links`, live 2026-09-28, before the
  code). Aalim: "let the suggester edit and resend a declined suggestion".
  The notice telling a suggester their suggestion was answered now shows
  what they suggested (each detail struck through beside what they
  suggested), and a declined one has **Edit and resend**. It switches to the
  tree they suggested from and opens the form on that suggestion: their
  changes and note, under "Declined by …" and the reason if one was given.
  **Send suggestion** is live at once, so it can go again as it is, or be
  changed first; either way it's a new suggestion, the owner, the Roots and
  the Branches who tend the entry are asked again, and the declined one
  stays as it was. If the notice has been cleared, **Suggest a change** on
  the entry says "Your last suggestion was declined." with **Edit and
  resend it**, when their latest answered suggestion there was declined.
  For that, `decide_entry_suggestion` writes the suggester's notice itself,
  with `suggestion_id`, rather than through `private.notify`; recipient,
  type, body and tree are unchanged, and so is its signature. The form page
  takes `?from=<suggestion>` (`suggestChangeHref(person, from)`), and the
  form is keyed on where it starts, so following the hint's link on the same
  page opens it afresh. **Verified:** rehearsed on live in a rolled-back
  transaction: the declined and accepted notices carried their suggestion,
  with the same body and tree; resending left the declined one declined and
  asked the Root again; only the one signature remained, with the same
  grants. Applied: the recorded statement's md5 equals the file's, and the
  body's md5 matches. End to end on live in headless Chrome as a throwaway
  Leaf and Root of a throwaway tree (deleted after, auth users included):
  the Root declined "5 → 12 March 1931" with "Check her passport again.";
  the Leaf's notice showed the change and **Edit and resend**, which opened
  the form on the 12th with the note, the reason above, and **Send
  suggestion** live; changed to the 13th and sent, the card showed it
  waiting and the Root's bell asked again beside the declined one; declined
  once more, **Suggest a change** offered **Edit and resend it**, which
  opened the form on the 13th (a first run caught the form keeping the
  entry's values there, fixed by the key), and sending it unchanged made a
  new suggestion. 1081 tests pass (1 new); tsc, lint and `next build` are
  clean.

- **Step 66.5 — The place search looks inside names from three letters**
  (ad-hoc, after Step 66.4; no migration). Aalim asked to "start searching
  at three letters": a two-letter `search_name ILIKE '%xy%'` has no trigram
  to use, so the database scanned every place (`%an%` about 0.56 s,
  `%bo%` 0.39 s, a parallel sequential scan), and every search passed
  through two letters as someone typed. From three letters (`MIN_LETTERS`
  in `lib/place-choice.ts`) the search looks anywhere in a name, as before.
  Two letters don't go dark, though: 93 places have two-letter names, 20
  of them over 10,000 people (Bo, Sierra Leone, 234k; Ho, Ghana, 131k; Wa,
  Ghana, 78k), and a strict minimum would have left them unfindable and
  open to a Root adding them again. So two letters match only a place with
  that whole name (`ILIKE 'bo'`, which the index serves: 4 rows in about
  17 ms), and so does a fallback that comes down to two letters ("Ho
  Ghana"). When two letters find no such place, the list says "Type at
  least three letters." and a Root is offered no **Add** (a Root can still
  use the link under the field). **Verified:** over PostgREST from here,
  two-letter searches ("va", "an", "ka", "lo", "bo") took 482–687 ms
  anywhere in a name and 125–191 ms as a whole name, about a bare round
  trip. In the pane on this worktree's dev server, as a throwaway Root of
  its own tree (deleted after, auth user included): "v" and "va" said "Type
  at least three letters." with no **Add**; "van" listed Van, Türkiye, then
  Vancouver, Canada, and Vantaa, Finland; "Bo" listed the four places named
  Bo (Sierra Leone, Vietnam, Bø in Norway, Bő in Hungary) and no Boston or
  Bogotá; "Ho, Ghana" put Ho, Ghana first; "Kalavad taluka" still found
  Kālāvad. The edge logs show "va" and "ho" sent as `ilike.va` and
  `ilike.ho`, with no wildcards. 1080 tests pass (2 new); tsc, lint and
  `next build` are clean.

- **Step 69 — Decline a suggested change with a reason** (ad-hoc;
  migration `20260928120000_suggestion_decline_reason`, live 2026-09-28,
  before the code). Aalim: "let the owner decline with a reason". **Decline**
  on a suggested change (on the entry's card, or in the notice that asks)
  now opens a **Reason (optional)** box with **Decline** and **Cancel**,
  for whoever answers it: the entry's owner, a Root, or a Branch who tends
  it (Step 68). The suggester's notice quotes it ("… declined your suggested
  change to Amarshi Sayani: “Her passport says the 5th.”"), and the others
  who were asked see "Declined by …: “…”" on theirs. Left empty, nothing
  changes from before. `entry_suggestions.decline_reason` holds it (only on
  a declined suggestion, up to 500 characters);
  `decide_entry_suggestion` takes it as a third argument with a default,
  its two-argument version dropped in the same migration so the app before
  this still reached it. Accept and Decline are one control now,
  `components/suggestion-answer.tsx`, on the card and in the notice; the
  answered line is `answeredLine` (`lib/suggestions.ts`). **Verified:**
  rehearsed on live in a rolled-back transaction: a reason was stored
  trimmed and quoted in the notice; accepting kept none, even when sent one;
  the old two-argument call still declined; a 501-character reason was
  refused and the suggestion stayed pending; a reason couldn't be written
  directly, nor kept on a pending suggestion; only the new signature
  remained, with the same grants. Applied: the recorded statement's md5
  equals the file's, and the body's md5 matches. End to end on live in
  headless Chrome as a throwaway Leaf, Branch and Root of a throwaway tree
  (deleted after, auth users included): the Leaf's suggestion reached the
  Branch who tends the entry (Step 68 through the app) as well as the
  Root; the Root pressed **Decline** on the card, **Cancel** put Accept back,
  and a second **Decline** with "Her passport says the 5th." declined it;
  the Leaf's notice quoted the reason and the Branch's said "Declined by …:
  “Her passport says the 5th.”"; a second suggestion, declined by the Branch
  from the bell with the box left empty, told the Leaf with no reason. 1078
  tests pass (3 new); tsc, lint and `next build` are clean.

- **Step 66.4 — The place search ranks 200 matches, not 60** (ad-hoc,
  after Step 66; no migration). Aalim asked to "widen the window to 200".
  Each search pulls its name matches most populous first and ranks them in
  JS (`CANDIDATES` in `lib/places.ts`). With 60, a smaller namesake was
  never ranked however exactly it matched (Ely, NV is the 78th most
  populous "%ely%" match, Ely, MN the 87th), nor was a place in a hinted
  region behind 60 bigger namesakes. The database finds and sorts every
  match whatever the limit, so the only cost is the rows sent to the
  server: about 31 KB instead of 9 KB for a broad name like "san"; the
  browser still gets 8. **Verified:** on live, the query's database time
  was the same at 60 and 200 for seven patterns, from `%vancouver%` (5
  matches) to `%an%` (50,290), and PostgREST round trips from here took
  111–199 ms either way. Over 502 searches (Step 66's random sample of
  names and prefixes, plus named ones), 466 gave the same 8 and 36 changed,
  all short names or 3–5-letter prefixes, each gaining exact or prefix
  matches the 60 cut off: "Ely" lists Ely, England, then Ely, NV, MN and IA
  before Elyria; "springs" Springs, NY; "rin" Rincón… and Rinteln rather
  than names with "rin" inside; "india" now puts India, Gambia first.
  "London", "Nairobi", "Vancouver, Canada", "Kalavad taluka" and the
  family's places (Jamnagar, Moshi, Mombasa, Kampala, Zanzibar, Toronto,
  Surrey…) are unchanged. In the pane on this worktree's dev server, as a
  throwaway Root of its own tree (deleted after, auth user included), "Ely"
  listed the four Elys first and those four searches read as before; the
  edge logs show `limit=200`. Noticed, not changed: a two-letter search
  can't use the trigram index (`%an%` takes about 0.56 s in the database).
  1075 tests pass (1 new); tsc, lint and `next build` are clean.

- **Step 68 — Suggested changes reach the Branches who tend the entry**
  (ad-hoc; migration `20260928110000_suggestions_notify_branches`, live
  2026-09-28; no app change). Aalim: "let branches get notified of
  suggestions too". Step 67 asked an entry's owner and the Roots of its home
  tree; a Branch who may edit the entry could already accept a suggestion
  from its card but wasn't told. Now the notice also goes to each Branch of
  the entry's home tree whose part of a Root's side it's on, while it's
  nobody's own entry: exactly the Branches `private.can_edit_person` lets
  edit it, so every Branch told can answer. A Branch past their side, who
  can't edit the entry, isn't told. `private.tending_branches(person)` works
  that out for everyone at once, measuring each Branch's reach from their
  own entry as `private.own_branch_ids` does for whoever is signed in;
  `suggest_entry_change` is Step 67's body with only its list of whom it
  asks changed (md5-checked against the live body first). **Verified:**
  rehearsed on live in a rolled-back transaction with two Roots, a Branch on
  each one's side, a Branch related to no Root and two Leaves: before the
  change a Leaf's suggestion on the first Root's parent asked only the two
  Roots; after it, that side's Branch too, and on the second Root's side
  that side's Branch; a Leaf's own entry asked no Branch; the Branch related
  to no Root was never asked; and across all 33 Branch–entry pairs
  `tending_branches` picked exactly the Branches `can_edit_person` lets
  edit, leaving out their own entries. Applied: the recorded statement's
  md5 equals the file's, both bodies' md5s match, the grants are as before
  (`tending_branches` postgres-only), and the same check ran on live after,
  rolled back. 1074 tests pass (none new: the app is unchanged); tsc, lint
  and `next build` are clean.

- **Step 66 — The place search finds "Vancouver, BC" and "Kalavad
  taluka"** (ad-hoc, no migration). On 2026-09-28 the Supabase edge logs
  showed Aalim's place searches coming back empty: "vancouver," (a comma
  alone was enough), "vancouver, b" to "vancouver, british", and "kalavad
  talu" / "kalavad taluka", though Vancouver and Kālāvad (ascii Kalavad,
  1268450) are in `places`. The search was `search_name ILIKE '%<everything
  typed>%'`, so the whole text had to sit inside one name, while the
  picker's own labels ("Vancouver, WA, United States") invite typing a
  place with its region. Now, in `lib/place-search.ts` (pure;
  `searchPlaces` is its thin wrapper): only the part before the first comma
  is searched, and what follows names a region whose places come first: a
  country by its name, ISO code or another name (UK, USA, UAE, and older
  ones family records use: Tanganyika, Zanzibar, Ceylon, Burma, Nyasaland,
  Rhodesia…), a letter admin1 code (WA, ENG, ZH), the state a Root typed
  for a place they added (Gujarat), or a name in `lib/place-regions.ts` for
  Canada's provinces, the US states, the UK's nations and India's states
  (GeoNames' Canadian and Indian codes are numbers the label never shows;
  each was checked against the biggest places filed under it). A region
  only reorders, so a misspelt one hides nothing; the start of one counts
  while it's typed ("vancouver, brit"), one letter doesn't. A search that
  finds nothing is tried again without words that say what kind of place
  it is (taluka, taluk, tehsil, district, county, province, state, city,
  town, village…) and without a region named at its end with no comma
  ("Vancouver BC", "London Ontario", "Toronto Ontario Canada"; then only
  places in that region count, by its whole name). Both searches go out
  together, so it's still one round trip, and the second counts only when
  the first finds nothing, so names that really carry such a word (State
  College, District Heights, Norfolk County) are still found as typed; one
  `or()` query instead was measured to push 8 such real names out of the
  60-row window. Typed text is folded the way `search_name` is: accents off
  ("Kālāvad", as the label shows it), a phone's curly apostrophe and long
  dashes made plain ("St. John’s"), ILIKE and PostgREST wildcards dropped;
  ä, ö and ü are tried as ae, oe and ue first, as GeoNames spells most of
  them ("Zürich" is `Zuerich`, and found nothing before), then plain
  ("Nürtingen"). A name with a comma in it (40 GeoNames names, e.g.
  "Misato, Saitama") typed whole still comes first. For a Root, **Add “…”**
  (Step 64) and the add dialog take only the part before the comma
  ("Sisang, Gujarat" offers Sisang, not a place named "Sisang, Gujarat"),
  and a region typed with no name before its comma says "Type the place’s
  name first." Left as they were: a region only reorders the 60 most
  populous name matches, so a small place whose name has 60 bigger
  namesakes can still miss out, and "St Louis" without its dot still misses
  St. Louis. **Verified:** `EXPLAIN ANALYZE` shows both query shapes on
  `places_search_name_trgm` (bitmap index scan, under 2 ms). The old and
  new search side by side on live `places` (a throwaway test, deleted): 477
  real names and their 3- and 5-letter prefixes, drawn at random, gave
  identical results; "London" still lists London, ENG, United Kingdom
  first, "Nairobi" Nairobi, Kenya, "Vancouver, Canada" Vancouver, Canada,
  and "Kalavad taluka" now Kālāvad, India; each of Aalim's empty searches
  above now puts Vancouver, Canada first ("kalavad talu" stays empty until
  the word is whole), "Vancouver, WA" Vancouver, WA, "London, Ontario"
  London, Canada, "Richmond, BC" Richmond, Canada (ahead of the bigger
  Richmond, VA), "Dar es Salaam, Tanganyika" Dar es Salaam. In the pane on
  this worktree's dev server, signed in as a throwaway Root of its own tree
  (auth user, profile, tree and entry deleted after), the place of birth
  picker listed the same for "vancouver, british", "Kalavad taluka",
  "London", "Nairobi", "Vancouver, Canada", "Vancouver BC" (BC places
  only), "London, Ontario" and "Zürich" (Zürich, ZH, Switzerland); the edge
  logs show each retry going out within 31 ms of its first search;
  "Zzvillagesixtysix, Gujarat, India" offered **Add “Zzvillagesixtysix”**,
  whose dialog opened with that name (cancelled, so nothing reached
  `places`); ", India" said "Type the place’s name first."; arrow keys and
  Enter still pick. 1074 tests pass (30 new); tsc, lint and `next build`
  are clean.

- **Step 67 — Suggest a change to an entry you can't edit** (from the
  Notion backlog; migration `20260928100000_entry_suggestions`, live
  2026-09-28, before the code). Someone who couldn't edit an entry, and knew
  a detail was wrong (a date of birth a relative entered, say), could only
  comment or raise a flag, which reached its owner and whoever made it. Now
  the details sheet offers **Suggest a change** in its header to anyone who
  can't edit the entry (beside **Fill in what’s missing** where that
  applies; never on a share link or to a visitor). It opens
  `/people/[id]/suggest`: the entry's details (names, sex, date and place of
  birth, whether they've died, date and place of death) to change as they
  should read, and a **Note**; **Send suggestion** wakes once something
  differs. The entry's owner and the Roots of its home tree get a notice
  ("… suggested a change to Amarshi Sayani: date of birth.") showing each
  detail as it reads now, struck through, beside what's suggested, with the
  note and **Accept** / **Decline**; the entry's card shows the same under
  **Suggested changes** to anyone who may edit it. Accepting makes the
  change as the accepter's own edit, so the owner and maker are told as of
  any edit and a Branch accepting a change to a Root's entry leaves the
  Root the usual undo. Either way the suggester is told ("… accepted your
  suggested change to …"), and an answered notice says who answered. A
  suggester sees theirs on the card with **Withdraw**; each member has one
  waiting per entry, and suggesting again opens the form on it and replaces
  it. Nothing changes until someone who may edit accepts. **Edit entry** on
  an entry the viewer can neither edit nor fill in (a card whose home is a
  tree they don't run) now lands on the suggestion form rather than back on
  the tree, and the suggestion form sends someone who can edit to the edit
  page. The account-type cards list "Suggest changes to entries" for every
  type. Enforced by `public.suggest_entry_change` (a member of a tree the
  entry is shown on who can't edit it; keeps only what differs, a date with
  its precision and a place with its labels; tries the result against every
  check on `people`, then undoes it), `public.decide_entry_suggestion`
  (`private.can_edit_person`, the `people_update` rule), `entry_suggestions`
  RLS (read by the suggester and whoever may edit; deleted by the suggester
  while it waits; written by nothing else) and `notifications.suggestion_id`
  (a withdrawn or replaced suggestion takes its notices with it). Photos,
  connections, lineage and contact details aren't suggested. Decided without
  asking: who's asked (the owner and the home tree's Roots, as the brief
  says; a Branch who may edit answers from the card), accepting all of a
  suggestion or none, and the suggester's name kept as it was then (a
  reviewer on the home tree may not see a member of another tree's profile).
  `timeAgo` is shared now (`lib/time-ago.ts`), and the edit page's access and
  form values moved to `entryAccess` and `personFormValues`, which the new
  page uses too. **Verified:** rehearsed on live in a rolled-back
  transaction with a throwaway tree of a Root, a Branch, two Leaves and an
  outsider: suggesting stored only the changed details and what they were,
  asked the Root once (owner and Root the same person), and the trial left
  the entry, its notices and revisions untouched; suggesting again replaced
  it and its notice; thirteen refusals held (their own entry, a Root on
  their own tree, nothing changed, email, lineage, not a member, a month's
  precision on the 12th, no name, 30 February, an unknown sex, a missing
  place, a 501-character note, a direct insert); only the suggester, the
  Root and the Branch saw it, a Leaf couldn't withdraw another's, and nobody
  could change it directly; the Root accepting changed the entry and told
  the suggester; the Branch accepting also left the Root an
  `entry_updated` notice with the undo; declining changed nothing; an owner
  who added the entry was asked beside the Root and could accept; an entry
  changed so the suggestion no longer fit refused it; withdrawing took its
  notices. Applied: the recorded statement's md5 equals the file's, the
  three function bodies' md5s match, and the suite ran the same on live,
  rolled back. End to end on live in headless Chrome as a throwaway Leaf and
  Root of a throwaway tree (deleted after, auth users included): the Leaf's
  sheet offered **Fill in what’s missing** and **Suggest a change**, no
  **Edit entry**; the form sent 5 → 12 March 1931 with a note, and the card
  showed it with **Withdraw**; the form reopened on it; the Root's bell and
  card showed it with **Accept** / **Decline**; accepting set 12 March 1931
  and the Leaf was told; a second suggestion was withdrawn; a third was
  declined from the bell and the entry kept its name; the answered notices
  show the change as made and who answered; at 390 px and in dark mode the
  sheet and the form's bar hold; the Leaf's **Edit entry** address on the
  Root's own entry landed on the form, and the Root's suggestion address on
  the edit page. 1044 tests pass (19 new); tsc, lint and `next build` are
  clean.

- **Step 65 — A hand-added place can be a companion's place of birth**
  (ad-hoc; migration `20260928080000_pets_place_of_birth_bigint`, live
  2026-09-28; no code change). `pets.place_id_birth` was `integer` (since
  `20260903130000_companion_birthplace_geonames`), but `places.id` is
  `bigint` and a Root's **Add a place** numbers from 10,000,000,000, so
  choosing a hand-added place, such as Shishang (10000000000, Step 64), as
  a companion's place of birth failed on save: out of range for `integer`
  (`22003`) in the database, "Couldn't save this companion. Check the
  fields and try again." in the form. The column is `bigint` now, like
  every other column holding a place id (a person's two,
  `historical_names`', `tree_people`'s). Only its FK
  (`pets_place_id_birth_fkey`, on delete set null) and its
  index depended on it, and both were rebuilt under their own names; no
  view, policy, trigger or function names it. The app already sends and
  reads a plain number (the form's `.int()` takes 10000000000), and the
  regenerated types are byte-identical (`integer` and `bigint` are both
  `number`). **Verified:** rehearsed on live in a rolled-back transaction:
  before it, a bare insert, `addPet`'s insert and `updatePet`'s update as a
  Root through RLS all failed with `22003`; after it, each stored
  10000000000, a GeoNames id still saved, the FK refused an id with no
  place (`23503`), and deleting a place still emptied the pet's.
  Constraints, indexes, triggers, policies, grants and the md5 of all 8
  rows were unchanged. Applied through the MCP (its row renamed from
  `20260928080619`; the recorded statement's md5 equals the file's), then
  checked again on live, rolled back; `db push --dry-run` is up to date.
  Through PostgREST, filtering `pets` on 10000000000 answers 200, where an
  `integer` column still answers `22003`.

- **Step 64 — Add a missing village from the place search** (ad-hoc, no
  migration). Aalim "wasn't able to add
  https://villageinfo.org/village/513810 as a place of birth": Shishang, a
  village in Kalavad taluka, Jamnagar, Gujarat, where Amarshi Sayani was
  born. `places` is GeoNames' cities500, which leaves out places under 500
  people or with no count; GeoNames has this one as Sisāng (1256004), with
  none, so "Sisaing", "Shishang" and "Kalavad taluka" found nothing, and
  Amarshi was saved as born in Jamnagar. The one way in for a missing place,
  a Root's **Can’t find it? Add a place** under the field, went unseen at
  first (minutes after reporting it Aalim found it, added "Shishang, India"
  and moved Amarshi and Jiwan Sayani there). Now, when a Root's search comes
  back empty, the list itself offers **Add “Shishang”**, which closes the
  list and opens **Add a place** with the name filled in; the link under the
  field stays. A pasted link (how Aalim pinned the village down) is never
  searched and never becomes a place's name: the list says "Type the place’s
  name, not a link." While a place is already chosen the list still shows
  it, so the note ("No matching place.", or the link one) and **Add** now
  sit under it, rather than the search looking as if it matched the old
  place. The rules are `isLink` / `unmatchedSearch` in
  `lib/place-choice.ts`; the picker's open state is now controlled so
  **Add** can close the list. Leaves and Branches still see only "No
  matching place." **Verified:** end to end on live as a throwaway Root
  (deleted after, auth user included), at desktop and phone size in the
  pane: a search that found nothing listed "No matching place." and **Add
  “Zzvillagesixtyfour”**, which opened **Add a place** with that name
  (cancelled, so nothing reached `places`); with Jamnagar chosen the list
  showed Jamnagar, the note and **Add**; the villageinfo.org link showed the
  link note, no **Add** and sent no search, and **Can’t find it?** after it
  opened the dialog with the name empty; "Shishang" listed Shishang, India
  and Shishang, China and no **Add**; arrow keys and Enter still pick, and
  Escape or a click outside still closes the list and puts the chosen place
  back. 1025 tests pass (6 new); tsc, lint and `next build` are clean.

- **Step 63 — A birthday or a wedding anniversary without its year**
  (ad-hoc; migration `20260928001000_dates_without_a_year`, live
  2026-09-28, before the code). Aalim asked that someone "should be able to
  add day and month without year for birthdays/anniversaries". A date of
  birth, and a marriage date, can now be a day and month with the year box
  left empty; a month alone asks "Add the day, or the year." (a marriage's,
  "Add the day."). Death and divorce dates still need their year. A `date`
  always has a year, so the pair is kept apart, and only while there's no
  date: `people.birth_month` / `birth_day` and
  `relationships.marriage_month` / `marriage_day`, CHECKed (both or neither,
  a day that's in the month, 29 February allowed, spouse lines only). With no
  `date_of_birth` behind them, everything that reads a birth year
  (lifespans, search, sibling order, period place names, claim and invite
  matching) sees none and is unchanged. The details show "Date of birth
  5 March" and "Married 4 July", the leaf's hover card and the welcome line
  ("Born 12 March") too, and the forms open them again as day and month.
  **Upcoming** counts them, titled **Birthday** and **Anniversary** with no
  age or count of years. Adding, editing, connecting (`connect_people` gains
  two trailing arguments; the app before it still reaches it) and filling
  in what's missing (a birthday fills the date of birth, which then isn't
  blank) all save them; a Root can undo them (`revision_fields`), and
  changing one is a date-of-birth change in the edit notice. `tree_people`
  and `tree_edges` carry the pair as trailing columns. The five functions
  are their live bodies (md5-checked against their files first) with only
  those lines changed. **Verified:** rehearsed on live in a rolled-back
  transaction together with Step 62's migration after it: the function
  bodies matched the file by md5, both views kept their grants, options and
  owner, a Root saw the same 83 people and 164 lines, and as that Root
  `add_people_with_connections` stored a 29 February birthday and a 4 July
  wedding day with no date, `connect_people` a 25 December one (and still
  took the old arguments alone), `fill_person_blanks` filled 5 March into an
  empty date of birth and then refused a date (not blank), and the checks
  refused 30 February, 31 April, a date with a birthday, and wedding fields
  on a parent line (a first run let a month with no day through: a null
  comparison passes a check, so both columns are now required by name, and
  a second rehearsal refused it). Applied, the recorded statement's md5
  equals the file's. End to end on live, as a throwaway Root of a throwaway
  two-person tree, in Chrome (all deleted after, auth user included): the
  edit form said "Add the day, or the year." for a month alone and saved
  5 March with no year; the details showed it; the spouse row saved "Married
  4 July"; **Upcoming** listed "Birthday · Fri 5 Mar" (March 2027) and
  "Anniversary · Sun 4 Jul" (July 2027); Add a relative saved a child born
  12 December; the edit form reopened 05 / March / no year. 1019 tests pass
  (16 new); tsc, lint and `next build` are clean.

- **Step 62 — Edit entry in the details sheet's header; verification
  removed** (ad-hoc; migration `20260928002000_remove_entry_verification`,
  applied 2026-09-28 once this code was live). Aalim asked to "move the edit entry
  button for the side-panel view to the header of the side panel, delete
  'verification' altogether." **Edit entry** (a pencil and the words) now
  sits in the sheet's header, under the name and badges, with or without a
  photo; a Leaf who may only fill blanks sees **Fill in what's missing**
  there instead. Before, it was the first button under **Manage**, the last
  section of the sheet, below documents and comments. **Manage** keeps
  **Reposition photo**, the claim, **Delete entry**, the claim invite and
  the notes, and isn't shown when none of it is the viewer's (a member's own
  entry with no photo had been left a bare heading); the badge row takes no
  room when there are no badges. The rule is in `docs/design-system.md`
  (Layout). **Verification is gone**: the details' **Verified** badge,
  **Mark verified** / **Clear verified** and "Verified by an admin on…",
  the ✓ after the name on person cards and leaves, the admin console's
  **Unverified** count, and `setEntryVerified`. The migration drops
  `set_entry_verified`, `people.verified_at` / `verified_by` (and
  `tree_people`'s copy, the view made again without it, keeping Step 63's
  birthday columns), the one
  `entry_verified` notice sent, and that type from
  `notifications_type_check`. Two entries were marked verified on live.
  **Verified:** on a throwaway preview page (deleted, never committed)
  showing the real sheet with made-up people and no server action let
  through, in headless Chrome at 1024 px and on a 375 px phone, light and
  dark: **Edit entry** sits under the badges (under the photo when there is
  one), a phone's **Add a relative** below it; a Root's **Manage** holds
  **Delete entry** (and **Reposition photo** with a photo); the member's own
  entry without a photo has no **Manage**; a Leaf who can fill blanks sees
  **Fill in what's missing** in the header and the note under **Manage**; a
  locked entry shows no edit button; a read-only sheet shows neither; no
  "verif" anywhere in the sheet. The migration was rehearsed on live in a
  rolled-back transaction: `tree_people` lost only `verified_at`, with the
  same grants, options and owner; a member saw the same 77 people on their
  tree before and after; `person_claim_candidates` still ran; the old type
  was refused (`23514`) and a current one accepted; an entry still updated
  and a new one saved. Applied after the deploy was serving: the recorded
  statement's md5 equals the file's, the app's reads of `tree_people` and
  `tree_edges` answer 200 while the old column answers 400 and the function
  404, and freshly generated types equal `lib/database.types.ts`. 1003 tests
  pass (none new: it's layout and removal); tsc and lint are clean.

- **Step 61 — Efficiency audit, phase 1: auth checked once, one render per
  save, loading and error pages, the audit's bug fixes** (ad-hoc; no
  migration). Aalim asked for an audit of efficiency gaps, redundancies and
  the feel of buttons and page changes ([Ancestree Efficiency
  Audit](https://claude.ai/artifact/MGmcpvsEkFnhWrQ24Xvyjo), 49 findings,
  a four-phase plan), then "take on Phase 1 as the next step".
  **Auth once per request:** `getUser` and `getProfile` asked the Auth
  server each time, uncached: six Auth calls and three reads of one profile
  per load of `/tree`. `getSessionUser` (`lib/auth.ts`) now reads who the
  session's token names with `auth.getClaims()`, which checks it on the
  server against the project's ES256 key (auth-js keeps the key set 10
  minutes), and the proxy does the same; each helper runs once per render
  (`cache()`). `getUser` stays, cached, for what only the Auth server
  knows (a confirmed address on the join pages, the name they joined by).
  **One render per save:** an action that revalidates already sends the
  page back drawn again, and 53 `router.refresh()` calls drew it a second
  time; they're gone, and so is the refresh after Add a relative's
  navigation. Three stay, where the action changed nothing but the page
  may be stale: relay invites answered elsewhere. Nothing is drawn again
  where no page shows the change: opening the bell (the badge clears itself,
  and the account page's list tells it so; `NOTIFICATIONS_READ_EVENT`),
  documents (their list reads itself), and plain comments on entries and
  companions (a flag still redraws its card's count). `revalidatePath`
  stays the tool rather than `refresh()`: it also has pages visited
  earlier fetched afresh when gone back to. `revalidateTreeAndAccount`
  folded into `revalidateTreePages`; `revalidatePath("/admin")`, a redirect
  stub that in 16.3 still redrew the page the action came from, became
  that helper; narrower calls after it went; `deleteInvite` redraws even
  when only the invite's record went.
  **The header streams in on its own** (a Suspense boundary in the root
  layout, with the bar and the mark as its fallback, `SiteHeaderShell`), so
  no page waits for its counts and a page's `loading.tsx` shows at once; a
  failure to read them leaves that bar rather than an error page.
  **Loading, error and not-found pages:** the forms under `/people`,
  `/onboarding`, `/welcome`, `/trees`, `/trees/new`, an invite, a share link
  and `/tree/review` each get a `loading.tsx` shaped like them
  (`components/page-skeletons.tsx`; the review list no longer borrows the
  canvas's), and `/account`'s is now its width with its two columns.
  `app/error.tsx` keeps the header (**Try again**, **Back to tree**, a
  reference matching the server's log), `app/global-error.tsx` covers the
  root layout, and `app/not-found.tsx` says "It doesn't exist, or it's on
  another of your trees."
  **Share links stop showing who has an account:** a share link's read
  (`getTreeGraph` / `getTreePets` with `forPublic`) skips claims and open
  flags and sends no user ids, addresses or storage paths (`NOBODY`, the
  nil UUID, stands in for the ids). Before, a card on a share link showed
  **Claimed**, against Step 19.1, and the claims were read for the whole
  database through the admin client.
  **Bugs:** a save that fails from Add a relative's connection check says
  why in that dialog (it sat behind it), and its button stays busy until
  the tree opens, so a second press can't save twice; a relative's name
  boxes no longer offer the member's own name (only their own entry uses
  the name autocomplete tokens, `self`); the edit page's **Back to tree**
  opens the canvas on that person; `/trees/new` sends a founder to their
  tree's console through the route that switches to it (the link ended in
  `#<slug>`, which matched nothing); **tree** isn't lit beside
  **connections** on `/tree/review` (`lib/nav-active.ts`); the canvas and
  its skeleton fill the screen below the header whatever its height
  (`--site-header-height`; a phone's two-row header had pushed the canvas's
  bottom 26 px below the fold); Add a relative's and the companion picker's
  searches ignore accents like the canvas's ("jose" finds José;
  `foldSearchText`), each list with its own id; `zod` is declared in
  `package.json`. **Verified:** in the app in Chromium, as a throwaway Root
  of a two-person throwaway tree on live (deleted after, with its claim,
  notifications, share link, profile and auth user): the session's token is
  ES256, and a load of `/tree` ran one token check in the proxy and one in
  the page, one profile query and no Auth-server call (a temporary log,
  removed); `/tree`'s first chunk of HTML carries the header's bar and the
  canvas skeleton, and the header and page stream in after; **Mark
  verified** sends one request, whose reply redraws the card; a plain
  comment one request with a 329-byte reply, listed at once; opening the
  bell clears "3 unread" with replies of 139 bytes; **Edit entry** shows
  "Loading the form…" on the way; its **Back to tree** opens the canvas on
  the person; the member's own entry autofills, a relative's and a new
  relative's don't; "jose nunez" finds José Núñez; `/trees/new` lands on
  the console with no stray fragment; a bad entry id gives the not-found
  page, header kept; a temporary throwing page (deleted) gives the error
  page; at 320 px the header is 82 px and the canvas ends at the screen's
  foot; the share link's page payload holds no user id, claim or address;
  the account skeleton matches the page's width. 1003 tests pass (5 new);
  tsc, lint and `next build` are clean.

- **Step 60 — Search & filters under Add a relative, who's here above
  Upcoming** (ad-hoc; no migration). Aalim asked to "move search and
  filters button to below 'add a relative'. keep 'upcoming' there", then to
  move "who's online" above **Upcoming**. The canvas's top right now reads
  **Add a relative**, **Search & filters**, then a Root's **Auto-arrange**;
  the top left reads the faces of who's here, **Upcoming**, then "Is one of
  these you?" and Getting started. A share link or a visitor sees Search &
  filters under the read-only note, and nothing at the top left. Search &
  filters' words show from the same width as Add's (`lg` beside the details
  sheet, else `sm`). The two cards still open one at a time, but the other
  one's button now stays put, and Search & filters keeps which of its
  sections were open. Opened, Search & filters lies over the top-left cards
  where they meet (on a phone, or beside the sheet): React Flow stacks its
  panels in the order they're drawn, so its panel is raised while the card
  is open. On a phone the details sheet now covers Search & filters, as it
  already covered Add a relative; closing or minimizing the details brings
  both back. **Verified:** in the app in Chromium, on a throwaway preview
  page (deleted, never committed) with made-up people and a faked room, no
  server action or Realtime reached: at 1024 px the right-hand column lines
  up; opening Upcoming closes Search & filters and back, its Filters section
  still open; at 800 px beside the details sheet all three buttons fold to
  their symbols and the opened card lies over the end of the Upcoming
  button; on a 375 px phone with "Is one of these you?" and Getting started
  showing, nothing meets the right-hand column, the opened card lies over
  the claim card, Upcoming's card clears the buttons, and nothing scrolls
  sideways; a read-only copy; a Leaf alone (no faces, no Auto-arrange); no
  console errors. 998 tests pass (none new: it's layout); tsc and lint are
  clean.

- **Step 59 — Save changes and Back to tree float beside the edit form**
  (ad-hoc; no migration). Aalim asked for the edit entry form's **Save
  changes** and **Back to tree** to float on the side of the form, so
  they can be used wherever in the form someone is. On the edit entry page
  they now sit together (`FloatingFormActions`): from `lg` up in a column
  just right of the form, level with the page title, staying there as the
  page scrolls; on a phone or tablet in a bar pinned to the bottom of the
  screen, like the header, **Save changes** first. **Back to tree** left
  the title's row. They stay in reach over Documents and Connections too.
  A failed save's message shows by them (above the bar's buttons, under
  the column's), so neither moves. The page ends a bar's height lower so
  the footer clears it, a field given focus scrolls clear of it
  (`scroll-padding-bottom`), and toasts rise above it (the Toaster's
  bottom offsets add `--floating-actions-height`; globals.css). In the
  page's order they still come right after the photo, so the keyboard
  reaches them after the fields. The account page's copy of the form, and
  filling in what's missing, are unchanged. The rule is in
  `docs/design-system.md` (Layout). **Verified:** in the app in Chromium,
  on a throwaway preview page (deleted, never committed) showing the real
  form and connections with made-up people and no server action let
  through: at 1280 and 1024 px the column sits 24 px right of the form,
  level with the title, and stays put scrolled to the bottom; on a 375 px
  phone the bar is 57 px, the buttons line up with the fields, nothing
  scrolls sideways, and at the bottom the footer ends where the bar
  begins; a 768 px tablet in dark mode; pressing the floating **Save
  changes** submits the form ("Saving…"); a toast lands 16 px above the
  bar; the message leaves the buttons where they were; focusing a field
  hidden under the bar scrolls it into view; Tab goes photo, **Save
  changes**, **Back to tree**, Documents; without a way back the form ends
  with **Save changes** as before; no console or server errors. On top of
  Step 57, 998 tests pass (none new: it's layout); tsc and lint are clean.

- **Step 58 — A plainer entry form** (ad-hoc; no migration). Aalim marked
  up "Add a relative" and struck its explanations: "this kind of details are
  exhausting and completely unnecessary. they just take up space and make it
  more intimidating than it needs to be for a green user". The form is now
  its title, "* Required", the names, "This person is deceased", the invite
  (its line kept, as Aalim left it), **Connect to the family tree** with
  nothing under the heading, and **Add more details**. Gone: the subtitle,
  the card's "Relative's entry" and "Only a name and a connection are
  required.", "Their details", "Connect them to someone… Missing someone in
  between?…" and a Root's "Optional for Roots.", the line under **Add more
  details**, "All optional.", "Reads top to bottom…" and "so they appear
  together as siblings". **Add someone in between** still sits behind **Add
  more details**, now with nothing pointing there. A Leaf's and a
  married-in member's rule are one sentence each. **Maiden name** is a "+"
  link beside **Middle name** and **Preferred name**, as Aalim drew it
  (`PersonNameFields`), not a box among the details, so the welcome (Step
  50) no longer counts it as missing. Every form sharing these fields lost
  the same kind of line: under preferred and maiden name, the dates ("A
  year on its own is fine."), place of birth, email and lineage, and the
  photo picker's file types (on pets too). Adding yourself loses "Your
  details" and its intro; the edit page says something only when the
  entry's home is another tree; filling in shows just the form, or
  "Nothing left to fill in.". The rule is in `docs/design-system.md`
  (Wording, "Forms: labels, not explanations"). **Verified:** in the app in
  Chromium, on a throwaway preview page (deleted, never committed) showing
  the real components with made-up people: the relative form as a Root, a
  Leaf and a member who married in; "+ Maiden name" opens its box, focused,
  and leaves the other two links; a sibling's "Also connect to …'s parents
  (…)."; **Add more details** puts focus on its heading, now heard and not
  seen; adding yourself; editing an entry with a maiden name shows the
  box, and filling one in offers the link; on a 375 px phone the three
  links wrap and nothing scrolls sideways; no console or server errors.
  Tests: the welcome's asks, a maiden name never missing. 954 tests pass;
  tsc and lint are clean.

- **Step 57 — Upcoming birthdays & anniversaries, a descendants filter, and
  who's here** (ad-hoc; migration `20260927160740_tree_presence`). Aalim asked for three things on the tree page. **57.1 Upcoming:**
  a card beside Search & filters listing birthdays and anniversaries over
  the next twelve months, following the side and descendants filters and a
  search (see **Upcoming**). **57.2 Only descendants of:** one or two people
  under Filters; the canvas draws them, their descendants and whom those
  married, keeping the whole tree's generation names (see **Only descendants
  of**). **57.3 Who's here:** faces of the other members with the tree open,
  and their pointers on the canvas, over a members-only private Realtime
  channel; nothing stored (see **Who's here**); `/privacy` says so. Aalim
  chose (2026-09-26): twelve months, whole birth dates, the living only,
  members only; two people draw both lines. **Verified:** in Chromium on a
  throwaway page with made-up people (deleted, never committed): the feed
  (today, tomorrow, this week, months; a month-only birth date and the dead
  left out), the feed and canvas narrowed by the Root's side and by a
  descendants pick with the "Filtered" chip, a 390 px phone, and the faces
  and pointers drawn from a faked room (above the cards, beside the right
  card, a face panning to its pointer, an away face dimmed); with no room
  reachable the page carries on without errors. Tests: occasions, the
  descendants walk, the layout's `generations`, and `lib/presence.ts`
  (colours, send rate, anchoring, parsing, peers). 998 tests pass; tsc and
  lint are clean. The migration was applied on 27 Sep without a rehearsal:
  the connector's SQL was read-only that day, so no rolled-back transaction
  could be run. It adds only a function and two policies (`realtime.messages`
  had none). The file is named for the version it was recorded under, and
  the function body's md5 matches it; `authenticated` and `service_role` can
  call it, `anon` and `public` can't. **Verified end to end** on 27 Sep
  against the live project, from this branch's dev server, with throwaway
  accounts and a made-up tree (all deleted afterwards and checked gone;
  never committed), recorded side by side: two members each saw the other's
  face; each pointer landed at the same spot on the same card on the other
  screen; with one member filtered to a person's descendants the other's
  pointer still sat beside the same card and vanished on a card the filter
  hid; a pointer over the Search card or off the canvas vanished; a tab put
  in the background dimmed its face and took its pointer away, and coming
  back undid both; clicking a face panned to that member's pointer. A
  signed-in non-member was refused the channel ("Unauthorized: You do not
  have permissions to read from this Channel topic") and heard nothing.
  Their REST broadcasts to it, private or public, were accepted (202) but
  never reached a member, and a member's did. The very first private join on
  the project failed once with `MissingPartition` while Realtime made the
  day's `realtime.messages` partition; realtime-js rejoined by itself, and it
  hasn't recurred. No code change was needed. **Still to do:** consider
  switching Realtime to private channels only in the dashboard.

- **Step 56.5 — Trees on the dashboard's Overview** (ad-hoc, after Step
  56; no migration). Aalim asked to replace "Active in the last 30 days"
  with the number of trees. The Overview's third tile is now **Trees**:
  how many there are, and how many were founded in the last 7 days
  ("1 new in the last 7 days"), read off the Trees card's rows
  (`headlineTiles`). The 30-day count is gone from the app's shapes
  (`readDashboard`); `engagement_dashboard()` still sends `active_30`,
  unread, until the function next changes. **Verified:** on a throwaway
  preview page (deleted, never committed) the Overview read Members 9,
  Active in the last 7 days 9, Trees 2 ("1 new in the last 7 days"),
  Entries 101. Tests: the tiles, and which trees count as new (the day 7
  days back does, the day before doesn't). 954 tests pass; tsc and lint
  are clean.

- **Step 56 — An engagement dashboard for the beta reviewers** (ad-hoc;
  migration `20260926030000_engagement_dashboard`). Aalim asked for a
  dashboard of high-level engagement, on its own tab of the account page,
  for Aalim's and Raiya's accounts. **Now** the account page has a
  **dashboard** view (`?view=dashboard`) for the beta reviewers
  (`private.beta_reviewers`, who are those two), between admin and
  settings; for anyone else the tab isn't there and the address shows
  their profile. It counts across every tree and never names a person:
  members, active in the last 7 and 30 days (against the week before),
  entries; members active each week, as columns with the numbers in a table
  under them; how many members have their own entry, added a relative,
  invited someone, came back another day; what members did in the last 7
  days, the 7 before and ever (entries, connections, photos, documents,
  comments, companions, claims, invites, joins, requests); and each tree's
  members, active members, entries, additions and last active day.
  `engagement_dashboard()` builds it in one call (about 30 ms) and refuses
  anyone but a reviewer (`NOT_A_REVIEWER`). Nothing recorded who used the
  site on a given day, so **`private.active_days`** does now: the proxy
  notes a signed-in member's day through `note_active_day()` in the
  background, once a day on each server (`NotedToday`), and the days before
  were rebuilt from sign-ins, token refreshes and every kind of addition or
  answer, so a week before 26 Sep only counts days someone signed in or did
  something. A member's days go with their profile. `/privacy` names the
  record and what the site's owners see. Days, weeks and "the last 7 days"
  run in UTC, ending today. The chart's one series is blue, `--chart-1`
  (both themes clear 3:1 on the card; `docs/design-system.md`, Charts).
  Defaults, not yet Aalim's choices: the reviewers' list decides who sees
  it, so a reviewer added later does too; tree names are shown (request
  access already reveals them), people never are. **Verified:** rehearsed
  in a rolled-back transaction (a reviewer reads it; a member is refused
  `42501`; neither function answers signed out; a member is noted once a
  day, someone without a profile not at all; a reviewer still can't read
  the table), applied, recorded row renamed, and every function body's md5
  matches the file. In the app in Chromium, on a throwaway page (deleted,
  never committed) with numbers from the rehearsal: light, dark and a
  375 px phone, where every other week keeps its label and the page never
  scrolls sideways, and a column's tooltip on hover. A throwaway member
  (`delivered+step56@resend.dev`, a profile and no tree) signed in: the
  proxy noted their day, the toggle showed only profile and settings,
  `?view=dashboard` showed their profile (the dashboard wasn't in the RSC
  payload either), and over PostgREST with their own token the dashboard
  answered 403 `NOT_A_REVIEWER` and `note_active_day` 200 `true`; signed
  out, both 401. All of it deleted after. Tests: `readDashboard` and the
  wording (18), `NotedToday` and `utcDay` (4). 953 tests pass; tsc and
  lint are clean.

- **Step 55.1 — The add form warns before a missing blood tie** (ad-hoc,
  after Step 55; no migration). "Add a relative" and adding yourself on
  onboarding now say it under **How they connect** as soon as what's on
  the form would be refused: "Only blood relatives and their partners can
  be added. {Picked} isn't a blood relative, so connect {name} to someone
  who is, too." when {name} hangs off the person they picked, or "Connect
  {name} to someone born into this family, too." further down a chain, and
  "Connect yourself to someone born
  into this family, as their child, parent, sibling or partner." for the
  member's own entry. It goes as soon as the form would pass. Aalim's
  choices: both forms, the rule first, never blocking. It judges the exact
  lines the submit sends, by the rule the database uses:
  `lib/connections.ts#flowEdges` now builds them for both (the chain, a new
  sibling's parents, ticked co-parents, further connections),
  `lib/bloodline.ts#newWithoutBloodTie` runs Step 55's check over the tree's
  anchors and lines plus those, and `bloodTieWarning` words it. The pages
  load the tree with `getBloodline`: every anchor (not the canvas's first
  two) and `tree_edges`; if either can't be read the form says nothing. The
  Add button still works, since a question at submit ("Is {partner} also a
  parent?") can draw the missing line and the database has the last word.
  On a tree with anchors, connecting a new entry is no longer optional for
  a Root, as Step 55 refuses an unconnected one: the toggle and "Optional
  for Roots." are gone there. The founder's first run is unchanged, as
  their tree has no anchors until they add themselves. **Verified:** in the
  app in Chromium, run signed out with dummy Supabase keys, on a throwaway
  preview page (deleted, never committed) showing the form with made-up
  people: a new entry as the child of someone who married in, with their
  blood partner ticked, no warning; switched to "is parent of", the
  warning naming both; switched back, gone. A newcomer as that person's
  child was fine until the blood partner was unticked, then got the
  "yourself" wording with **Add me to the tree** still enabled. A Root saw
  no "Connect this entry…" toggle, and the console showed no errors. Tests:
  `flowEdges` (6, the submit's lines), `newWithoutBloodTie` (5, the add
  found on live among them) and `bloodTieWarning` (3). 931 tests pass;
  tsc and lint are clean.

- **Step 55 — Everyone added needs a blood tie** (ad-hoc bug fix; migration
  `20260925223750_everyone_added_needs_a_blood_tie`, whose comments call it
  Step 53, the number it had when it was applied; Steps 53 and 54 reached
  main first). A Root added someone as the mother of a person who married
  into the family, with no line to anyone born into it. On another tree,
  its Root had added someone as the child of a woman who married in, the
  same way. The bloodline gate (Step 14) held only a member who had
  married in themselves, so Roots, blood members and a newcomer adding
  themselves could hang anyone off an in-law. Aalim's rule: a direct
  bloodline tie first, whoever is adding, Roots included. **Now** every new
  entry on a tree with anchors must, once its lines are drawn, be blood or
  have a line straight to someone who is: a partner, or the other parent of
  a blood child (`private.without_blood_tie`). Anyone reachable only through
  someone who married in is refused — their parents, siblings, a child from
  another relationship, a later partner — and so is a Root seeding someone
  with no lines at all. Bringing people over from another tree
  (`place_people`) is held to it across the whole batch, a member's own
  entry that waits for their yes counting as there; the placement made on
  accepting an invite isn't. A sibling line now carries blood
  (`private.blood_ids`, read by `private.bloodline_ids`): a blood relative's
  brother or sister is blood, so their partner and children can follow.
  Branches still walk parent lines only (`lib/bloodline.ts#upThenDownIds`,
  for `lib/branch.ts`, as `private.branch_ids`). Step 14.2's allowance for
  a married-in member's own descendants, whoever the other parent, goes:
  their child is blood once the blood partner is named too, which the add
  flow ticks for a current partner. The refusal, `BLOODLINE_GATE: <name> has
  no blood tie to this tree` with the detail saying which new entry or
  which id, is read by `lib/bloodline.ts#readBloodTieRefusal`: "{Name} isn't
  connected to anyone born into this family. Connect them to a blood
  relative too."; "Connect yourself to someone born into this family, as
  their child, parent, sibling or partner." for a member adding themselves;
  and, bringing people over, "… Bring them with a blood relative they're
  connected to." The add flow's old "tree of your own" answer went, and
  `/people/new` still says so up front to a member who married in, now as
  "your partner's relatives and the children you share". On live, the
  mother first added and her daughter became blood through the sibling
  line the Root drew afterwards from her to a blood ancestor (the first
  tree's blood count 58 → 60), and no member's growth rights changed. The
  child on the other tree is the only entry on any tree without a blood
  tie, left for that tree's Root.
  **Verified:** rehearsed on live in one statement that raised at the end,
  so nothing was kept (no record, functions or entries left): 26 cases run
  as real members before and after, the rehearsed bodies' md5 matching the
  file. 13 went from allowed to refused: the add found on live as it
  happened (the later sibling line taken out first), a Root seeding, an
  in-law's parent, partner and child alone, a child of a new partner
  alone, a Branch, a newcomer adding themselves under an in-law, the other
  tree's case and a partner for its married-in mother, and three
  placements (that child again, and two people brought from the first
  tree alone). A Leaf's in-law went from `OWN_LINE`
  to the new refusal. The other 12 came out the same: partners and
  co-parents of blood relatives, a child with the blood parent named, a
  sibling and then their child, a newcomer as a partner, a Leaf's own
  child, and batches tied by a relative in the same batch, one a member
  still to say yes. The same cases passed first on a local Postgres 16 copy
  with live's shapes and helpers. Then applied: `apply_migration` recorded
  it as `20260925223750`, not the name's version, so the file is renamed to
  match; bodies md5-matched, grants unchanged. The migration's opening
  comment was reworded afterwards to leave relatives' names out of this
  public repo; its SQL is as applied. Tests:
  `lib/bloodline.test.ts` (35, both cases found on live among them), and
  the Branch suite passes unchanged. 917 tests pass; tsc and lint are
  clean.

- **Step 54 — A yellow "Add someone in between" button** (ad-hoc; no
  migration). Aalim missed the button that adds the people between a new
  entry and the relative it connects to (a parent between you and your
  grandfather), on the add-yourself form and under the add-a-relative
  form's **Add more details**: an outline button among outline boxes. It's
  now yolk yellow with dark amber text, from a new `--attention` token pair
  in `globals.css` (over 8:1 in both themes) and the Button's `attention`
  variant. Yellow, not red: red means delete, and the in-between person's
  **Remove** sits beside it in red. Checked in both themes on a throwaway
  fixture page, since deleted.

- **Step 53 — Sign in with an emailed code instead of a link** (ad-hoc; no
  migration). Aalim asked why a family-link joiner had to tap "Accept &
  open the tree" on `/auth/confirm` before the welcome: that button kept
  mail scanners from spending the link (Step 20). Sign-in emails now carry
  an 8-digit code (the project's `mailer_otp_length`) instead: in the
  subject ("{code} is your ancestree code") and once in the body, unbroken
  and selectable in one tap, with no link or button. He asked for a copy
  button in the email; email apps run no scripts, so instead the page's
  code box (`SignInCodeForm`) takes a paste however it's spaced, offers
  Safari's one-time-code fill from Apple Mail, and sends itself once the
  code is whole. `/join`, a bare or family link's form and the invite
  page's **Email me a code** (for an address with an account) all turn
  into it after sending; **Send a new code** and **Use another email**
  sit under it. Entering it does what the link did
  (`completeCodeSignIn` → `establishMembership`): a family-link newcomer
  lands on onboarding, and an existing account accepting an emailed invite
  joins at once instead of coming back to **Join <Tree>**. Links already
  sent still work through `/auth/confirm`. Checked on the live project
  with throwaway accounts: family link → name and email → code → "Welcome,
  {name}" as a Leaf (1 of 5 counted and logged); a wrong code refused in
  place; an emailed invite to an existing account joined from the code;
  `/join` → code → the Root's first run; the one-a-minute limit worded on
  the form and on the code box. Templates pushed with `npm run
  email:push` after the deploy.

- **Step 52 — A family link for Roots: capped, rotatable, tracks who
  joined** (ad-hoc; migration `20260925150000_family_link`). The
  single-use bare link ("Create invite link", open to every member) is
  replaced by a **family link**: one open link per tree that only a Root
  makes, meant to be dropped into a family WhatsApp group for everyone to
  join from. Aalim asked for it capped by the Root, at most 20 joins before
  it must be rotated, rotatable like an API key, and tracking who used it;
  his answers: no expiry, and every Root is told of each join. The admin
  console's **Family Link** card (Invites) makes it with a cap of 1 to 20,
  shows "3 of 20 joined · made by {Root} on {date}", **Copy**,
  **WhatsApp** (opens `wa.me` with "Join {tree} on ancestree: {link}"),
  the cap picker, **Rotate** (fresh token and count; the old link dies at
  once) and **Turn off**, and lists who joined with it (account type there
  now, **Left** once gone, "earlier link" after a rotation). Full, it says
  so and nobody else gets in until the cap is raised or it's rotated.
  Joining works as a bare link did (the name-and-email form signed out,
  **Join** signed in, as a Leaf invited by that Root); a member already on
  the tree isn't counted and is told "You're already on {tree}" with
  **Open {tree}**. Each Root gets "{Name} joined {tree} with the family
  link (1 of 3)." with **View family link**. Branches and Leaves now invite
  by email only ("For a link to share in a family group chat, ask a
  Root."), and `invites_guard` refuses an open invite from anyone but a
  Root; links already out work until they expire (**Bare Invite Links**
  shows while any are left). DB: `invites.max_uses` / `use_count` (checks,
  one per tree), `private.family_link_joins`, `rotate_family_link`,
  `set_family_link_cap`, `family_link_joins`, `family_link_guard`
  (security invoker: no API write makes, re-caps, recounts or re-tokens
  one), `invite_preview` hides a full one, `redeem_invite` counts, logs and
  keeps it (otherwise Step 51's body, address check included), and the
  `joined_by_link` notice. **Verified:** rehearsed rolled back on live
  with throwaway users, 6 checks before and after and 54 after: a bare
  link, an emailed invite at another address, a Root's bare insert and
  archiving came out the same, and a Leaf's bare insert went from allowed
  to refused.
  A Leaf, another tree's Root and anon couldn't rotate or re-cap; caps 0,
  21 and 25 were refused; every direct write (insert, count, cap, token,
  turning one back into a single-use invite) was refused even for a Root;
  a second link and one bound to an address broke the index and check. A
  member redeemed uncounted, three newcomers filled a cap of 3 (the last
  "now full"), a member from another tree was placed with the reworded
  `placed_on_join` notice, a fourth was refused with nothing written until
  the cap was raised, rotating killed the old token and credited the
  rotating Root, turning off kept the log, and only Roots read it. Applied
  and recorded under the file's version (stored SQL md5 = the file's);
  all eight function bodies md5-match. In the browser with throwaway
  accounts, since deleted: a Root made a link (cap 3); a newcomer opened it
  signed out on a fresh host, filled the form, and the real sign-in email
  (read back from Resend) joined them as a Leaf on onboarding, counted 1
  of 3, with the Root's notice and its button landing on the card; their
  account page offered only the email invite; the Root opening their own
  link saw "You're already on" and stayed uncounted; cap 1 showed Full and
  the link "Invite not available"; raising the cap reopened it; Rotate
  killed the old link; Turn off kept the list; a phone-width card fit.
  883 tests pass (`lib/family-link.test.ts` new).
- **Step 42 — A member can't make someone else's entry their own**
  (ad-hoc security fix, found during Step 41.5; migration
  `20260923160000_members_cant_set_own_entry`, live since 2026-09-23; its
  file reached main only after Step 51). `authenticated` held INSERT
  and UPDATE on every column of `profiles`, and `profiles_update` only asked
  that the row be the member's own. So any member could set their own
  `self_person_id` to any entry's id, and everything that asks "is this the
  person themselves" (`private.self_person_id()`) believed it:
  `can_edit_person` let them edit that entry on any tree they're on;
  `document_rule_in` (so `can_see_document` and the documents bucket) let
  them read its private documents, and the photo policies let them replace
  or delete its photo, on any tree at all, given its id; and
  `profiles_seed_self_email` copied their address onto it. They could set
  `invited_by_user_id` too, and a signed-in account with no profile could
  insert one naming any entry and any inviter. **Now** a member may update
  only `display_name` (`updateDisplayName`) and `relatives_can_ask`
  (`setRelativesCanAsk`) on their own row, and can't insert a profile at
  all (`profiles_insert` dropped; `redeem_invite` and `ensure_profile` make
  them). Behind the grants, `profiles_guard` refuses a change to
  `self_person_id` or `invited_by_user_id`, or an insert, made as
  `authenticated` or `anon`, so the links hold even if a grant comes back.
  It tells writers apart by `current_user`, not the
  `ancestree.privileged_profile_write` flag: the RPCs that set the links
  (`add_people_with_connections`, `claim_person_as_self` and
  `private.claim_as_self`, `claim_person`, `redeem_invite`, `resolve_claim`,
  `delete_tree`) are security definer and run as their owner, and `on
  delete set null` runs as the table's owner, while most of them never set
  the flag. So no RPC changed, and no journey's taps or fields change.
  **Verified:** rehearsed rolled back on live in three phases (before,
  grants only, all), 32 checks each. Before: a Leaf pointed their own entry
  at a relative a Root had added, renamed it and had their address seeded
  onto it, and read its private document; a member of another tree only
  read that document too and passed `can_edit_person` for it; a signed-in
  account with no profile inserted one naming it. Grants only: all
  refused, but with UPDATE granted back the takeover worked again. All:
  refused even then (`OWN_ENTRY`). In every phase renaming, the relatives
  box, onboarding (adding yourself, "that's me"), accepting a plain, claim
  or founder invite, "This is me", the co-admin sign-in, reversing a claim,
  deleting a tree, a Root deleting a member's own entry, removing a member
  and the service role deleting a profile (the last two clearing
  `invited_by_user_id`) worked as before. Applied and recorded under the
  file's version; the guard's md5 matches the file, the writer RPCs are
  unchanged, and the suite re-run on live matched. Through the live REST
  API with throwaway `delivered+42-*@resend.dev` accounts, renaming and the
  box answered 204, and setting either link (alone or with a rename) or
  inserting a profile answered 403 `42501`. **Audit:** nothing on live shows
  the hole was used. Every member's own entry is one they made and own
  (onboarding) or hold an approved claim on (Ashif, Aly, Rehan; Aly's and
  Rehan's with the invite's vouch). No entry is two members', every entry
  carrying a member's address is their own, and every `invited_by_user_id`
  matches the membership its invite made (Lucan White's names Aalim, who
  sent his founder invite; as his tree's founder, his membership names
  nobody). The API log (its last 24 hours) shows profile writes only from
  the app's server. `profiles` keeps no history, so a link set and set back
  on an entry that already had an address would leave no trace. 784 tests
  pass. Found on the way and left for its own step (fixed in Step 45):
  `remove_tree_member` fails for any member who has added an entry ("Only a
  card's position can be changed here"). It hands their
  `tree_placements.placed_by` to the Root without the privileged flag,
  which `tree_placements_guard` refuses, with or without this step.

- **Step 51 — An emailed invite joins only the address it was sent to**
  (ad-hoc; migration `20260925120000_emailed_invite_joins_its_address`).
  An invite emailed to someone was bound to that address only when it was
  opened signed out. Signed in with a profile, `/join/<token>` offered
  **Join** without comparing addresses, and `redeem_invite` didn't look
  either, so whoever was signed in took it: a member who opened a
  forwarded email, anyone on a shared device, a Root checking a claim
  invite they'd sent. For a claim invite that meant its entry, claimed
  outright (Step 30.2) or folded into their own (Step 41.3). The rehearsal
  showed a Root doing it silently merged the invitee's entry into their
  own. Aalim's choice: only the invited address may accept, and anyone
  else sees whose it is, with **Sign out**. Now `redeem_invite` refuses any
  other account, verified address compared in any case, before it writes
  anything. Its body is otherwise Step 41.3's, and `redeem_invite_tree` is
  unchanged. The page shows a member at another address "{Inviter} invited
  {address} to join {tree} and claim the entry for {name}. You're signed in
  as {yours}. Only {address} can accept it." and **Sign out**, which comes
  back to the invite signed out, where the usual path for that address
  takes over. A stale **Join** says "This invite was sent to another email
  address." and redraws the page. A sign-in link with `invite=` added
  lands on the invite's page. Bare links, founder invites to their own
  address and every accept path at the right address work as before.
  **Verified:** rehearsed in a rolled-back transaction on live, 19 checks
  before and after. Another newcomer, another member, the Root who sent it,
  a founder invite at another address, an unverified address and a direct
  `redeem_invite` call went from allowed to refused. The 30.2 claim, 41.3
  merge and beside, 30.9 placement, founder, bare links, a mixed-case
  address, notices and `redeem_invite_tree`'s keys came out the same, and
  a refusal left nothing behind. Then applied, md5-matched, grants
  unchanged. With a real session on live, both RPCs answered 403 `42501`.
  In the browser with throwaway accounts, since deleted: a doctored
  sign-in link landed on the card with the invite still live, a bare link
  still offered **Join**, and a stale **Join** after switching accounts
  toasted and redrew as the card. **Sign out** led to "Email me a sign-in
  link" for an address with an account and the accept form for a
  newcomer. The matching member's **Join** merged into their entry and
  greeted them on `/welcome?returning=1`, and the newcomer's accept
  claimed their entry and landed on `/welcome`. Tests:
  `lib/invite-address.test.ts`, and `lib/sign-in.server.test.ts` for the
  refusal's reason and where it lands.
- **Step 50 — A welcome, then your details, after claiming your entry**
  (ad-hoc; migration `20260925090000_redeem_says_what_it_claimed`). Aalim
  asked that someone added to a tree and invited to claim their entry be
  welcomed first, and asked to add details. Accepting a claim invite used
  to drop them straight onto the canvas. Now it lands on `/welcome`: "Welcome,
  {name}", "{Inviter} added you to {tree}. Add a photo and what's
  missing." Under that is their entry as the relative left it: photo or
  initials, name, and "née …, born 12 March 1960 in Kampala, Uganda", with
  **Change** to correct any of it. Below come a photo and whatever else is
  empty; a middle or preferred name is offered as a link, never counted
  missing. **Save and see the tree** saves and opens the tree on them;
  **Skip for now** just opens it. The line at the top follows what they
  type and the photo they pick. Aalim's choices: a page before the tree
  (not a box over it, or a line in their panel); the photo and blanks up
  front with the rest behind Change; no reminder later; and the welcome
  also for newcomers who claim their entry on onboarding (which used to
  toast "Welcome back") and for members who accept a claim invite. Those
  bring their own entry (Step 41.3), so they're only greeted:
  `/welcome?returning=1`, "Welcome to {tree}", their entry and **See the
  tree**. There's no welcome on a tree they were already on.
  `redeem_invite_tree` now says `claim_invite`, `had_entry` and
  `was_member` as things stood before redeeming; nothing else in it
  changed. **Also fixed:** Step 44's fill-in form (and the new one) kept
  its button disabled when only a photo was added. It read `isValid` only
  after `||` had already short-circuited, so react-hook-form never worked it
  out. A Leaf adding only a missing photo couldn't save it. **Verified:**
  rehearsed in a rolled-back transaction on live (newcomer, member on a
  new tree, member on the same tree, plain invite, used link), applied,
  md5-matched, grants unchanged. With throwaway accounts and trees on live,
  since deleted: a newcomer's claim invite landed on the welcome. Change,
  a maiden name, sex and a photo saved to their entry, the photo in its
  own folder, birth details and email untouched. The tree opened on them.
  Back on the page it read "Check your details". A member with their own
  entry was greeted and "See the tree" opened on it. A plain invite still
  reached onboarding, whose claim now lands on the welcome. Skip for now
  opened the tree; a photo alone saved. Before the fix, the fill form's
  button stayed disabled on a photo alone; with it, "Added their photo."
  Checked at 375px and in dark mode. 865 tests pass (29 new); tsc and lint
  are clean.

- **Step 49.4 — Tablets drag cards again; only phones keep them fixed**
  (UI only). Aalim wanted Step 49's no-dragging kept to phones. A phone is
  now a touch screen (`(pointer: coarse)`) whose short side is under
  600px, Android's own line between a phone and a tablet (`isPhone` in
  `family-tree.tsx`). The short side keeps a phone on its side a phone;
  it's the screen's, not the window's, so a tablet in split view still
  drags. It's checked again when the window resizes, which covers a
  foldable opening out into a tablet. **Verified** on a throwaway
  signed-out page, since deleted. No card was draggable on a 375×812 phone
  or on one on its side (740×360), where a finger slide panned the canvas
  and saved nothing. All were on a 744×1133 touch tablet, where a finger
  dragged a card and sent its save (held in the page, never reaching the
  server), and with a mouse at 1280px. Switching the same page between
  tablet and phone flipped it both ways without a reload. 836 tests pass;
  tsc and lint are clean.

- **Step 49 — Cards stay put on a touch screen; details minimize to a
  card** (ad-hoc, after Step 48; no migration). Two changes to the tree
  page. **No dragging on a touch screen:** on a phone or tablet (a coarse
  pointer, `(pointer: coarse)`), no card can be dragged, so a finger on a
  card pans the canvas and nobody moves one by accident. Saved positions
  still apply, a mouse still drags as before, and the setting follows the
  device live. **Minimize:** a person's details sheet has a Minimize
  button beside its close button (on the photo, when there is one). It
  folds the sheet into a card at the foot of the canvas, in place of the
  "…'s tree" pill: photo or initials, name, and the sheet's own subtitle
  ("b. 1988 · Your entry"). Their tree gets the whole canvas and the
  camera frames it there. Pressing the card brings the sheet back and
  frames the tree beside it again; its ✕ closes the details. The sheet
  stays mounted while minimized (`keepMounted` on `SheetContent`), so
  whatever was typed in it is kept, and focus moves to the card. It stays
  minimized as the reader opens other people or presses Go to me, and
  resets once nobody's open; a `?person=` link opens someone in full. A
  share link's read-only sheet has it too. A blurred card has no details,
  so it keeps the pill, and the Add and Auto-arrange buttons no longer
  leave room for a sheet that isn't there. A companion's sheet doesn't
  minimize: it has no tree to show. **Verified:** 836 tests pass; tsc and
  lint are clean. A throwaway signed-out page, since deleted, showed the
  real canvas on a fixture family. At phone size with touch emulated, no
  card was draggable: a simulated finger slide on a card panned the canvas
  by exactly its travel, the card stayed put and no save was sent.
  Switching the device to touch mid-visit took effect without a reload.
  With a mouse, a drag still moved a card and sent its save (held in the
  page, never reaching the server). Minimize showed the tree and the card
  on a phone and at 1280px, in both themes. On the wide screen it
  recentred the tree on the full canvas and put the header back, and
  expanding restored the first framing exactly. A typed claim-invite email
  survived minimize and expand. Opening another person, and Go to me, kept
  it minimized; a tap on the empty canvas closed it, and the next person
  opened in full. The read-only view and a visitor's blurred card behaved
  as above.

- **Step 48 — Go to me, your Root's side, and a tidier Search & filters**
  (ad-hoc, after Step 47; no migration). Three changes to the tree page.
  **Go to me:** a fourth button under the canvas's zoom controls (a
  crosshair) opens the viewer's own tree and their details, as if they'd
  clicked their card. It aims the camera again even when their card is
  already open. It shows whenever the viewer's own entry is on the canvas.
  **Show only your Root's side:** a switch under Filters that draws only
  the viewer's Root's side, laid out again around that Root (see **Your
  Root's side**). The existing "related Roots" rule (blood or marriage)
  wouldn't do: live, the two Roots are married, so each would get the
  whole tree. Blood first gives every member on live exactly one side, 51
  people on one and 16 on the other. Search, Show a connection and a
  clicked line all stay within the side. Permissions still read the whole
  tree. Switching it clears what was open and frames the new canvas.
  **Search & filters:** its three sections, Find a person (was "Find
  people"), Show a connection and Filters, start closed and open on their
  own. A dot on a closed section's heading says something in it is on.
  Opening Find a person puts the cursor in the search box. The Clear links
  moved beside the match count and the connection's status line, since
  each heading is now a button. Filters holds "Show only your Root's side"
  (a Root's reads "Show only your side") and Pets & companions, whose "Hidden
  from the tree. Stays this way until you change it." line is gone.
  **Verified:** 836 tests pass (9 new for `ownRoots` / `rootSideIds`); tsc
  and lint are clean. A read-only script over live data (counts only, since
  deleted) checked the sides. In the browser, a throwaway signed-out page
  showed the real canvas on fixture families, since deleted. The sections
  start closed, keep their state when the card closes and opens, and show
  their dots. Root's side drew 15 of 19 cards for a Branch and 7 for a
  Root, and wasn't offered to a child of both Roots. The lane counts
  matched, and a name off the side found nobody in search or connections.
  Go to me opened "Your entry", pulled out the tree beside the sheet, and
  brought the camera back after zooming and panning away. Picking a
  companion's person off the side switched it off. At phone width the card
  fits (288px, no sideways scroll).

- **Step 47 — Shorter prompts and dialogs** (ad-hoc, after Step 46; copy
  only, no migration). Aalim found every prompt and dialog too text-heavy.
  35 of them (87 pieces of text, about 1,900 words) went on a review page,
  today's wording beside a shorter one, and Aalim chose or rewrote each, so
  they're now about half as long. That's the pop-up dialogs: delete a tree,
  both ways to start one, ask to join, request access and what it says when
  it does or doesn't find someone, the privacy tick-box, connections to
  check, delete your account, a close relative in the first run, and adding
  a companion or a place. Then the are-you-sure boxes: deleting an entry or
  a companion, making someone a Root (`rootPlacesAfter` now starts the
  sentence the confirm finishes), removing a member (`removeMemberConfirm`),
  and the admin console's deletes of links, invites and requests. On the
  tree: the canvas tip, "Is one of these you?", the "This is me" warning
  (`mergeConfirmation`), the connection questions, the review page, the
  person and companion panels' notes, and "They’ll join as a Leaf". Last,
  the founder's first run and the add-a-relative form. The engine's
  reasons (`lib/connection-suggestions.ts`) are now questions that fit the
  Yes / No buttons: "Are A and B partners? They’re both parents of C."
  "This cannot be undone." stays only where something is really lost, on a
  line of its own in the account, member and merge warnings, and goes from
  deleting the records of spent invites and requests. The notes under the
  request buttons went, since the privacy tick-box says the same. The
  waitlist box under request access offers "a tree from scratch" instead of
  opening with "A new tree starts empty" (`NEW_TREE_STARTS_EMPTY` removed).
  Dropping the Branches clause from delete-account removed its
  `madeBranches` prop, and the invite step's closing clause its
  `founderEntry`. The maiden-name nudge is just "No maiden name yet." now,
  without its link. Toasts and emails are unchanged. **Verified:** 827
  tests pass (one went with `NEW_TREE_STARTS_EMPTY`; the copy tests are
  updated); tsc and lint are clean. A throwaway public page showed the
  dialogs signed out: delete-account's two paragraphs (its description is
  a `<div>` now), the waitlist's line break, the new tick-box, ask to join,
  request access, the merge warning's own line (`whitespace-pre-line`),
  the review page with no blurb under "Missing connections", and the first
  run's account types, with no console errors. The page was deleted.

- **Step 46 — Removing a member says whether their login goes** (ad-hoc,
  after Step 45; no migration). The admin console's **Remove** always asked
  "Remove <name>? Their login is deleted and they can't return without a
  new invite. …". But `deleteMember` deletes the login only when
  `remove_tree_member` says it was the member's last tree. A member who is
  on another tree keeps their login and stays there; they're only taken off
  this one. Since Step 45 Remove works for members who have added entries,
  so Roots will see it far more often. Nobody on live is on two trees yet,
  so no Root has been told anything untrue. **Now** the console first works
  out which of the members it can remove are on another tree
  (`membersOnOtherTrees`, `lib/remove-member.server.ts`). A Root sees
  memberships only of trees they can view, so it asks with the service
  role, and only a yes or no per member reaches the page, never which
  trees. The confirm (`removeMemberConfirm`, `lib/remove-member.ts`) then
  asks "Remove <name> from <tree>? It’s their only tree, so their login is
  deleted too and they can’t return without a new invite." or "… They keep
  their login and stay on their other trees.", and keeps "Their N entries
  and anything else they added become yours." If the lookup fails it says
  "If it’s their only tree, …", which holds either way. `deleteMember` now
  returns `lastTree`, so the toast says what did happen, even from a page
  that was out of date: "Removed <name> from <tree>. Their login was
  deleted too." or "… They’re still on their other trees."
  `docs/trees-and-permissions.md` says what the Root learns. No journey's
  taps or fields change. **Verified:** 828 tests pass (12 new); tsc and
  lint are clean. In the browser, signed in as a throwaway Root
  (`delivered+46-*@resend.dev`) of a throwaway tree with two Leaves, one of
  them also on a second throwaway tree run by another throwaway Root: the
  page's payload held only `onlyTree` true or false for each Leaf, and
  nothing of the other tree (its name, slug or id, or its Root). With
  `window.confirm` stubbed, each Remove asked its own version, and
  cancelling sent nothing. Confirmed, the Leaf on two trees got "They’re
  still on their other trees.", and kept their login, profile and the
  other tree, while their entry here became the Root's. The other Leaf's
  toast said their login was deleted too, and it was, with their profile;
  their two entries became the Root's. The throwaway trees, profiles and
  accounts were deleted, and counts are back to the baseline.

- **Step 45 — A Root can remove a member who has added entries** (ad-hoc,
  found during Step 42; migration
  `20260923173000_remove_member_who_added_entries`). The admin console's
  **Remove** (`remove_tree_member`) failed for anyone who had ever added an
  entry: "Only a card's position can be changed here" (42501), shown as
  "Couldn't remove that member. Try again." Each entry a member adds gets
  its home placement with them as `placed_by` (`people_home_placement`),
  and the function handed those to the Root before it set
  `ancestree.privileged_profile_write`, which it set only around the
  membership delete. `tree_placements_guard` lets `placed_by` change only
  as a privileged write, so the whole removal rolled back. Only a member
  who had added nothing could be removed; on live, 2 of the 4 Leaf and
  Branch memberships couldn't have been. A second path failed the same
  way: on a member's last tree, deleting their profile clears `placed_by`
  (on delete set null) on any card they placed on a tree they had already
  left, and that ran with the Root's claims too. (A member can leave a
  tree through the API, though no screen offers it.) **Now**
  `remove_tree_member` hands over the placements and drops the membership
  under the flag, saving its value first and putting it back after, as
  `join_tree` and `merge_invited_entry` do. Every check stays: Roots only,
  never yourself, never a Root, and the profile goes with their last tree.
  `tree_placements_guard` lets through clearing a placer whose profile is
  gone, with nothing else about the card changing, as `tree_members_guard`
  does for `invited_by_user_id` (Step 35). Outside that cascade `placed_by`
  always names a profile that exists (a foreign key), so a member can't use
  it. A card left that way keeps its spot, with nobody recorded as placing
  it. No journey's taps or fields change. **Verified:** rehearsed rolled
  back on live in three phases (as live, the function alone, all of it),
  23 checks each, with throwaway Roots, Leaves and a Branch on two
  throwaway trees:
  - As live, a Root removing a Leaf or a Branch who had added an entry was
    refused, on their last tree or not, and so was the tree's second Root.
    A Leaf who had added nothing was removed.
  - The function alone let those through. The entry, its card, a line, a
    comment, an invite, a document, a companion and its comment all went to
    the Root, and the inviter link of someone they'd invited was cleared.
    Removing someone from a tree that wasn't their last left their cards
    and entries on the other tree alone. It still failed for a member with
    a card on a tree they'd left, whether that was all they had added or
    they'd left through the API with entries here too.
  - In full those went through as well, the card keeping its spot with no
    placer, and the flag was left as found (on stayed on, where the old
    function cleared it).
  - In every phase a Leaf, a Branch and a Root of another tree were refused
    (`not_authorized`), a Root couldn't remove themselves or another Root
    (`ROOT_IS_PERMANENT`), someone not on the tree was "member not found",
    and signed out it couldn't be called. A member or a Root still couldn't
    clear or change who placed a card, a member could still move theirs,
    and a home placement still couldn't be deleted. A profile deleted with
    a Root's claims now clears a placer; the service role always could.

  Applied and recorded under the file's version. Both functions' md5 match
  the file, with grants, security definer and search path unchanged, and
  the suite re-run on live matched. Through the live REST API with
  throwaway `delivered+45-*@resend.dev` accounts, a Root removed a Leaf who
  had added an entry (200 `true`): the entry and its card became the
  Root's and the Leaf's profile went. The Leaf removing the Root answered
  403 `not_authorized`, and the Root removing themselves 400. Throwaway
  rows and accounts were deleted, and counts are back to the baseline.
  816 tests pass; tsc and lint are clean.

- **Step 44 — A shorter "Add a relative" form, and relatives who fill in
  what's missing** (ad-hoc; migration
  `20260923170000_fill_blanks_and_optional_birthplace`). Feedback from
  outside: the add-a-relative form was too overwhelming. **The form** now
  shows a first (or preferred) name, a last name, how they connect, and the
  email to invite them, which goes away when "This person is deceased" is
  ticked (so that tick stays up front too). The names keep their "+ Middle
  name" and "+ Preferred name" links. Everything else sits behind **Add more
  details** at the bottom: maiden name, sex, date and place of birth, a
  death's date and place, the photo, and lineage for a Root. That button
  opens a More details section where it was, and the extra connection
  controls (marriage dates, someone in between, more connections) where
  they act. Someone in between gets their name, with the rest behind "More
  about them". **A place of birth is no longer required**, in the form
  (`personSchema`) or the database (`people_required_identity` no longer
  needs a country; an entry without one holds `''`). That holds wherever the
  person form appears; adding yourself in onboarding and the founder's
  close-family dialog keep their full layout. `PersonFields` is now
  `PersonNameFields`, `PersonDiedField` and `PersonDetailFields`, composed
  as before. **Filling in what's missing.** Aalim asked that a Canopy
  member (a Leaf since Step 34) fill empty fields on unclaimed entries they
  are connected to, with a Branch's rights unchanged. Aalim's answers:
  connected = their own line (`private.line_ids`, where they add relatives); a Branch
  may do the same past their side, so a Branch can always do what a Leaf
  can; and a missing photo counts. `private.can_fill_person`: a Leaf or a
  Branch of the home tree, the entry on their own line and nobody's own
  (`private.person_is_someones_own`). `public.fill_person_blanks` sets only
  what's empty: first, middle, preferred and maiden names, sex, date and
  place of birth (a place only where no older free-text one is recorded), a
  death's date and place for someone already marked as having died, and a
  photo where there's none, already uploaded into that entry's folder. It
  never changes or clears a value, and leaves the last name, whether they've
  died, lineage and contact details alone. `people_update` is unchanged, so
  nothing else is writable. `storage_photos_insert_fill` lets them upload
  into the entry's folder while it has no photo; replacing or deleting one
  still needs edit rights. `private.person_edit_notify` records a fill of an
  entry a Root owns or added as it does a Branch's edit, so the Root's
  notification names who filled it in and carries the undo. In the app,
  `canFillEntry` and `Viewer.ownLine` (`lib/branch.ts`) mirror the rule, and
  `lib/fill-blanks.ts` says what's blank. The panel offers **Fill in what's
  missing**, with its own note and the maiden-name nudge, and the edit page
  shows such a member `PersonFillForm`, with only the blank fields.
  Account types gain `fillsBlanks` and a "Fill in what's missing" row, and
  their descriptions say so. **Verified:** 816 tests pass (22 new). The
  migration was rehearsed rolled back on live, before and after, with a
  throwaway Root, Leaf, Branch, member and outsider. Before: an entry with
  no country was refused, and a Leaf could neither update the grandparent
  nor upload into its folder. After: an entry with no country saved (still
  refused with no name), and a Leaf added a child with no birthplace. A Leaf
  could fill their grandparent, and an aunt, but not the in-law's father
  off their line, the Root's own entry or a member's own; an outsider
  couldn't. A Branch could fill the in-law's father past their side, and
  still not edit him. A fill ignored the last name, lineage and "deceased",
  set death details only for someone who has died, never overwrote a second
  time, and refused a bad date, a bad precision, a long name, a photo from
  another entry's folder and a path with no file. A photo went up once, and
  a second upload, a replacement and a delete were refused. The Root's
  notice read "Leaf Zz updated Gran Zz: family name, sex." with an undo that
  put both back. A direct update by the Leaf still changed nothing, and anon
  can't call the RPC. Applied, recorded under the file's version, and every
  function's md5 matches the file (`person_edit_notify` matched the
  expected old body before). In the browser, as a throwaway Leaf on a
  throwaway tree: the form showed names, the deceased tick, the invite and
  the connection, listing only people on their line. The tick hid the
  invite and brought up the death fields; "Add more details" opened the
  rest, with no required mark on the place of birth. A child saved with a
  name and a connection alone. The grandparent's card offered "Fill in
  what's missing". Its page asked only the blanks, and filling maiden name,
  sex, birth year and a photo toasted "Added their maiden name, sex, date of
  birth and photo". The Root got an undo, and the page then asked only
  what was still blank. The in-law's father and the Root's own card offered
  nothing, and the in-law's father's edit address sent the Leaf back to the
  tree. The photo, tree, profiles and both accounts were deleted afterwards.

- **Step 43 — "This is me" works when the placeholder has a document**
  (ad-hoc, found during Step 41.3; migration
  `20260923163000_claim_moves_documents_and_photo`). "This is me"
  (`claim_person`, Step 36) merges a member's own placeholder into the
  entry they claim, then deletes it. It moved the placeholder's documents
  with a plain update, and since Step 41.3 `documents_guard` lets a document
  change entries only under the privileged flag. So the claim was refused
  whenever the placeholder had a document, even one the member uploaded,
  and the app said only "Couldn't complete that claim. Try again." It also
  gave a claimed entry with no photo the placeholder's, but the file stayed
  in the placeholder's folder, and storage lets someone read a photo only
  if they can see the entry its path names. Once the placeholder was
  deleted nobody could, so the claimed entry showed no photo. Now
  `claim_person` moves the documents under the privileged flag, saving and
  restoring its value as `merge_invited_entry` does, once the claimed entry
  is theirs. They stop being shared across trees, as in Step 41.3's merge:
  the claimed entry may be shown on trees the placeholder never was, so a
  choice made for the placeholder's trees would reach people nobody chose.
  The member can share them again, as the person. A document's tree and
  file don't change, and it downloads as before (storage reads its row).
  The photo, framing and all, is named under the claimed entry's id
  instead, and `claimPerson` moves the file there with the service role
  (`moveClaimedPhoto`, `lib/claim-merge.server.ts`), as deleting an entry
  already sweeps its files. A photo kept anywhere but the placeholder's own
  folder stays behind. Step 36's placeholder and has-died guards are
  unchanged, and no journey's taps or fields change. No live member was
  caught out: no entry's photo pointed into a deleted placeholder's folder,
  and the one live placeholder has no photo or document. **Verified:**
  794 tests pass (10 new). In the browser first, before changing anything,
  with throwaway accounts `delivered+43-*@resend.dev` on a throwaway tree:
  a Leaf whose placeholder had a photo and a document pressed "This is me"
  and "Yes, merge" and was told "Couldn't complete that claim. Try again."
  Without the document the merge went through, and the claimed card showed
  initials: its photo named the deleted placeholder's folder, and the
  Leaf's read of the file there found nothing. The migration was rehearsed
  rolled back on live in three phases, 24 checks each: as live, with the
  flag alone, and in full. As live, the claim was refused, and a claimed
  photo couldn't be read by the member, their Root or another tree's Root.
  The flag alone let the claim through, but a shared document became
  visible to the Root of a tree only the claimed entry is on, and the photo
  stayed unreadable. In full, the three documents moved (trees unchanged,
  none shared, every file readable), that Root saw none, the member could
  share one again, the photo moved with its framing and all three could
  read it, a photo kept elsewhere stayed behind, an entry's own photo was
  kept, and the flag came back as it was (left on for a caller that had set
  it). Claiming someone who has died, merging a placeholder someone else
  has drawn a line to, refiling a document directly (as a member, as a
  Root, or right after a claim) and calling as anon were refused
  throughout, and the entry's maker got the same two notices each time.
  Applied and recorded under the file's version. The live body's md5
  matches the file, and the suite re-run on live matched. Then in the
  browser with a fresh placeholder (a photo, a parent line, two documents,
  one shared): "This is me" asked "Your parent Ines Zz43tester will be
  connected to this entry instead, …", said "Merged — this is now your
  entry.", and the claimed card and panel showed the photo, for the Leaf
  and their Root alike. Nothing was left at the old path, the framing came
  along, the line moved, and both documents were on the claimed entry,
  unshared; one downloaded (a PDF, HTTP 200). The Root was told "… was
  claimed by a relative" and "… was updated: photo.", as before. Throwaway
  rows, files and accounts deleted, and counts are back to the baseline.

- **Step 41.5 — Asking a relative: every ask counts, members can opt out,
  asks lapse** (Step 41, first-time journey follow-ups; migration
  `20260923155000_relay_caps_opt_out_expiry`). Step 30.5 left three gaps in
  "Ask a relative who's on ancestree". An ask to an address that wasn't a
  member's was never stored, so it counted toward no cap, and the lookup ran
  for every address anyone tried. A member couldn't opt out. An ask nobody
  answered waited for ever. Aalim chose the defaults. **Every ask counts:**
  `passOnRelay` first notes it in `public.invite_relay_asks` (the address
  asking and when, never the relative's; RLS on with no policies and no
  grants, so the service role alone reads it). The caps on the address
  asking (3 a day) and across the site (10 an hour, 30 a day) count those
  notes before anyone is looked up (`askWithinCaps`), so an ask past one
  looks nobody up and its note is taken back. The member's own caps (2 a
  day, 5 a week) still count the asks filed for them (`memberWithinCaps`).
  One trade-off: junk asks can now use up the site's 30 a day. **Opt-out:**
  a **Relatives can ask me to invite them** box in settings' Privacy card
  (`profiles.relatives_can_ask`, on by default; `setRelativesCanAsk`). When
  it's off, `invite_relay_recipient` finds nobody at that address, so the
  newcomer's answer is unchanged and nothing is filed or sent. Asks already
  waiting stay. **Lapsing:** an ask pending for 30 days leaves the card,
  which now shows the date each ask waits until. `sendRelayedInvite`,
  `sendRelayedClaimInvite` and `dismissRelay` refuse it with "That request
  has already been answered, or it lapsed after 30 days." pg_cron isn't
  enabled, so each new ask first deletes lapsed asks (so the same address
  may ask again) and notes older than a day. Opened from the email, a
  lapsed ask says "<name>’s request lapsed after 30 days without an
  answer." (41.1's `openedRelayNote` now reads the ask's date). The email
  says the request lapses after 30 days and names the box to untick. The
  privacy notice now
  covers the notes, the lapse and the new choice. The newcomer's answer,
  and how long it takes, still don't depend on whose address it is: all of
  this runs in `after()`. No journey's taps or fields change; opting out is
  one tap in settings. **Verified:** 784 tests pass (22 new). The migration
  was rehearsed rolled back on live in three phases (before, table and flag
  only, all). With the table and flag but the old lookup, an opted-out
  member was still found; with all of it, nobody was. Anon and members
  couldn't read or write notes, or call the lookup. The service role could
  write and clear notes, and the address checks held. A member could set
  only their own flag, and existing profiles start on. It was then applied
  and recorded under the file's version, and the lookup's md5 matches the
  file. In the browser, on a dev server, with a throwaway member on a
  throwaway tree and every typed address a `delivered+41-5-*@resend.dev`
  inbox:
  - One newcomer's four asks to non-member addresses all got the same
    answer, in 11–20 ms on the server. Three notes were kept, and the
    fourth was "over a cap, so dropped before the lookup". The API log
    showed four notes written and three lookups.
  - The member unticked the box (the toast said so, and it stayed unticked
    after a reload). A second newcomer's ask to them got the same answer,
    with nothing filed or emailed.
  - With the box ticked again, a third newcomer's ask was filed and
    emailed. Resend showed that one email to the member, with the lapse and
    opt-out lines, and none from the opted-out ask.
  - Backdated 31 days, that ask left the card. Dismiss and Send invite on
    the stale card were refused, and no invite was minted.
  - The next ask deleted the lapsed ask and a note backdated two days, and
    the same newcomer could then ask that member again.
  - After rebasing onto 41.1's answered-ask line, a second throwaway
    member's card kept an ask 29 days old ("waits until" the next day) and
    left out one 31 days old, whose email link said it "lapsed after 30 days
    without an answer". Unticking the box kept the waiting ask on the card.

  Throwaway rows and both accounts were deleted, and counts are back to the
  baseline.

- **Step 41.3 — A claim invite accepted by someone who already has an
  entry** (Step 41, first-time journey follow-ups; migration
  `20260923153000_claim_invite_merges_into_own_entry`). A member with their
  own entry who accepted a claim invite to another tree joined it and
  nothing more: `redeem_invite` kept only the vouch (Step 30.2), since
  placing their entry too (Step 30.9) would show two entries for one
  person. They landed on onboarding's "A Root of <tree> can bring it onto
  this one", with nothing to press (the canvas sends them back there), and
  no Root was told: the gap left on J10. Aalim chose to fold the invite's
  entry into theirs where that's safe, and otherwise show theirs beside it.
  `redeem_invite` now runs `private.merge_invited_entry` when that entry is
  a placeholder only its maker has built on (`is_own_placeholder`, Step
  36's test), nobody is behind it, and it's on the invite's tree alone. It
  never runs when either of them is marked as having died (Step 37), a line
  joins them (a parent with the same name), or they were born more than a
  year apart. Their entry takes its place and its card's spot on that
  canvas, with its lines (less any that would double up), notes, documents
  (no longer shared across trees), companions and bloodline anchors; then
  it's deleted, and their own details stay as they were. `documents_guard`
  lets a document change entries only inside that merge (the privileged
  flag); its tree never changes. Anything else shows their entry beside the
  invite's, as an ordinary invite does. Every Root is told which
  (`placed_on_join`): "… has taken that entry's place on <tree>, with
  everything that was on it", or "<tree> now shows both. If they're the
  same person, you can delete the entry you invited them to claim, …",
  whose **View on tree** opens that entry. A maker who isn't a Root hears
  of a merge too (`claim_approved`, with nothing to dispute). Either way
  they land on their own entry: J10 with a claim invite takes 2 taps signed
  in and 5 signed out, no fields, and no longer ends on the onboarding
  card. Nobody on live was stranded, and no live claim invite is affected
  (the one sent to a member names their own entry). **Verified:**
  rehearsed rolled back on live in three phases, 17 checks each. Before:
  every claim case landed on onboarding with no notice. With the merge but
  not the guard change: a document blocked the merge, which fell back to
  placing. With all of it: bare entries merged (lines, note, document, pet,
  card spot; an entry already on the tree kept its spot; a Root's
  unanswered placement kept its `placed_by`), the seven unsafe cases fell
  back, and an ordinary invite, a newcomer's claim and an invite naming
  their own entry behaved as before; a Root still can't refile a document,
  and a member can't call the merge. Applied and recorded under the file's
  version; all three bodies' md5s match the file, and the suite re-run on
  live matched. In the browser, with throwaway accounts
  `delivered+41-3-*@resend.dev`: a member opened a claim invite signed out,
  emailed themselves the sign-in link (read back through Resend), signed
  in, pressed **Join** and landed on `/tree?person=` for their own entry,
  where the invite's had been, with its parent. The Root's bell read the
  merge notice, with **View on tree** and **View in admin**. A second claim
  invite, for an entry a Leaf had commented on, landed them on their entry
  again with both shown; the Root's **View on tree** opened the invited
  entry. Throwaway rows deleted, and the family's rows match the baseline.
  762 tests pass. Found on the way and left for its own step: Step 36's
  "This is me" is refused when the member's placeholder has a document
  (`documents_guard`).

- **Step 41.1, follow-up — Settings says what became of the ask its email
  named** (no migration). Sending or dismissing an ask from its card
  refreshes the page at the email's address (`&relay=<id>`), and settings
  then said "That request has already been answered." about the answer the
  member had just given. Aalim asked for it fixed. The page now reads the ask
  back (`loadOpenedRelay`; RLS shows it only to its member) and says what
  they did with it (`openedRelayNote`, `lib/opened-relay.ts`): "You’ve
  invited Zed Qadri to <tree>." or "You’ve dismissed Zed Qadri’s request.
  They aren’t told." The same line meets them if they open the email again
  later. Anyone else, or an ask that's gone, still gets "That request has
  already been answered." **Verified:** 762 tests pass (8 new). On a dev
  server with a throwaway Root and Leaf and two asks: after "Send invite" on
  the ask the address named, its line read "You’ve invited Zed Qadri to Zz
  Step 41.1 note tree." with the other ask still listed. Dismissing the
  other one from its own link read "You’ve dismissed Nadia Qadri’s request.
  They aren’t told." Reopening the first link gave the same "invited" line,
  and the Leaf opening it saw only "That request has already been
  answered." Throwaway rows deleted; counts back to the baseline.

- **Step 41.4 — Ask to join from a share link without leaving the canvas**
  (Step 41, first-time journey follow-ups; no migration). A share link's
  corner card said "Request edit access" and left the canvas for
  `/request-invite?tree=<slug>`, so the viewer lost their place, and "edit
  access" undersold it: they aren't a member at all. The button now reads
  **Ask to join** (sentence case: an action on the canvas, not a way to
  another page; `docs/design-system.md`) and opens the same form in a
  dialog over the canvas (`RequestInviteDialog`, as the home page's request
  access does): first name, last name and email, the privacy tick
  (`InviteConsent`), **Request an invite**, `requestInvite`'s answers and
  its alert to the tree's Roots, and "Already have an invite? Sign in".
  Taller than the screen, it scrolls inside itself. `/request-invite?tree=`
  still shows the form as a page, for emails and older links, sharing the
  dialog's intro (`REQUEST_INVITE_INTRO`) and sign-in line. A visitor from
  another tree sees the same card, so the same dialog, less "Sign in"; their
  old link led to a page that sends anyone signed in back to `/tree`.
  Nothing new is exposed: the dialog carries only the tree's slug, as the
  link did. J6 stays at 5 taps and 3 fields; the first tap no longer leaves
  the canvas. An action that revalidates draws the page it came from again
  in its reply, so asking re-rendered the share page: it counted another
  view, and re-seeded the canvas, hiding every card behind the dialog until
  each was measured again. `requestInvite` now refreshes pages only for a
  signed-in asker, whose `/join` says where the request stands (Step 30.8),
  and the share page counts no view for a server action's reply
  (`viewerUserAgent`), for a signed-in viewer who asks. **Verified:** 754
  tests pass (3 new). In the browser, signed out, on a throwaway tree whose
  only Root was `delivered+41-4-root@resend.dev`, through a share link made
  from a throwaway row (its token never printed; a one-shot redirect on
  127.0.0.1 handed it to the pane): the card read "Ask to join", and the
  dialog opened with the canvas's camera, the page's scroll and the cards
  where they were. At 375×667 it fit; at 375×500 it scrolled inside itself
  to its last line while the page stayed put. A bad address kept what was
  typed and the tick. Asking as `delivered+41-4-new@resend.dev` answered
  "Request sent", filed the request on that tree, and the Root's alert
  ("Zz414 Newcomer asked to join Zz41-4 Share Test on ancestree") was
  delivered, read back through Resend. Before the action change that reply
  re-rendered the share page (logged) and left every card hidden; after it,
  nothing re-rendered, no card hid, and the camera never moved. Asking again
  filed nothing and emailed nobody; closing gave focus back to the button,
  and reopening started afresh. The view count moved for page loads only.
  `/request-invite?tree=` and `/request-invite` render as before. The
  throwaway rows and account were deleted, and counts are back to the
  baseline.

- **Step 41.1 — A relayed invite can claim the newcomer's entry** (Step 41,
  first-time journey follow-ups; migration
  `20260923151000_invite_relay_candidates`). Someone reaches "Ask a
  relative who's on ancestree" (Step 30.5) when request access finds no
  strong name match, often because they're on the tree under another
  spelling, and the relative's invite was a plain one, so onboarding's
  search could miss them again. Now the relative's **Relatives Asking for
  an Invite** card lists the entries on the tree they've picked that the
  newcomer's name matches (`public.invite_relay_candidates`, modelled on
  Step 30.3's `invite_request_candidates`): onboarding's scoring, living
  entries placed on that tree that nobody is behind yet, best five, with
  onboarding's lifespan, birthplace and parents. Only the member the ask
  went to may ask, of a tree they're on, while it waits, and only entries
  they may invite someone to claim are listed (`can_invite_to_claim`: a
  Root anywhere, a Branch on their side, a Leaf on what they added), so a
  Leaf without that right sees only the plain invite. Nobody who has died
  or is claimed is listed. "Invite as <name>" (`sendRelayedClaimInvite`)
  asks the list again on the server, then sends through `sendClaimInvite`,
  keeping its Sent Invites record; its new optional `treeId` sends the
  invite into the picked tree when that tree shows the entry but isn't its
  home. The ask is answered once an invite is made
  (`ClaimInviteState.minted`), even if its email fails, as the plain path
  does. Accepting claims the entry and opens the canvas on it (Step 30.2),
  with no onboarding: J5 goes from 7 taps and 4 fields (10 and 6 when
  onboarding finds nobody) to 6 and 4. "None of these, invite without an
  entry" sends the plain invite as before, but only when pressed: with
  entries listed, Enter in a field sends nothing, so it can't choose "none
  of these" for the member. **Verified:** rehearsed rolled
  back on live, eleven role checks before and after (a Root sees the close
  matches but not the dead, claimed, unmatched or other-tree entries; a
  Leaf sees none until they add one; someone else's ask, a tree they're not
  on, anon, the service role and no user are refused; an answered ask lists
  nothing), then applied and recorded under the file's version (`db push
  --dry-run`: up to date; the body's md5 matches the file). In the browser,
  on a throwaway tree where the newcomer typed "Zed Qadri" and is on it as
  "Zahid Qadri" (request access: no match), the Root's card listed Zahid
  Qadri and a cousin hidden from visitors, but not a dead Zaid or a claimed
  Zayd, both stronger matches. "Invite as Zahid Qadri" emailed a claim
  invite naming the entry (delivered, read back through Resend) with its
  Sent Invites record, and answered the ask. The newcomer
  (`delivered+41-1-new@resend.dev`) ticked, accepted and landed on
  `/tree?person=` for Zahid Qadri, claimed, as a Leaf, and the Root was
  told. A Leaf's card showed only the plain invite, which still sends.
  Picking a second tree that shows an entry homed on the first listed it
  there, and that invite joined the second tree. On a temporary signed-out
  page rendering the card, with server actions parked, Enter sent nothing
  from a card listing an entry and sent the plain invite from one listing
  none, and pressing "None of these" sent it. Throwaway rows deleted, and
  counts are back to the baseline. 751 tests pass (4 new).

- **Step 41.2 — A member who opens an emailed invite signed out gets the
  sign-in link at once** (Step 41, first-time journey follow-ups; no
  migration). A member invited to a second tree who opened the invite
  signed out was shown the privacy tick and "Accept & open the tree", and
  only after pressing it did the page say the address already has an
  account and offer "Email me a sign-in link" (Step 30.8): two taps for
  nothing. Now, for someone signed out, the page asks
  `address_has_profile` (service role only) as it renders
  (`opensOnSignInLink` in `lib/sign-in.server.ts`; `signInWithInvite`
  asks through the same `addressHasProfile`). An address with an account
  opens straight on that link, with no tick, since a member's join asks
  for none, under "Once you’re signed in, accepting adds it to your
  trees." It only looks up: the GET that mail scanners open mints and
  sends nothing, and a failed lookup keeps the accept form. It shows
  nothing new, since the address was on the page and pressing Accept said
  it had an account. Nothing else changed: a newcomer's tick and Accept, a
  signed-in member's Join, a signed-in first-timer's accept form, a bare
  link's form, and `acceptInvite`'s fallback for an address that gets an
  account after the page loads. J10 signed out goes from 7 taps to 5, with
  no fields typed. **Verified:** 747 tests pass (7 new). On a dev server
  with throwaway accounts and trees: a signed-out member's invite opened on
  "Email me a sign-in link" with no tick, having minted nothing (no
  one-time token, `recovery_sent_at` or email); the email it sent, read
  back through Resend, carried `next` = the invite and no invite to redeem;
  its link landed on the invite signed in, and Join placed their entry on
  the second tree and told its Root. A newcomer's invite still showed the
  tick, a bare link its name-and-email form, and a signed-in first-timer
  at the invite's address the accept form. An accept form loaded before
  its address got an account fell back to the sign-in link when pressed,
  and opened on it after a reload. All throwaway rows were deleted.

- **Step 40.5 — Drop the unused ancestral-lands columns** (migration
  `20260923141000_drop_ancestral_lands_columns`). Aalim asked for the
  columns Step 40 left unused to go too: `people.ancestral_lands_birth` /
  `_death` and `pets.ancestral_lands_birth`, which held the family's own
  words and were never written (none had a value, and no entry revision
  mentioned them). Everything that named them is back exactly as it was
  before Step 27: `tree_people` (dropped and made again, since a view
  can't lose a column in place), `private.revision_fields()` (what a Root
  can undo) and `private.person_edit_notify()` (no "ancestral lands" in an
  edit notice). No app code had read them since Step 40;
  `lib/database.types.ts` drops them too. **Verified:** rehearsed rolled
  back on live, then applied and recorded under the file's version
  (`db push --dry-run`: up to date). On live, the three columns and their
  checks are gone and nothing names them; both functions hash to their
  pre-Step-27 bodies, and the edit trigger still fires (a rehearsed edit
  noticed "was updated: name."); `tree_people` has its 38 columns with the
  same grants, options and owner, and the same 98 rows (65 as a member).
  The app's own selects on `tree_people`, `people` and `pets` answer 200,
  and a dropped column 400. 740 tests pass.

- **Step 39 — A tree has at most two Roots, and each Root makes up to four
  Branches** (ad-hoc; migration `20260923130000_root_and_branch_limits`).
  Aalim asked for both rules, reflected everywhere, onboarding included, and
  chose to count Branches per Root rather than pooled across the tree. The
  database holds them: `private.tree_members_limits` refuses a third Root
  (`ROOT_LIMIT`) or a fifth Branch for one Root (`BRANCH_LIMIT`) from every
  caller — the picker's RPC, a Root's direct write, and the RPCs' own
  inserts — locking the tree's row before it counts, and records who made
  each Branch one in the new `tree_members.branch_granted_by` (never chosen:
  a Root naming the other Root is overruled; a Branch made a Leaf or a Root
  frees the place). A limit only stops a promotion, so nothing on live
  moved: the Family Tree already had two Roots and one Branch, Arzu, now
  credited to Aalim, who invited her. A Root who deletes their account
  hands their Branches to their successor (or the other Root) with their
  entries, past four if need be. The co-admin allowlist's sign-in
  (`ensure_profile`), which made its user a Root of the first tree, now
  joins as a Leaf once that tree has its two. In the app,
  `lib/account-types.ts` mirrors the numbers (`ROOTS_PER_TREE`,
  `BRANCHES_PER_ROOT`, each type's `limit`): the /admin picker greys out a
  type the tree has no room for and says why; the members table reads
  "Roots: 2 of 2. Branches you’ve made: 1 of 4 (…)" and says who made each
  Branch one; making a Root says it takes the tree's last place; the
  account-type cards gain "How many a tree can have"; the founder's first
  run ("Who Can Do What") and the Root and Branch descriptions say the
  limits; `/account` shows a Root's "Branches made"; the delete dialog says
  their Branches pass on. **Verified:** 740 tests pass (12 new). The
  migration was rehearsed rolled back on live in three phases — before,
  with only the limits, and whole — over 19 checks as throwaway Roots and
  members: every way to a third Root refused; RB1's fifth Branch refused
  while RB2 made one from their own four; freeing a place, or removing a
  Branch, let RB1 make another; forging or re-crediting who made a Branch
  was overruled; the service-role handoff reached five and then blocked a
  sixth; a Root still stays a Root. The middle phase showed the allowlist
  sign-in failing outright without its change, and joining as a Leaf with
  it. Then applied, recorded under the file's version (`db push
  --dry-run`: up to date), every new function body md5-identical to the
  file, and the 19 checks re-run on live with the same results. In the
  browser, on a throwaway page of the real components: the picker's Root
  and Branch greyed out with their reasons, the Root confirm's wording
  (declining it changed nothing), the new card row, the first run's copy
  and the delete dialog. Not exercised: the admin console itself signed in
  as a Root.

- **Step 40 — Ancestral lands only where Native Land Digital has a match**
  (ad-hoc; no migration). Aalim asked for the ancestral-lands box to go
  where there's no match. Since Step 27.8 the form had offered one wherever
  Native Land Digital maps no territory, or can't be asked (a hand-added
  place, or NLD unreachable), captioned "Our database does not contain a
  distinct ancestral name for this land. Please include whose land this
  is." Now the form and the card show nothing there, and nothing while NLD
  is being asked (no more "Checking Native Land Digital…"), so a place
  without names never flashes up a line. Where NLD has names, both show
  them as before. The family's words went with the box: none had been
  saved (0 of 98 people and 0 of 7 companions on live), so the forms,
  actions and loaders no longer read or write
  `people.ancestral_lands_birth` / `_death` or `pets.ancestral_lands_birth`,
  and the columns stay, unused. **Verified:** 728 tests pass (the 7 about
  the family's words went with them). On a fixture page answered in the
  route's own shape (the pane was signed out), a Toronto birthplace showed
  its names and credit in the form and on a card; a Kampala place of death
  (no names), a Nairobi companion (NLD can't be asked) and a card with no
  place showed nothing, with no box or caption anywhere; and with every
  lookup held for 8 seconds, nothing showed until the names arrived.

- **Step 38 — Invites sent from the tree show in Sent Invites and on the
  card** (ad-hoc; migration `20260923120000_claim_invites_in_sent_invites`).
  Aalim sent invites from the tree and none showed in the admin console's
  "Sent invites". They were claim invites, from an entry's card and the
  add-relative form's email box, and `sendClaimInvite` never wrote the
  `invite_requests` record that direct, founder and approved invites keep,
  which is what "Sent invites" lists. With no record, the console filed them
  under "Bare links", with no name or address, and nothing said an entry had
  been invited already: two relatives have two each. Now `sendClaimInvite`
  writes the record (source `direct`,
  named after the entry, `email_sent` kept), and the migration adds one for
  each claim invite already out: 9 on live, 6 of them still usable. "Sent
  invites" says who sent each invite and when, or who approved it, and
  "Claims …" for a claim invite; a failed direct email reads "Email failed";
  resending a claim invite keeps its claim wording. Asked for along the way:
  the entry's card now lists the invites out to claim it — who sent each and
  when, until when it works, or that it expired unused — to every member of
  the tree, with the address only for a Root and the sender
  (`lib/claim-invites.ts`, `listClaimInvites` with the service role, since
  RLS hides others' invites from a member). With one live, the button reads
  "Send another". **Verified:** 735 tests pass (13 new); the migration was
  rehearsed rolled back on live, where a Root's "Sent invites" went from 0
  to 6 and "Bare links" from 6 to 0, then applied and recorded under the
  file's version (`db push --dry-run`: up to date). On a dev server signed
  in as a Root: "Sent invites" listed the 6 with "Sent by Aalim Rattansi"
  and "Claims their entry", "Bare links" was empty, "Archived" named the 3
  expired ones, and a card with two invites out listed both, with the
  address and expiry, above "Send another". Not exercised: a fresh send
  from a card, which emails and writes to the family's tree.

- **Step 30.8 — Signing in does something for a first-timer** (Step 30,
  first-time journeys; migration `20260923077000_address_has_profile`).
  Someone who signed in without being a member landed on "Almost There",
  which told them to open an invite or request one elsewhere, had no way
  to sign out, and whose header "sign in" led straight back to it. Now,
  looked up by the address they've just verified and nothing else
  (`lib/first-timer.ts`, `.server.ts`, service role): an invite emailed to
  that address opens on its own page, with its privacy tick, from the
  confirm tap, from `/join` and from any members' page that bounces them
  there, and is never redeemed without that tap; a pending request shows
  "Waiting for an Invite", naming the tree and saying its Roots have been
  told; with nothing waiting, request access opens right on `/join` with
  the address filled in and fixed, so they type only their name (and a
  line says so if they're on the waitlist). `/join` has "Use another
  email", and the header offers "Sign out" instead of "sign in". Left over
  from 30.9: an emailed invite whose address already has an account now
  offers "Email me a sign-in link", sent only to the invite's own address,
  whose `next` brings them back to the invite signed in, one tap from
  joining (where 30.9 places their entry). `signInWithInvite` now asks
  `address_has_profile` (service role only) before minting a token, since
  minting stamps the account and Supabase then refused to email that
  address the sign-in link for a minute. The accept form's privacy tick
  now survives a retry after an error, as the other forms' do since 30.5
  and 30.7. **Verified:** 722 tests pass; the migration was rehearsed
  rolled back on live and the applied function md5-matches the file. On a
  dev server with throwaway accounts: a plain `/join` sign-in with an
  invite bound to the address landed on the invite, and accepting reached
  onboarding; a pending request showed its status; nothing waiting showed
  request access with the address locked, and a request made there
  flipped the page to its status; both sign-outs worked; `/tree` and
  `/join` sent a first-timer to their invite; a member who pressed
  "Email me a sign-in link" got a real email whose link carried
  `next=/join/<token>`, landed on the invite signed in, and joining opened
  the canvas on their placed entry; a failed accept then a retry went
  through with the tick. All throwaway rows were deleted.

- **Steps 30.5 + 30.6 — With no match, ask a relative; the waitlist asks
  for the privacy tick** (Step 30, first-time journeys; migration
  `20260923074000_invite_relays`). Request access's no-match screen told
  people to ask a relative to invite them but gave no way to, and its
  waitlist led to a new, empty tree rather than the family's own. Now "Ask
  a relative who's on ancestree" takes the relative's address and says the
  newcomer's name and email will be passed on. Every ask gets the same
  answer ("If they're on ancestree, we've passed your request on…"):
  `askRelative` only checks the typing and does the lookup, the caps and
  the email in `after()` (`passOnRelay`), so neither the answer nor its
  timing says who's a member. For a member's address
  (`invite_relay_recipient`, service role only) the ask is filed
  (`public.invite_relays`, read and answered only by that member) and the
  member emailed (`lib/emails/invite-relayed.ts`) a button to **Relatives
  Asking for an Invite** on `/account?view=settings&relay=<id>`: an invite
  filled in from what the newcomer typed, into a tree they pick, sent
  through `sendDirectInvites` — or dismissed, and the newcomer isn't told.
  Caps, counted from the rows after filing: 3 a day per address asking, 2 a
  day and 5 a week per member, 10 an hour and 30 a day across the site; an
  ask past one, or a repeat of an open or dismissed ask, is dropped without
  a word. The waitlist says first that a new tree starts empty. Step 30.6:
  both waitlist forms carry request access's privacy tick, and
  `joinBetaWaitlist` refuses a sign-up without it, since a reviewer's yes
  sends a founder invite whose join page takes the box as ticked.
  `InviteConsent` sends `consent` from a hidden input that follows the box
  (as `MagicLinkForm` does since Step 30.7), so a retry after an error
  keeps the agreement on request access, `/request-invite` and both
  waitlist forms. The privacy notice names asking a relative among the asks
  whose name and email are kept. **Verified:** 683 tests pass; the
  migration was rehearsed rolled back on live (the recipient read their
  ask, other members and anon couldn't, the duplicate and field checks
  held) and the applied function md5-matches the file. On a dev server
  with a throwaway member on two throwaway trees, the member's address, a
  non-member's, a repeat and an over-cap ask all got the same answer, and
  only the member's first two asks that day emailed them (test inboxes
  only); signed out, the email's button went through sign-in to the
  filled-in card; sending into the second tree emailed the invite and
  marked the ask invited; dismissing blocked a re-ask. Both waitlist forms
  keep the button disabled until the box is ticked, a forced unticked
  submit was refused, and a retry after a missing last name went through.
  All throwaway rows were deleted.

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
  eldest-left; sibling runs go oldest→youngest. _Superseded the same day by
  `8dbf47d`: per-row sweeps let unrelated couples split a sibling set, so
  placement now packs rigid family blocks (see Project structure,
  `lib/tree-layout.ts`); the sides, row numbering and separation sweep are
  unchanged._ The canvas draws generation
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
