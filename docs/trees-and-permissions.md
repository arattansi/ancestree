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
   Canopy in another.
5. A person's **details** are governed by their home tree's rules and by the
   person themselves. What a tree may do with a placed person is governed by
   that tree's rules.

## 2. Trees

| | |
|---|---|
| Founding | A member founds a tree from `/trees/new` once a **beta reviewer** has approved their request (Step 28, "start a tree (beta)" on the home page or `/trees`), or a newcomer founds one by redeeming a **founder invite** — from any Root, or from a reviewer approving them off the waitlist. A founder is that tree's first Root. Either way they land on the founder's first run (Step 29): invite, their own entry (added, or brought over from another tree), the tree's name, their close family. |
| Beta requests | `tree_requests`, answered by the addresses in `private.beta_reviewers` (the build owner and Raiya Suleman). A member's approval is their permission to found; `found_tree` refuses anyone else. A reviewer may always found. Only reviewers see the queue; a member sees their own ask. |
| One each | A member may found **one** tree (`trees.created_by` is unique). Being a Root of several trees is fine; founding several is not. |
| Roots | Every tree has at least one Root, for good. The last Root may leave only by handing the tree to a successor (`deleteAccount(successorId)`, per tree). |
| Naming | `trees.name` is shown; `trees.slug` is the URL segment (`/t/<slug>/…`). Slugs are unique and only a Root may rename a tree. |
| Bloodline gate | Per tree (`bloodline_anchors.tree_id`). A founded tree is anchored on its founder's own entry, set when they add, claim or bring themselves there (Step 29: `place_people` anchors the founder's own entry); the first tree keeps its two original anchors. A married-in member on any tree is held to that tree's bloodline, and the refusal points them at founding a tree of their own. |
| Deleting a tree | A Root may delete a tree they run (`delete_tree`, from the admin page's Data & privacy card). Every person whose home it was moves home to the other tree they were placed on first, or is deleted with the tree if there is none; a member whose own entry goes starts over on their next tree's onboarding. Its boards, banks, companions, invites and share links go with it. |

## 3. Membership and account types

`tree_members (tree_id, user_id, role)` is the only place an account type is
stored. The four keys are unchanged (`admin`, `branch_admin`, `member`,
`leaf`), shown as **Root / Branch / Canopy / Leaf**, and mean what they meant
in Step 18 **within that tree**:

| Type | In this tree they can |
|---|---|
| **Root** | Edit every entry whose home is this tree, and any connection drawn between two people placed on it. Run the tree: members and their types, invites (including founder invites), share links, placements, cross-tree viewing, deletes, lineage, verification. |
| **Branch** | Tend their part of a Root's side, measured on this tree's people only. Everything else as Step 22. |
| **Canopy** | What they add here, the lines they draw, and their own entry. |
| **Leaf** | Their own entry; read, comment, flag and claim. |

Rules that follow:

- A type is set by a Root **of that tree** and applies only there. Becoming a
  Root elsewhere changes nothing here.
- "Root is permanent" holds per tree (`tree_members_protect_role`).
- The Leaf guards look at the role **in the tree being written to** — the tree
  a person is being added to, or a connection is being drawn on.
- A member joins a tree through an invite (as Canopy or Leaf), by founding it
  (as Root), or by accepting a placement of their own entry (as Canopy, so
  they can keep their own entry up to date there; a Root may change that).

## 4. People: home trees and placements

`people.tree_id` is the person's **home tree**. `tree_placements (tree_id,
person_id, status, pos_*)` says which trees show them and where the card
sits on each canvas. The home tree always has an active placement; every
other placement is added by a Root of the receiving tree.

| | Rule |
|---|---|
| Bringing people over | When a member founds a tree, or later from the "People from other trees" card on `/t/<slug>/admin`, a Root picks anyone they can see on a tree they belong to. Each pick becomes a placement. |
| Consent | If the person is a member's own entry (their `self_person_id` or a settled claim) and that member is not the one placing them, the placement is **pending** until they accept (`placement_requested` notification, accept or decline on `/account`). Pending placements are not drawn. Anyone else's entry (an unclaimed relative, a grandparent) is placed at once. |
| Home tree choice | A member chooses which of the trees they are placed on is their home (`/account` → Your entry). A Root of the current home tree may also move an unclaimed entry's home to another tree it is placed on. |
| Leaving | A person may withdraw their own entry from any tree that is not their home. A Root may remove any placement from their tree. Removing a placement never deletes the person or their connections. |
| Removing from the home tree | Not possible directly: change the home first, or delete the entry. |

### Who edits what

`private.can_edit_person(p)` reads the person's **home tree** `h`:

1. A Root of `h`.
2. The person themselves (`self_person_id`, or an approved claim).
3. A Branch or Canopy member **in `h`** who owns the entry, or who created it
   while it is still unclaimed.
4. A Branch **in `h`** on whose part of a Root's side the entry sits, unless
   it is another member's own entry.

So the Root of a founded tree can place and arrange a relative brought from
another tree, but cannot rewrite their details unless that person moves their
home over. A person who is their own entry always controls it, wherever it is
shown. The Root's undo of a Branch edit (Step 22.4) applies to Branches of
`h`.

`private.can_edit_relationship(r)`: the member who drew it, a Root of any
tree on which **both** ends are actively placed, or a Branch of such a tree
with both ends on their side there. Drawing a new line requires the same of
the tree it is drawn on, plus the bloodline gate of that tree.

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
belongs to, or a Root of the entry's home tree.

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
| Join as Canopy / Leaf | Root (either); Branch or Canopy (Leaf only) | Adds a membership in the inviter's tree. An existing member of another tree gains a second membership; no second profile. |
| Claim an entry | As Step 22.1, evaluated in the entry's home tree | As above, plus the vouch for that entry. Someone with no entry of their own claims it there and then and lands on it (Step 30.2); if it's spoken for by then, onboarding as usual. A member who already has an entry keeps the vouch, to claim it from the canvas. |
| **Founder** | Any Root | Creates a brand-new tree (“Family” until they rename it; `private.default_tree_name`), makes them its Root, and sends them to onboarding on it. Refused if the address already founded a tree. |

The beta is "by invite only" because only these paths create trees: there is
no public "start a tree" page. The home page's "start a tree (beta)" only
asks (Step 28). Signed out it joins a waitlist, which a reviewer answers with
a founder invite; signed in it asks for the permission `found_tree` checks.

Asking to join works the same way. A share link's "request access" names its
tree; the home page's "request access" first looks for one showing a living,
unclaimed entry that strongly matches the name typed, and tells the person
which tree, never which entry. With no match, it points them at a relative
who can invite them directly, or at the waitlist.

Whoever answers hears at once (Step 30.1). A new request to join emails every
Root of that tree, and a new request to start one — from the waitlist or a
member — emails every beta reviewer who runs a tree; each email's button opens
the request on the right admin console, signing them in first if need be.
Asking again emails nobody. The forms are public, so the alerts are capped (5
an hour and 20 a day per tree; 10 an hour and 30 a day for the waitlist; a
member's ask isn't capped): past the cap a request still waits in the queue,
silently. The addresses come from `tree_root_emails` and `beta_reviewer_emails`,
which only the service role may call.

## 8. Accounts that span trees

- `/account` lists every tree the member belongs to with their type in each,
  the trees they run, pending placement requests, and one inbox tab per tree.
- Deleting an account: in each tree, the member's contributions pass to a
  Root of that tree; if they were the last Root of a tree they must name a
  successor there first.
- `profiles.self_person_id` is the member's one own entry, wherever it is
  placed.

## 9. What was removed

The Step 9 seam (`tree_bridges`, `start_own_tree`, `/trees/new` as a copy of
the person) and the Step 14.1 canvas-interest register are gone. Both copied
or queued for a second person row; placements make that unnecessary.
