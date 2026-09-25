# Trees, account types and permissions

The reference for how Ancestree works once there is more than one tree
(Step 25). `ANCESTREE.md` describes the code; this page describes the rules.
The database enforces every rule here; `lib/account-types.ts` and
`lib/branch.ts` mirror them so the UI can decide what to offer without a
round trip.

## 1. The model in five sentences

1. A **tree** is a canvas with its own members, account types, invites, share
   links, comment boards, document banks and inbox.
2. A **person** is one row, wherever they appear: one name, one set of dates,
   one photo. Every person has a **home tree**, and may be **placed** on other
   trees as well.
3. A **connection** (parent, spouse, sibling) is a fact about two people, not
   about a tree. A tree draws a connection when both people are placed on it.
4. A **member** is an account. An account has one profile and one own entry,
   and a separate **account type in each tree** it belongs to: Root in one,
   Leaf in another.
5. A person's **details** are governed by their home tree's rules and by the
   person themselves. What a tree may do with a placed person is governed by
   that tree's rules.

## 2. Trees

| | |
|---|---|
| Founding | A member founds a tree from `/trees/new` once a **beta reviewer** has approved their request (Step 28, "start a tree (beta)" on the home page or `/trees`), or a newcomer founds one by redeeming a **founder invite** — from any Root, or from a reviewer approving them off the waitlist. A founder is that tree's first Root. Either way they land on the founder's first run (Step 29): invite, their own entry (added, or brought over from another tree), the tree's name, their close family. |
| Beta requests | `tree_requests`, answered by the addresses in `private.beta_reviewers` (the build owner and Raiya Suleman). A member's approval is their permission to found; `found_tree` refuses anyone else. A reviewer may always found. Only reviewers see the queue; a member sees their own ask. |
| One each | A member may found **one** tree (`trees.created_by` is unique). Being a Root of several trees is fine; founding several is not. |
| Roots | Every tree has at least one Root, for good, and at most two (Step 39). The last Root may leave only by handing the tree to a successor (`deleteAccount(successorId)`, per tree). |
| Naming | `trees.name` is shown; `trees.slug` is the URL segment (`/t/<slug>/…`). Slugs are unique and only a Root may rename a tree. |
| Bloodline gate | Per tree (`bloodline_anchors.tree_id`). A founded tree is anchored on its founder's own entry, set when they add, claim or bring themselves there (Step 29: `place_people` anchors the founder's own entry); the first tree keeps its two original anchors. The bloodline climbs every parent line from the anchors, then comes down parent lines and across sibling lines (Step 53), so a partner who married in stays out. Everyone added needs a blood tie (Step 53): once their lines are drawn they are blood, or have a line straight to someone who is, as a partner or the other parent of a blood child. Nobody joins only through someone who married in — their parents, siblings, a child from another relationship, a later partner — whoever is adding, a Root or a newcomer adding themselves included, and the refusal names who. "Add a relative" and onboarding say so as soon as the form would be refused, without stopping the submit (Step 53.1). A member who married in can't add their own side of the family, which belongs on a tree of their own. |
| Deleting a tree | A Root may delete a tree they run (`delete_tree`, from the admin page's Data & privacy card). Every person whose home it was moves home to the other tree they were placed on first, or is deleted with the tree if there is none; a member whose own entry goes starts over on their next tree's onboarding. Its boards, banks, companions, invites and share links go with it. |

## 3. Membership and account types

`tree_members (tree_id, user_id, role)` is the only place an account type is
stored. Three since Step 34, stored as `admin`, `branch_admin` and `member`
and shown as **Root / Branch / Leaf**, each **within that tree**. `member`
was Canopy's key: Step 34 retired the first Leaf (`leaf`, their own entry
and nothing more), moved everyone who was one up to `member`, and gave
Canopy the name.

| Type | In this tree they can |
|---|---|
| **Root** | Edit every entry whose home is this tree, and any connection drawn between two people placed on it. Run the tree: members and their types, invites (including founder invites), share links, placements, cross-tree viewing, deletes, lineage, verification. |
| **Branch** | Tend their part of a Root's side, measured on this tree's people only. Past it, fill in what's missing on their own line as a Leaf does (Step 44). Everything else as Step 22. |
| **Leaf** | Add relatives on their own line — their ancestors, everyone descended from them, and the people those relatives married (`private.line_ids`) — and edit what they add here, the lines they draw, and their own entry. Fill in what's missing on an unclaimed entry on that line, a photo included (Step 44). |

Rules that follow:

- A type is set by a Root **of that tree** and applies only there. Becoming a
  Root elsewhere changes nothing here. A Root makes a Leaf a Branch, or a
  Branch a Leaf again.
- "Root is permanent" holds per tree (`tree_members_guard`).
- **Limits** (Step 39, `tree_members_limits`), per tree: at most **two
  Roots**, and up to **four Branches for each Root**, counted by who made
  them one (`tree_members.branch_granted_by`, recorded by the database, never
  chosen), so one Root can't spend another's four. Leaves and members are
  unlimited. A limit only refuses a promotion (`ROOT_LIMIT`, `BRANCH_LIMIT`),
  from every caller including the RPCs; it never demotes anyone. A Branch
  made a Leaf or a Root frees their Root's place. The co-admin allowlist's
  sign-in (`ensure_profile`) joins the first tree as a Leaf once it has its
  two Roots.
- A Leaf's own line is measured **on the tree being written to**, once the new
  entries' lines are drawn, so a Leaf can add a great-grandparent and then
  that great-grandparent's other children (`add_people_with_connections`,
  `OWN_LINE`). The bloodline gate applies on top, as it does to everyone.
- A member joins a tree through an invite (as a Leaf), by founding it (as
  Root), or by accepting a placement of their own entry (as a Leaf, so they
  can keep their own entry up to date there; a Root may change that).
- A Root may remove a Branch or a Leaf from the admin console
  (`remove_tree_member`). What they added or own whose home is this tree
  passes to that Root: entries (their own among them), lines, comments,
  documents, invites, share links, companions, and who placed each card.
  If it was their last tree, what they left on other trees passes to that
  Root too, and their profile and sign-in go; a card they placed on a tree
  they had already left stays where it is, with nobody recorded as placing
  it. A Root can't be removed, and can't remove themselves (Step 45).
  Before they confirm, the console tells the Root whether it's the member's
  only tree, so whether their sign-in goes; it never says which other trees
  they're on (Step 46).

## 4. People: home trees and placements

`people.tree_id` is the person's **home tree**. `tree_placements (tree_id,
person_id, status, pos_*)` says which trees show them and where the card
sits on each canvas. The home tree always has an active placement; every
other placement is added by a Root of the receiving tree.

| | Rule |
|---|---|
| Bringing people over | When a member founds a tree, or later from the "People from other trees" card on `/t/<slug>/admin`, a Root picks anyone they can see on a tree they belong to. Each pick becomes a placement. Everyone brought over needs a blood tie on this tree, judged across the whole batch, with a member's own entry counted as there while it waits for their yes (Step 53). |
| Consent | If the person is a member's own entry (their `self_person_id` or a settled claim) and that member is not the one placing them, the placement is **pending** until they accept (`placement_requested` notification, accept or decline on `/account`). Accepting an invite to the tree counts as saying yes (Step 30.9), a claim invite included (Step 41.3). Pending placements are not drawn. Anyone else's entry (an unclaimed relative, a grandparent) is placed at once. |
| Home tree choice | A member chooses which of the trees they are placed on is their home (`/account` → Your entry). A Root of the current home tree may also move an unclaimed entry's home to another tree it is placed on. |
| Leaving | A person may withdraw their own entry from any tree that is not their home. A Root may remove any placement from their tree. Removing a placement never deletes the person or their connections. |
| Removing from the home tree | Not possible directly: change the home first, or delete the entry. |

### Who edits what

`private.can_edit_person(p)` reads the person's **home tree** `h`:

1. A Root of `h`.
2. The person themselves (`self_person_id`, or an approved claim). This rule
   doesn't ask which trees they're on, and neither do the documents and
   photos rules that trust it, so only the steps in section 8 may set
   `self_person_id` (Step 42).
3. A Branch or a Leaf **in `h`** who owns the entry, or who created it while
   it is still unclaimed.
4. A Branch **in `h`** on whose part of a Root's side the entry sits, unless
   it is another member's own entry.

`private.can_fill_person(p)` (Step 44), also read in `h`: a Branch or a Leaf
**in `h`** may fill in what's missing on an entry on their own line there
(`private.line_ids`, as for adding relatives) that is nobody's own — no
member's entry, no approved claim. `fill_person_blanks` sets only empty fields
(names, sex, date and place of birth, a death's date and place for someone
already marked as having died, and a photo where there's none) and never
changes or clears one. For a Branch it reaches past their side. A fill of an
entry a Root owns or added is recorded for the Root's undo, as a Branch's edit
is.

So the Root of a founded tree can place and arrange a relative brought from
another tree, but cannot rewrite their details unless that person moves their
home over. A person who is their own entry always controls it, wherever it is
shown. The Root's undo of a Branch edit (Step 22.4) applies to Branches of
`h`.

`private.can_edit_relationship(r)`: the member who drew it, a Root of any
tree on which **both** ends are actively placed, or a Branch of such a tree
with both ends on their side there. Drawing a new line requires the same of
the tree it is drawn on. The bloodline gate asks a blood tie of new entries
and of people brought over, not of a line between two people already there.

`private.can_delete_person(p)`: a Root of `h`; otherwise the Step 22.3 rule
for the creator, evaluated in `h`.

Pets stay on one tree (the tree they were added to) and their companions must
be placed there.

## 5. Per-tree boards, banks and inboxes

| Thing | Scope | Who sees it |
|---|---|---|
| Comments and flags (`entry_comments.tree_id`) | One board per tree per person | Members of that tree |
| Documents (`documents.tree_id`, `shared_across_trees`) | Uploaded onto one tree | Step 18.4 rule evaluated in that tree; when shared, the same rule in every tree the person is placed on |
| Profile photo | Part of the person | Everyone who can see the person |
| Notifications (`notifications.tree_id`) | One inbox per tree | The recipient, on that tree's tab of `/account` |
| Claims, revisions | Per person | As before, with "admin" meaning a Root of the home tree |

Who may flip `shared_across_trees` on a document: the person the entry
belongs to, or a Root of the entry's home tree. A merge that moves a document
onto another entry (a claim invite folding one in, Step 41.3, or "This is
me", Step 43) leaves it unshared, since that entry may be shown on trees the
old one never was; the person can share it again.

## 6. Seeing across trees

- A Root may make their tree **viewable** by the members of another tree they
  themselves belong to (`tree_visibility (tree_id, viewer_tree_id)`). Only a
  Root may; only for trees they are a member of; revocable at any time.
- Members of the viewer tree reach it through the shared person's card
  ("Also on: The Suleman tree") and see it read-only: no comments, no edits,
  no documents, no account types, with a "request to join" button that files
  an invite request with that tree's Roots.
- Any person can mark their own entry **hidden from visitors**
  (`people.hidden_from_visitors`). A hidden entry is drawn blurred, with no
  name or details, on a tree the viewer is not a member of. A Root of the home
  tree may set it for an unclaimed entry.

## 7. Invites

| Kind | Who may send | What redeeming does |
|---|---|---|
| Join as a Leaf | Any member: Root, Branch or Leaf | Adds a membership in the inviter's tree. An existing member of another tree gains a second membership; no second profile. If they have their own entry, it's shown on this tree too, active, since accepting is their say-so; every Root of the tree is told (`placed_on_join`) and can take it off from "Who This Tree Shows" (Step 30.9). They land on it. |
| Claim an entry | As Step 22.1, evaluated in the entry's home tree; or a Root approving a request to join as an entry on their tree that the name matches (Step 30.3); or the member a relative's ask went to, as an entry the newcomer's name matches on the tree they picked, where Step 22.1 lets them (Step 41.1) | As above, plus the vouch for that entry. Someone with no entry of their own claims it there and then and lands on it (Step 30.2); if it's spoken for by then, onboarding as usual. A member who already has an entry lands on theirs, shown on this tree (Step 41.3). The invite's entry folds into it when only its maker has built on it, nobody is behind it and it's on no other tree: theirs takes its place, lines, notes and documents and all, and it's deleted. It never folds in if either of them has died, a line joins them, or they were born more than a year apart. Otherwise both stay, and every Root is told either way. |
| **Founder** | Any Root | Creates a brand-new tree (“Family” until they rename it; `private.default_tree_name`), makes them its Root, and sends them to onboarding on it. Refused if the address already founded a tree. |

The beta is "by invite only" because only these paths create trees: there is
no public "start a tree" page. The home page's "start a tree (beta)" only
asks (Step 28). Signed out it joins a waitlist, which a reviewer answers with
a founder invite; signed in it asks for the permission `found_tree` checks.

Asking to join works the same way. A share link's "request access" names its
tree; the home page's "request access" first looks for one showing a living,
unclaimed entry that strongly matches the name typed, and tells the person
which tree, never which entry. With no match, they can ask a relative who's
on ancestree (Step 30.5): they type the relative's address, and if it's a
member's, that member alone is emailed and finds an invite filled in with
the newcomer's name and email on their account page, to send into any tree
they're on — as a Leaf, like any invite — or dismiss. The screen answers the
same whether the address belongs to anyone, so it never says who's a member,
and the asks are capped (3 a day per address asking, 2 a day and 5 a week
per member, 10 an hour and 30 a day across the site), past which they're
dropped silently. Every ask counts toward the caps on the address and the
site, whoever it was to, and those are checked before anyone is looked up
(Step 41.5). A member can untick "Relatives can ask me to invite them" on
their settings, and then nobody's ask reaches them, while the newcomer is
told the same as ever; an ask they leave for 30 days lapses. Or the
newcomer joins the waitlist, which says it's for starting a tree from
scratch. Both waitlist forms take the same privacy tick as asking
to join (Step 30.6), since the founder invite a reviewer's yes sends doesn't
ask again.

Whoever answers hears at once (Step 30.1). A new request to join emails every
Root of that tree, and a new request to start one — from the waitlist or a
member — emails every beta reviewer who runs a tree; each email's button opens
the request on the right admin console, signing them in first if need be.
Asking again emails nobody. The forms are public, so the alerts are capped (5
an hour and 20 a day per tree; 10 an hour and 30 a day for the waitlist; a
member's ask isn't capped): past the cap a request still waits in the queue,
silently. The addresses come from `tree_root_emails` and `beta_reviewer_emails`,
which only the service role may call.

The Roots who review the ask do see which entries the name matches (Step
30.3): living entries on their tree that nobody is behind yet, scored as
onboarding scores a typed name (`invite_request_candidates`, Roots of that
tree only, who see the whole tree anyway). Approving the ask as one of them
makes the invite a claim invite for it, so accepting claims it; approving
without one leaves them to find or add themselves on onboarding.

The member a relative's ask went to gets the same list (Step 41.1), since a
newcomer with no strong match is often on the tree under another spelling:
once they've picked a tree, the entries on it that the newcomer's name
matches, scored the same way (`invite_relay_candidates`). Only that member
may ask, of a tree they're on, and only entries they could invite someone to
claim anyway are listed (Step 22.1's rule, judged on the entry's home tree),
so a Leaf sees only what they added, and nobody who has died or is claimed.
"Invite as <name>" sends a claim invite into the tree they picked, which
must show the entry: accepting claims it and opens the canvas on it.
"None of these, invite without an entry" sends the plain invite as before.

Every emailed invite keeps a record in its tree's "Sent invites", which only
that tree's Roots see: who it went to, who sent it and when, whether the
email went, and the entry it claims, if any (Step 38). A claim invite — from
the entry's card, the add-relative form, a Root approving an ask as that
entry, or a member answering a relative's ask as it (Step 41.1) — is also
shown on the entry's card to every member of the tree: who
sent it and when, and until when it works, or that it expired unused. The
address it went to shows there only to a Root and to whoever sent it. A
share link or a visitor from another tree sees none of it.

Someone who signs in without an invite is sent on by the address they've
just verified, and by nothing else (Step 30.8): to an invite emailed to it,
whose page asks for the privacy tick before it redeems anything; else to
where their request to join stands; else to request access, with that
address filled in. Someone whose address is a member's already, opening an
invite emailed to it while signed out, isn't signed in on the invite's
say-so: the page emails that address a sign-in link that comes back to the
invite, and joining from there is theirs to press.

## 8. Accounts that span trees

- `/account` lists every tree the member belongs to with their type in each,
  the trees they run, pending placement requests, and one inbox tab per tree.
- Deleting an account: in each tree, the member's contributions pass to a
  Root of that tree; if they were the last Root of a tree they must name a
  successor there first. A Root's Branches pass the same way and count
  toward the new Root's four, even past four (Step 39).
- `profiles.self_person_id` is the member's one own entry, wherever it is
  placed. Only these set it: adding themselves on onboarding or the
  founder's first run, "that's me" on onboarding, "This is me" on an entry,
  and accepting a claim invite. It's cleared when that entry is deleted, a
  Root reverses the claim, or its tree is deleted. `invited_by_user_id` is
  set once, by the invite that made the profile.
- A member can change only their name and whether relatives can ask them
  to invite them. They can't set their own entry or who invited them, and
  can't make a profile themselves: accepting an invite or the co-admin
  sign-in does (Step 42). The column grants say so, and `profiles_guard`
  holds both links even if a grant comes back.

## 9. What was removed

The Step 9 seam (`tree_bridges`, `start_own_tree`, `/trees/new` as a copy of
the person) and the Step 14.1 canvas-interest register are gone. Both copied
or queued for a second person row; placements make that unnecessary.
