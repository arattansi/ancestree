/**
 * Branches, mirrored from `private.branch_ids`, `private.own_branch_ids`,
 * `private.line_ids`, `private.can_edit_person`,
 * `private.can_delete_person` and `private.can_fill_person` (Steps 17, 18.1,
 * 22.2, 22.3, 34 and 44), and what each account type may edit (Step 18,
 * `lib/account-types`).
 *
 * A branch is measured from one person with the up-then-down walk the
 * bloodline was first measured with (Step 14, `upThenDownIds`) — ancestors,
 * then everyone descending from that whole set — plus, one step only, the
 * partners those people married. Unlike the bloodline since Step 55, it
 * doesn't follow sibling lines, as `private.branch_ids` doesn't. A Branch
 * account tends the part of a Root's side they are related through
 * (`branchReach`): their own branch, kept to the sides of the Roots they are
 * related to. The tree is its Roots' families joined, and a Branch keeps
 * their own corner of one of those sides in order.
 *
 * Up-then-down is what draws the boundary. Walking parent edges undirected
 * would leak: from a niece up to her *other* parent, and that parent's whole
 * birth family joins the branch. This way a spouse is on the branch but a
 * spouse's parents are not.
 *
 * The database is the enforcement point. This is the tested statement of the
 * rule, used to decide what the UI offers without a round trip per card.
 */

import { accountTypeOf } from "@/lib/account-types";
import { upThenDownIds, type ParentEdge } from "@/lib/bloodline";

export type BranchEdge = ParentEdge;

/** Everyone on `root`'s branch: their blood line, plus who it married. */
export function branchIds(
  root: string,
  edges: readonly BranchEdge[],
): Set<string> {
  const line = upThenDownIds([root], edges);

  // Collected first, added after: a partner joins because someone on the line
  // married them, never because they married another partner.
  const partners = new Set<string>();
  for (const e of edges) {
    if (e.type !== "spouse") continue;
    if (line.has(e.from_person)) partners.add(e.to_person);
    if (line.has(e.to_person)) partners.add(e.from_person);
  }

  for (const id of partners) line.add(id);
  return line;
}

/**
 * The Roots `personId` is related to: every Root whose branch they are on, by
 * blood or by marriage. Mirrors the `where id = private.self_person_id()` half
 * of `private.own_branch_ids`.
 */
export function relatedRoots(
  personId: string,
  rootIds: readonly string[],
  edges: readonly BranchEdge[],
): string[] {
  return rootIds.filter((root) => branchIds(root, edges).has(personId));
}

/**
 * The Roots whose side of the tree `personId` is on (Step 48): the Roots they
 * are blood to, or, if they married in, the Roots whose branch they married
 * into (`relatedRoots`). Blood comes first because a Root married to the other
 * Root is on both branches by marriage, but only on their own side.
 */
export function ownRoots(
  personId: string,
  rootIds: readonly string[],
  edges: readonly BranchEdge[],
): string[] {
  const blood = rootIds.filter((root) =>
    upThenDownIds([root], edges).has(personId),
  );
  return blood.length > 0 ? blood : relatedRoots(personId, rootIds, edges);
}

/**
 * Everyone on `personId`'s Root's side (Step 48), for "Show only your Root's
 * side": the branch of each of their `ownRoots` (both, for a child of two
 * Roots). Empty when they are related to no Root.
 */
export function rootSideIds(
  personId: string,
  rootIds: readonly string[],
  edges: readonly BranchEdge[],
): Set<string> {
  const side = new Set<string>();
  for (const root of ownRoots(personId, rootIds, edges)) {
    for (const id of branchIds(root, edges)) side.add(id);
  }
  return side;
}

/**
 * A person's own line (Step 34), mirroring `private.line_ids`: what a Leaf may
 * add to. The branch walk from them, except that their brothers and sisters,
 * and their ancestors', join before the walk down — so a sibling recorded
 * without the parents they share is on the line, with everyone descended from
 * them. Only siblings of the person and their ancestors: a cousin's
 * half-brother through the cousin's other parent is no blood of theirs.
 */
export function lineIds(
  personId: string,
  edges: readonly BranchEdge[],
): Set<string> {
  const parents = new Map<string, string[]>(); // child -> parents
  const children = new Map<string, string[]>(); // parent -> children
  const siblings = new Map<string, string[]>();
  const link = (map: Map<string, string[]>, from: string, to: string) => {
    const list = map.get(from);
    if (list) list.push(to);
    else map.set(from, [to]);
  };
  for (const e of edges) {
    if (e.type === "parent") {
      link(parents, e.to_person, e.from_person);
      link(children, e.from_person, e.to_person);
    } else if (e.type === "sibling") {
      link(siblings, e.from_person, e.to_person);
      link(siblings, e.to_person, e.from_person);
    }
  }

  const walk = (seed: Iterable<string>, next: Map<string, string[]>) => {
    const seen = new Set<string>(seed);
    const queue = [...seen];
    while (queue.length > 0) {
      for (const id of next.get(queue.pop()!) ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(id);
      }
    }
    return seen;
  };

  const kin = walk(walk([personId], parents), siblings);
  const line = walk(kin, children);

  // As on a branch: a partner joins because someone on the line married
  // them, never because they married another partner.
  const partners = new Set<string>();
  for (const e of edges) {
    if (e.type !== "spouse") continue;
    if (line.has(e.from_person)) partners.add(e.to_person);
    if (line.has(e.to_person)) partners.add(e.from_person);
  }
  for (const id of partners) line.add(id);
  return line;
}

/**
 * What a Branch account tends (Step 22.2): the part of a Root's side they are
 * related through — their own branch, kept to the sides of the Roots they are
 * related to, every such Root's for a child of two founders — and nothing when
 * they are related to none. Mirrors `private.own_branch_ids`.
 *
 * Both halves bound it. From their own entry, a Root's other grandparents'
 * families stay out (Arzu tends Raiya's father's family, not her mother's);
 * kept to a Root's side, the Branch's own in-laws' families stay out too.
 */
export function branchReach(
  selfId: string,
  rootIds: readonly string[],
  edges: readonly BranchEdge[],
): Set<string> {
  const sides = new Set<string>();
  for (const root of rootIds) {
    const branch = branchIds(root, edges);
    if (!branch.has(selfId)) continue;
    for (const id of branch) sides.add(id);
  }

  const reach = new Set<string>();
  for (const id of branchIds(selfId, edges)) {
    if (sides.has(id)) reach.add(id);
  }
  return reach;
}

/** Who is asking, and what their account type lets them reach. */
export type Viewer = {
  userId: string;
  /** `profiles.role`; `lib/account-types` says what it reaches. */
  role: string;
  /** Their own entry. `null` while onboarding. */
  selfPersonId: string | null;
  /** What the viewer tends (`branchReach`), or `null` when not a Branch. */
  branch: ReadonlySet<string> | null;
  /** Where the viewer may add relatives (`lineIds`) when that is only their
   *  own line — a Leaf's — and `null` when it is anywhere. */
  line: ReadonlySet<string> | null;
  /**
   * The viewer's own line (`lineIds`) when they are a Branch or a Leaf with
   * an entry of their own: where they may fill in what's missing on an entry
   * nobody has claimed (Step 44, `canFillEntry`). `null` for a Root, who
   * edits everything, and for anyone still onboarding.
   */
  ownLine: ReadonlySet<string> | null;
};

/** The entry being looked at, as far as permission is concerned. */
export type EntrySubject = {
  id: string;
  owner_user_id: string | null;
  created_by: string | null;
  /** An approved claim has settled on this entry. */
  isClaimed: boolean;
  /** It is another member's own entry — theirs to edit, nobody else's. */
  isSomeoneElsesOwn: boolean;
  /** They have died (`personHasDied`: marked so, or given a date of death).
   *  Bears on claiming only: there is nobody to invite. */
  isDeceased?: boolean;
};

/**
 * Mirrors `private.can_edit_person`: a Root; their own entry; otherwise the
 * current owner, the original creator while the entry is still unclaimed — or
 * a Branch anywhere on their own branch, as long as the entry isn't somebody
 * else's own.
 */
export function canEditEntry(entry: EntrySubject, viewer: Viewer): boolean {
  const { entries } = accountTypeOf(viewer.role);
  if (entries === "tree") return true;
  if (entry.id === viewer.selfPersonId) return true;
  if (entry.owner_user_id === viewer.userId) return true;
  if (
    entry.created_by === viewer.userId &&
    entry.owner_user_id === entry.created_by &&
    !entry.isClaimed
  ) {
    return true;
  }
  return isOnBranch(entry.id, viewer) && !entry.isSomeoneElsesOwn;
}

/**
 * Mirrors `private.can_fill_person` (Step 44): a Branch or a Leaf may fill in
 * what's missing — never change what's there — on an entry on their own line
 * that nobody is behind: no member's own, no approved claim. A Branch
 * already edits their part of a Root's side, so for them it reaches past it.
 * Only asked about entries the viewer can't edit (`canEditEntry`), which
 * leaves a Root out: they edit everything.
 */
export function canFillEntry(entry: EntrySubject, viewer: Viewer): boolean {
  if (accountTypeOf(viewer.role).entries === "tree") return false;
  if (entry.isClaimed || entry.isSomeoneElsesOwn) return false;
  return !!viewer.ownLine?.has(entry.id);
}

/**
 * Mirrors `private.can_invite_to_claim` (Step 22.1): an entry they can edit
 * that nobody is behind yet — the owner never moved away from whoever created
 * it, no claim stuck, it is no member's own, and they are living. So a Root,
 * anywhere; a Branch, on their side or among their own additions; a Leaf,
 * among their own additions.
 */
export function canInviteToClaim(entry: EntrySubject, viewer: Viewer): boolean {
  if (entry.id === viewer.selfPersonId) return false;
  if (entry.isClaimed || entry.isSomeoneElsesOwn) return false;
  if (entry.isDeceased) return false;
  if (entry.owner_user_id !== entry.created_by) return false;
  return canEditEntry(entry, viewer);
}

/**
 * Whether to offer "Delete entry" (Step 22.3). Mirrors the half of
 * `private.can_delete_person` the entry itself can answer: a Root, anything;
 * a Branch or a Leaf, an entry they created that is still theirs — unclaimed,
 * nobody's own, not their own. The other half, that nobody else has hung a
 * connection, comment, document or companion on it, is the database's to
 * check when they try; a refusal then says to ask a Root.
 */
export function canOfferDelete(entry: EntrySubject, viewer: Viewer): boolean {
  if (accountTypeOf(viewer.role).deletes === "tree") return true;
  if (entry.id === viewer.selfPersonId) return false;
  if (entry.isClaimed || entry.isSomeoneElsesOwn) return false;
  return (
    entry.created_by === viewer.userId &&
    entry.owner_user_id === entry.created_by
  );
}

/**
 * Mirrors `private.can_edit_relationship`: a Root; whoever drew it; or a
 * Branch with both ends on their branch. One end alone would let a Branch
 * redraw the line into someone else's family, which is the leak the walk
 * exists to prevent.
 */
export function canEditConnection(
  connection: {
    from_person: string;
    to_person: string;
    created_by: string | null;
  },
  viewer: Viewer,
): boolean {
  if (accountTypeOf(viewer.role).connections === "tree") return true;
  if (connection.created_by === viewer.userId) return true;
  return (
    isOnBranch(connection.from_person, viewer) &&
    isOnBranch(connection.to_person, viewer)
  );
}

/**
 * Mirrors `private.can_edit_pet`: a Root, whoever added the companion, or
 * anyone who can already edit one of the people it lives with — looser than an
 * entry on purpose, since a pet carries no ownership or claim weight. Whether
 * one of its people is editable is the caller's to answer (`canEditEntry`
 * needs the full entry, which only the caller has).
 */
export function canEditCompanion(
  pet: { created_by: string | null; companions: readonly string[] },
  viewer: Viewer,
  canEditPerson: (personId: string) => boolean,
): boolean {
  if (accountTypeOf(viewer.role).companions === "tree") return true;
  if (pet.created_by === viewer.userId) return true;
  return pet.companions.some(canEditPerson);
}

/**
 * Mirrors `private.can_see_documents` (Step 18.4): a Root; the entry's owner,
 * or the member whose own entry it is; or the Branch who tends the side it is
 * on — including another member's own entry, which that Branch can't edit but
 * does look after. Everyone who can edit an entry is in here.
 */
export function canSeeDocuments(entry: EntrySubject, viewer: Viewer): boolean {
  if (accountTypeOf(viewer.role).entries === "tree") return true;
  if (entry.owner_user_id === viewer.userId) return true;
  if (entry.id === viewer.selfPersonId) return true;
  return isOnBranch(entry.id, viewer);
}

/**
 * Whether to offer "Add a relative" from this person (Step 34): from anyone,
 * except that a Leaf adds only on their own line, so only from someone on it.
 * Mirrors the `OWN_LINE` check in `add_people_with_connections`, which has the
 * last word: from someone on the line a Leaf can still reach off it — an
 * in-law's parents, say — and that is refused when it saves.
 */
export function canAddRelativeOf(personId: string, viewer: Viewer): boolean {
  if (accountTypeOf(viewer.role).addRelatives === "tree") return true;
  return !!viewer.line?.has(personId);
}

function isOnBranch(personId: string, viewer: Viewer): boolean {
  return (
    accountTypeOf(viewer.role).entries === "branch" &&
    !!viewer.branch?.has(personId)
  );
}
