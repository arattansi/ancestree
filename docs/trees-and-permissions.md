# Trees, account types and permissions

The reference for how Ancestree works once there is more than one tree
(Step 25). `ANCESTREE.md` describes the code; this page describes the rules.
The database enforces every rule here; `lib/account-types.ts` and
`lib/branch.ts` mirror them so the UI can decide what to offer without a
round trip.

## 1. The model in five sentences

1. A **tree** is a canvas with its own members, account types, invites, share
   links and inbox.
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
| Founding | A member founds a tree from `/trees/new` once a **beta reviewer** has approved their request (Step 28, "start a tree (beta)" on the home page or `/trees`), or a newcomer founds one by redeeming a **founder invite** — sent when a reviewer approves them off the waitlist (Roots could send one from the Root console until Step 103.2) — or anyone founds one through a reviewer's **campaign link** (`/start/<code>`, Step 103.3), at once, with no request and no approval. A founder is that tree's first Root. Either way they land on the founder's first run (Step 29): invite, their own entry (added, or brought over from another tree), the tree's name, their close family. |
| Beta requests | `tree_requests`, answered by the addresses in `private.beta_reviewers` (the build owner and Raiya Suleman). A member's approval is their permission to found; `found_tree` refuses anyone else. A reviewer may always found. Founding through a campaign link answers any ask of theirs still pending: it's deleted (`redeem_campaign`). Only reviewers see the queue; a member sees their own ask. |
| One each | A member may found **one** tree (`trees.created_by` is unique). Being a Root of several trees is fine; founding several is not. |
| Roots | Every tree has at least one Root, for good, and at most two (Step 39). The last Root may leave only by handing the tree to a successor (`deleteAccount(successorId)`, per tree). |
| Naming | `trees.name` is shown; `trees.slug` is the URL segment (`/t/<slug>/…`). Slugs are unique and only a Root may rename a tree. |
| Bloodline gate | Per tree (`bloodline_anchors.tree_id`). A founded tree is anchored on its founder's own entry, set when they add, claim or bring themselves there (Step 29: `place_people` anchors the founder's own entry); the first tree keeps its two original anchors. The bloodline climbs every parent line from the anchors, then comes down parent lines and across sibling lines (Step 55), so a partner who married in stays out. Everyone added needs a blood tie (Step 55): once their lines are drawn they are blood, or have a line straight to someone who is, as a partner or the other parent of a blood child. Nobody joins only through someone who married in — their parents, siblings, a child from another relationship, a later partner — whoever is adding, a Root or a newcomer adding themselves included, and the refusal names who. "Add a relative" and onboarding say so as soon as the form would be refused, without stopping the submit (Step 55.1). A member who married in can't add their own side of the family, which belongs on a tree of their own. |
| Deleting a tree | A Root may delete a tree they run (`delete_tree`, from the tree's card in the account page's settings, Step 103.2), and a beta reviewer any tree (from the admin page's **manage** tab, Step 103.4; typing its name confirms). Every person whose home it was moves home to the other tree that has shown them in full the longest, or is deleted with the tree if there is none: a tree that shows only their basic card (Step 80) was never given the entry, so doesn't inherit it. A member whose own entry goes starts over on their next tree's onboarding. Its boards, banks, companions, invites and share links go with it. |

## 3. Membership and account types

`tree_members (tree_id, user_id, role)` is the only place an account type is
stored. Three since Step 34, stored as `admin`, `branch_admin` and `member`
and shown as **Root / Branch / Leaf**, each **within that tree**. `member`
was Canopy's key: Step 34 retired the first Leaf (`leaf`, their own entry
and nothing more), moved everyone who was one up to `member`, and gave
Canopy the name.

| Type | In this tree they can |
|---|---|
| **Root** | Edit every entry whose home is this tree, and any connection drawn between two people placed on it. Run the tree: members and their types, invites, share links, placements, cross-tree viewing, deletes, lineage. |
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
- **Children under 18 are added by their parent** (Step 98), whoever
  else is adding, a Root included. Adding someone who could be a child —
  someone's child or sibling once the new lines are drawn, a grandchild
  through anyone in between among them — asks "Is {name} 18 or older?"
  unless the member's own entry is drawn as their parent in the same save.
  A "No" is refused, and so is a date of birth under 18 whatever the
  answer (`add_people_with_connections`, `MINOR`; a year or month that
  straddles the day isn't enough to tell, so it's asked). Nobody is asked
  about someone who has died, a parent or a partner. Behind it, only their
  parent (or they themselves) may give a living person a date of birth
  under 18 by an edit, a fill, an accepted suggestion or an undo. Every
  entry is added through that one call: there's no direct insert, a
  Root's included.
- **Lines ask too** (Step 98.1's follow-up). However a line is drawn —
  adding someone, "Add a connection", a suggested connection — the first
  line that makes someone already on the tree a child or a sibling asks
  "Is {name} 18 or older?" when they're living and nothing says they're
  an adult: no date of birth that does, and nobody has said yes for them
  before (`private.adult_confirmations`; a yes is kept, so it's asked once
  per person). Born under 18, it's refused. Not asked when their parent
  draws it, of their own entry, of the deceased, or of anyone who has a
  parent or sibling line already (`private.relationships_minor_guard`, on
  every insert into `relationships`).
- **Placeholder children** (Step 98.2). Where a child under 18 is refused,
  a Root or a Branch may hold their place instead: **Add a placeholder
  instead** (`add_placeholder_child`) puts an entry with no details at all
  under their parent (one or two, on the tree, one of them living; the
  bloodline gate applies), shown as "First Child", "Second Child"… —
  numbered after that parent's other placeholders when it's made, never
  renumbered (`people.placeholder_number`). A parent who is a member is
  told (`placeholder_child`, with **Fill in**); for one who isn't, whoever
  added it is offered an invite for them to claim their own entry — any
  Root or Branch of the tree may send it, from that offer or the parent's
  card, while a placeholder waits under them there, though the entry is
  off a Branch's side (`can_invite_to_claim_on`) — and
  they're told the same once their entry becomes theirs — by that invite,
  "This is me", an approved claim or a merge — once per placeholder
  (`private.tell_placeholder_parent`, triggered from `profiles`, `claims`
  and `relationships`). Only
  the parent (their own entry is drawn as its parent) fills it in, from
  wherever they are — a tree they aren't a member of included, since their
  own placeholder child, and the child it becomes once theirs, is always
  readable to them (`private.can_see_own_child`): their
  edit clears the number and makes it theirs, an ordinary entry from then
  on. Until then nobody else edits it or fills it in (a Root's rights
  don't reach it), suggests a change, claims it or is invited to, tells a
  story, credits it or tags a photo of it (`private.placeholder_entry_guard`); it's
  left out of name search, "Same person?" and suggested connections. The
  parent, a Root, or the Branch who made it may delete it.
- **Held-back details and the child's claim** (Step 98.3). The children
  under 18 added before Step 98 by someone other than their parent became
  placeholders; what they'd been given is kept in
  `private.withheld_details`, seen only by the parent and the child
  (`withheld_details`). The parent shows the family what they tick, their
  name always among it (`reveal_withheld_details`), or forgets it
  (`forget_withheld_details`); nobody else decides. A Root, a Branch or the
  parent may invite the child to claim any placeholder
  (`can_invite_to_claim_on`): accepting makes it theirs (they see their own
  held-back details and "Your details are hidden from the family until your
  parent approves."), but it stays a placeholder to everyone else, and they
  can't edit it, until the parent shows it. It's claimed only through such
  an invite. A child who already has an entry of their own is merged with
  it on accepting: one record, which takes the placeholder's number and
  holds back what it said, a placeholder on every tree it's on until the
  parent shows it. Once the child has claimed it, the parent can't delete
  it.
- A member joins a tree through an invite (as a Leaf), by founding it (as
  Root, through a reviewer's yes or a campaign link), or by accepting a placement of their own entry (as a Leaf, so they
  can keep their own entry up to date there; a Root may change that).
- A Root may remove a Branch or a Leaf from the Root console
  (`remove_tree_member`). What they added or own whose home is this tree
  passes to that Root: entries (their own among them), lines, invites,
  share links, companions, and who placed each card. The stories they told
  and the album photos they added stay theirs (Steps 88.3, 88.5), nobody's
  once their profile goes.
  If it was their last tree, what they left on other trees passes to that
  Root too, and their profile and sign-in go; a card they placed on a tree
  they had already left stays where it is, with nobody recorded as placing
  it. A Root can't be removed, and can't remove themselves (Step 45).
  Before they confirm, the console tells the Root whether it's the member's
  only tree, so whether their sign-in goes; it never says which other trees
  they're on (Step 46).

## 4. People: home trees and placements

`people.tree_id` is the person's **home tree**. `tree_placements (tree_id,
person_id, status, approval, pos_*)` says which trees show them, how much of
them, and where the card sits on each canvas. The home tree always shows the
whole entry; every other placement is added by a Root of the receiving tree,
or by the person joining it.

| | Rule |
|---|---|
| Bringing people over | When a member founds a tree, or later from the "People from other trees" card on `/t/<slug>/admin`, a Root picks from everyone they can see in full on a tree they belong to: **all descendants of** someone, with the partners they married or had children with unless that's switched off (Step 80, `lib/carry.ts#lineOf`), or anyone one by one. Each pick becomes a placement, and everyone is on the tree at once. Everyone brought over needs a blood tie on this tree, judged across the whole batch (Step 55). |
| Basic cards | What the tree shows of someone brought over waits on a yes (Step 80). Until it comes they are a **basic card**: first or preferred name, last name, place of birth, and their lines. A member's own entry (their `self_person_id` or a settled claim) waits on that member. Nobody's own entry waits on whoever may edit it on its home tree (`private.can_edit_person`): its Roots, the Branch who tends it, the Branch or Leaf who added it. An entry the Root bringing it may edit already, their own included, waits on nobody and comes over whole. |
| Asking | The member is told by notice (`placement_requested`) and by email; everyone asked about nobody's own entries gets one notice (`placements_requested`, in the home tree's inbox) and one email for the batch. Both open **Asked of You** on `/account` settings, where each is approved or declined by itself, or a tree's asks all at once; whoever answers first answers for everyone asked, and whoever brought them over is told once. Nobody is asked twice about the same card. |
| Waiting | An ask waits 30 days (Step 83). After 7 without an answer, whoever was asked gets one reminder by email. After 30 it **lapses**: the card stays basic and says nobody answered, the ask moves to **Earlier** under Asked of You, where a yes is still taken, and the Root who asked is told (`placements_lapsed`) and can **Ask again** from "Who This Tree Shows" — another 30 days, with the notice and the email of a first ask. A decline is an answer, so it isn't asked again. There is no scheduler: a lapse is read off `asked_at` (`private.placement_approval_now`), and the reminder and the word of a lapse go out the next time a member opens the asking tree (`tree_people.nudge_due`, then `run_placement_nudges`, which hands each out once). |
| Answering | A no leaves the basic card where it is. Either answer can be changed later, from the same card (`answer_placements`): a yes taken back makes the card basic again. Saying yes for their own entry makes them a Leaf of that tree, as before. Accepting an invite to the tree counts as saying yes (Step 30.9), a claim invite included (Step 41.3), and so does moving the entry's home there. |
| Home tree choice | A member chooses which of the trees they are placed on is their home (`/account` → Your entry). A Root of the current home tree may also move an unclaimed entry's home to another tree it is placed on. |
| Name only | Step 106: a card on a tree that isn't its home can show **only a name** (`approval` `shell`; `detail` reads it as `basic`, so all of a basic card's rules hold, and `basic_tree_people` drops the place of birth too). It's drawn as a pill, its lines kept. The person makes their own card so from **Your Entry** on `/account` settings (`make_card_name_only`); a member of that tree leaves it too, as `remove_tree_member` would have them (`private.remove_member_from_tree`, what they added passing to its first Root), and its Roots are told. A Root of the tree can't, and nobody leaves their only tree this way. A Root makes anyone's card on their tree name only, from "Brought over so far", unless they're a member there. What the person did, no Root undoes: no yes is asked of a shell or taken for it (`answer_placements`, `placement_asks`), and taking the card off and bringing it back brings the shell back (`private.card_shells` outlives the placement; a Root's shell goes with it). The person lifts any shell on their card, back to the basic card with their yes still to give; a Root lifts one a Root made, back to what it was (`show_card_again`). Joining the tree by an invite, a merge, or moving the entry's home there ends a shell. |
| Leaving | A Root may remove any placement from their tree. The person shown can't take the card off themselves (Step 80): what they take back is the rest of their entry, down to their name (Step 106). Removing a placement never deletes the person or their connections. |
| Removing from the home tree | Not possible directly: change the home first, or delete the entry. |

### What a basic card keeps back

The database keeps it back, not the page (Step 80). `tree_placements.detail`
is `basic` while `approval` is `asked` or `declined`, and `full` otherwise.
An ask that has lapsed (Step 83) is still `asked` in the row, so still
`basic`; the views and `placement_asks` / `tree_carried` call it `lapsed`.

| | On a tree that shows only their basic card |
|---|---|
| The entry | `people` isn't readable through that tree (`private.can_see_person` asks for a full placement). `tree_people` carries the basic card's row from `private.basic_tree_people`: names and place of birth, every other column empty, the same for every member of the tree, its Roots and whoever brought them over included. |
| Photo | Not readable: it follows `can_see_person` and a full placement. |
| Lines | Drawn, from `private.basic_tree_edges`: that a line is there, its kind, and whether a marriage ended. Its dates only on the tree it was drawn on. `relationships` rows are readable when both ends are shown in full, or the line was drawn on a tree the reader belongs to. |
| Building on them | A Root, Branch or Leaf adds relatives of a basic card and draws lines to it as to any card, which is what founding a tree for the other side of the family needs. A line to a basic card is changed by whoever drew it, or a Root of the tree it was drawn on. |
| Stories, album, suggestions | None: a story, an album photo and a suggested change all ask for a full placement, and a basic card's sheet shows no stories or album. |
| Claiming it | As on any tree (Step 83), so someone new to the tree doesn't add themselves twice: the onboarding search and "Is this you?" find a basic card by what it shows — never a maiden name, no dates, and of its parents only those this tree draws — and "This is me" takes a name that matches it. Whoever added the entry is told, in their own tree's inbox, and can dispute. Claiming it on a tree is its owner's yes to showing it there in full, and whoever brought it over is told. A claim a Root reverses makes the card basic again and asks afresh. A Root of the tree may also invite someone to claim it, from the card (Step 84, below). |
| Visitors | **Hidden from visitors** holds: a visitor sees a blurred card with no name. |
| Share links | The basic card, as the tree's members see it. |

### Who edits what

`private.can_edit_person(p)` reads the person's **home tree** `h`:

1. A Root of `h`.
2. The person themselves (`self_person_id`, or an approved claim). This rule
   doesn't ask which trees they're on, and neither do the photo, story and
   album rules that trust it, so only the steps in section 8 may set
   `self_person_id` (Step 42).
3. A Branch or a Leaf **in `h`** who owns the entry, or who created it while
   it is still unclaimed.
4. A Branch **in `h`** on whose part of a Root's side the entry sits, unless
   it is another member's own entry.

Every canvas asks this of `h`, whichever tree is showing the entry (Step
93): on another tree, what its sheet offers (Edit, Fill in, Delete,
inviting someone to claim it) and whether its card moves follow who the
member is on `h`, or nothing but their own entry when they aren't on it.
A Root of the tree being looked at still moves any card on it, and may
invite someone to claim any claimable entry it shows (Step 84).

`private.can_fill_person(p)` (Step 44), also read in `h`: a Branch or a Leaf
**in `h`** may fill in what's missing on an entry on their own line there
(`private.line_ids`, as for adding relatives) that is nobody's own — no
member's entry, no approved claim. `fill_person_blanks` sets only empty fields
(names, sex, date and place of birth, a death's date and place for someone
already marked as having died, and a photo where there's none) and never
changes or clears one. For a Branch it reaches past their side. A fill of an
entry a Root owns or added is recorded for the Root's undo, as a Branch's edit
is.

`public.suggest_entry_change` (Step 67): anyone on a tree an entry is shown
on who can't edit it may suggest a change to its details — names, sex, date
and place of birth, whether they've died, date and place of death — with a
note. The entry's owner, the Roots of its home tree and the Branches there
who tend it (Step 68: whose part of a Root's side it's on, while it's
nobody's own entry) are asked. Anyone who may edit it
(`private.can_edit_person`) accepts, which makes the change as their own
edit, or declines, saying why if they like (Step 69); the suggester is
told either way, with the reason if one was given, and can open a
declined one again to change and send it (Step 71), from the notice or the
entry's card, where only they see their declined ones (Step 72) and can
dismiss them (Step 73), or undo that from its toast (Step 74). A member
has one suggestion waiting per entry: sending another replaces it, and they
can withdraw it while it waits. Only they and whoever may edit the entry see
it.

So the Root of a founded tree can place and arrange a relative brought from
another tree, but cannot rewrite their details unless that person moves their
home over; they can suggest a change instead. A person who is their own entry always controls it, wherever it is
shown. The Root's undo of a Branch edit (Step 22.4) applies to Branches of
`h`.

`private.can_edit_relationship(r)`: the member who drew it, a Root of any
tree that shows **both** ends in full, or a Branch of such a tree with both
ends on their side there; and a Root of the tree it was drawn on while both
ends are on it, a basic card among them (Step 80). Drawing a new line
requires both ends on the tree it is drawn on, in full or not. The bloodline gate asks a blood tie of new entries
and of people brought over, not of a line between two people already there.

A **placeholder child** (Step 98.2) is the exception to all of it:
`can_edit_person` is true only for its parent (`private.is_own_child`),
whatever the caller is on `h`, and `can_fill_person` is never true. Not
even the child, once they've claimed it (Step 98.3): it's theirs to edit
only once their parent has shown it.

`private.can_delete_person(p)`: a Root of `h`, or a placeholder child's
parent until the child has claimed it (Step 98.3); otherwise the Step 22.3 rule
for the creator, evaluated in `h`.

Pets stay on one tree (the tree they were added to) and their companions must
be placed there.

## 5. Per-tree boards, banks and inboxes

| Thing | Scope | Who sees it |
|---|---|---|
| Stories (`stories`, Step 88.3; they replaced the per-tree comments board) | Per person, told from one tree (`tree_id`, whose inbox its teller hears back in) | Approved: members of every tree that shows the person in full, not visitors or a tree's share link (a story's own link, Step 88.4, is below). Waiting: its teller, and whoever approves it: the person themself once the entry is claimed (or is their own) and they're living, else whoever may edit it. Declined: its teller alone. Deleted by its teller or whoever may edit the entry |
| Story links (`story_links`, Step 88.4) | Per story, one per sharer | Public: anyone with the link reads the approved story (not its comments) while its links are on, the person isn't hidden from visitors, and the sharer still sees the story. Made by anyone who can read the story; turned off (all at once, until one of them shares it again) by the person, whoever may edit the entry, or its teller |
| Story comments (`story_comments`, Step 88.4) | Per story | Whoever may read the approved story; written by any of them with no approval; deleted by their author, the story's teller or whoever may edit the entry |
| Reports (`entry_reports`, Step 88.2) | Per person, raised from one tree | Whoever raised it, and whoever may fix it |
| Suggested changes (`entry_suggestions`, Step 67) | Per person, made from one tree | Whoever suggested it, and whoever may edit the entry |
| Album photos (`album_photos`, `album_tags`, Step 88.5; they replaced the per-tree document banks) | Per photo, added on one tree (`tree_id`, whose inbox its uploader hears back in); per person it's of (a tag each) | A tag approved: members of every tree that shows that person in full, not visitors or a share link. Waiting: the uploader, and whoever approves it, the same people as a story. Declined: the uploader alone. Added by any member of a tree showing everyone in it in full; taken out of someone's album by the uploader, its approver or whoever may edit the entry; deleted by the uploader; gone once nobody is in it |
| Profile photo | Part of the person | Everyone who can see the person |
| Notifications (`notifications.tree_id`) | One inbox per tree | The recipient, on that tree's tab of `/account` |
| Claims, revisions | Per person | As before, with "admin" meaning a Root of the home tree |

A merge that folds one entry into another (a claim invite, Step 41.3, or
"This is me", Step 43) moves its stories and its album tags along, keeping
each tag's answer; where the other entry is in a photo already, that tag
stays.

## 6. Seeing across trees

- A Root may make their tree **viewable** by the members of another tree they
  themselves belong to (`tree_visibility (tree_id, viewer_tree_id)`). Only a
  Root may; only for trees they are a member of; revocable at any time.
- Members of the viewer tree reach it through the shared person's card
  ("Also on: The Suleman tree") and see it read-only: no stories, no edits,
  no album, no account types, with a "request to join" button that files
  an invite request with that tree's Roots.
- **My Family Tree** (Step 92) is a member's own family tree, gathered
  from the trees they belong to as one view: their blood relatives (the
  Step 55 walk from their own entry), their own spouse (Step 94.1), and
  whoever else married into that family — anyone a blood relative married
  or had a child with, exes included — but none of *their* family, the
  member's own spouse's included (Step 94; until then a current partner's
  whole family came in, which made the view a copy of the tree). Nothing
  is done *on* it:
  each card acts on its own tree, the one whose mark it wears (their home
  tree when the member is on it, else the member's tree that has shown
  them in full longest), as the member's account type there (Step 92.3).
  Its details follow their home tree's rules, as everywhere; a story, an
  album photo, a report or a suggested change is made from the card's tree
  (whose inbox hears back); a line is changed from the view only where it
  was drawn on a tree the member is a Root or a Branch of. No claim
  invites, "This is me", deletions or companions are offered there, and
  adding a relative goes to the tree the member picks, in that tree's own
  add flow. The database decides every write as before. Two entries in
  it that look like one person entered twice are asked about there,
  **Same person?** (Step 92.4): to the member alone, worked out as the
  page is drawn and never stored. Merging them is a later step.
  It's where a member **lands, every visit** (Step 92.5): signing in, the
  header's mark and the home page's **view your tree** open it, and so
  does **tree** until they switch. Picking a tree — in the switcher, or by
  any link from the view that goes to one — makes it the tree the browser
  remembers until it closes (a session cookie): `/tree`, the add flow,
  **connections** and the Root console mean that tree, and **tree** goes
  back to it, for the rest of that visit. A new visit starts on My Family
  Tree again, with no tree chosen (the tree pages then mean the member's
  home tree). Joining or founding a tree, an invite, and an email's button
  or link that names a tree (an alert's Root console, a story) open that
  tree as before and make it the chosen one. A member it can't be drawn
  for yet — no entry of their own, or on no tree — lands where the canvas
  sends them (onboarding, or their trees page); a visitor's tree and share
  links are unchanged.
- Any person can mark their own entry **hidden from visitors**
  (`people.hidden_from_visitors`). A hidden entry is drawn blurred, with no
  name or details, on a tree the viewer is not a member of. A Root of the home
  tree may set it for an unclaimed entry.

## 7. Invites

| Kind | Who may send | What redeeming does |
|---|---|---|
| Join as a Leaf | Any member: Root, Branch or Leaf | Adds a membership in the inviter's tree. An existing member of another tree gains a second membership; no second profile. If they have their own entry, it's shown on this tree too, in full, since accepting is their say-so, a basic card of theirs there included (Step 80); every Root of the tree is told (`placed_on_join`) and can take it off from "Who This Tree Shows" (Step 30.9). They land on it. |
| Claim an entry | As Step 22.1, evaluated in the entry's home tree, into a tree the sender belongs to that shows the entry; or a Root of a tree that shows the entry, whole or as a basic card, when nobody is behind it and they are living (Step 84, `private.can_invite_to_claim_on`: the invite is sent from that tree's canvas and joins it, names the entry as the card does, and accepting claims it and shows it there in full); or a Root approving a request to join as an entry on their tree that the name matches (Step 30.3); or the member a relative's ask went to, as an entry the newcomer's name matches on the tree they picked, where Step 22.1 lets them (Step 41.1) | As above, plus the vouch for that entry. Someone with no entry of their own claims it there and then and lands on it (Step 30.2); if it's spoken for by then, onboarding as usual. A member who already has an entry lands on theirs, shown on this tree (Step 41.3). The invite's entry folds into it when only its maker has built on it, nobody is behind it and it's on no other tree: theirs takes its place, lines, stories and album photos and all, and it's deleted. It never folds in if either of them has died, a line joins them, or they were born more than a year apart. Otherwise both stay, and every Root is told either way. |
| **Founder** | A beta reviewer approving a waitlist sign-up, from a tree they run (the database still lets any Root bind one, `invites_guard`; the Root console stopped offering it in Step 103.2) | Creates a brand-new tree (“Family” until they rename it; `private.default_tree_name`), makes them its Root, and sends them to onboarding on it. Refused if the address already founded a tree. |
| **Campaign link** | A beta reviewer, from the admin page's **manage** tab (Step 103.3); one open link per place it's posted, not tied to a tree or a person | Anyone may use it, as often as people open it, until a reviewer pauses it. Signed out: name, email and the privacy tick, then the emailed code makes the account and founds the tree. A member: one button, **start my tree**. Either way as a founder invite: a new tree, “Family” until renamed, them its Root, onboarding next. Refused if they've founded a tree already (the page says so and links their trees) or the link is paused. |

Trees are created only by these paths: a reviewer's yes (to a request or
the waitlist) or a reviewer's campaign link. The home page's "start a tree
(beta)" only asks (Step 28). Signed out it joins a waitlist, which a reviewer
answers with a founder invite; signed in it asks for the permission
`found_tree` checks. A campaign link (`/start/<code>`) is public on
purpose: whoever a reviewer gives it to may start a tree without asking.
Each counts its opens (not crawlers, link previews or prefetches), its
sign-ups (new accounts) and the trees founded through it; nothing records
who came in through which link (`public.campaigns`, reached only through
its functions: `list_campaigns`, `create_campaign`, `update_campaign`,
`set_campaign_paused` for reviewers, `campaign_open` for the service role,
`redeem_campaign` for whoever signs up).

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
the request where it's answered (a Root console, or for a request to start a
tree the admin page's manage tab, Step 103), signing them in first if need
be.
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
  the trees they run, what other trees have asked to show in full (**Asked
  of You**, Step 80), and one inbox tab per tree.
- Deleting an account: in each tree, the member's contributions pass to a
  Root of that tree; if they were the last Root of a tree they must name a
  successor there first. A Root's Branches pass the same way and count
  toward the new Root's four, even past four (Step 39).
- A beta reviewer may delete any account but their own and the other
  reviewers' from the admin page's **manage** tab (Step 103.4), the same
  way (`lib/account-deletion.server.ts#deleteAccountOf`): they name the
  successor where it was a tree's only Root, and a tree with nobody else
  on it must be deleted first. They may also **suspend** an account, and
  **restore** it: a ban in Supabase Auth, so it can't sign in ("This
  account is suspended.") or refresh its session, and a session already
  open is signed out on its next page, action or API call. The database
  refuses a suspended account's token outright: every Data API request
  (`public.refuse_suspended`, PostgREST's pre-request), and Storage and
  Realtime (restrictive `suspended_refused` policies). Nothing of theirs
  changes.
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
