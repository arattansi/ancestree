/**
 * Branches, mirrored from `private.branch_ids`, `private.own_branch_ids` and
 * `private.can_edit_person` (Steps 17 and 18.1), and what each account type
 * may edit (Step 18, `lib/account-types`).
 *
 * A branch is measured from one person with the same up-then-down walk the
 * bloodline gate uses — ancestors, then everyone descending from that whole
 * set — plus, one step only, the partners those people married. A Branch
 * account tends the branch of the Root they are related to (`branchReach`),
 * not one measured from themselves: the tree is its Roots' families joined,
 * and a Branch keeps one of those sides in order.
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
import { bloodlineIds, type ParentEdge } from "@/lib/bloodline";

export type BranchEdge = ParentEdge;

/** Everyone on `root`'s branch: their blood line, plus who it married. */
export function branchIds(
  root: string,
  edges: readonly BranchEdge[],
): Set<string> {
  const line = bloodlineIds([root], edges);

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
 * What a Branch account tends (Step 18.1): the branch of the Root they are
 * related to — every such Root's, for a child of two founders — and nothing
 * when they are related to none. Mirrors `private.own_branch_ids`.
 */
export function branchReach(
  selfId: string,
  rootIds: readonly string[],
  edges: readonly BranchEdge[],
): Set<string> {
  const reach = new Set<string>();
  for (const root of rootIds) {
    const branch = branchIds(root, edges);
    if (!branch.has(selfId)) continue;
    for (const id of branch) reach.add(id);
  }
  return reach;
}

/** Who is asking, and what their account type lets them reach. */
export type Viewer = {
  userId: string;
  /** `profiles.role`; `lib/account-types` says what it reaches. */
  role: string;
  /** Their own entry — all a Leaf may edit. `null` while onboarding. */
  selfPersonId: string | null;
  /** What the viewer tends (`branchReach`), or `null` when not a Branch. */
  branch: ReadonlySet<string> | null;
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
};

/**
 * Mirrors `private.can_edit_person`: a Root; a Leaf on their own entry and
 * nowhere else; otherwise the current owner, the original creator while the
 * entry is still unclaimed — or a Branch anywhere on their own branch, as long
 * as the entry isn't somebody else's own.
 */
export function canEditEntry(entry: EntrySubject, viewer: Viewer): boolean {
  const { entries } = accountTypeOf(viewer.role);
  if (entries === "tree") return true;
  if (entries === "self") return entry.id === viewer.selfPersonId;
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
 * Mirrors `private.can_edit_relationship`: a Root; never a Leaf, not even a
 * line they drew before they were one; otherwise whoever drew it, or a Branch
 * with both ends on their branch. One end alone would let a Branch redraw the
 * line into someone else's family, which is the leak the walk exists to
 * prevent.
 */
export function canEditConnection(
  connection: {
    from_person: string;
    to_person: string;
    created_by: string | null;
  },
  viewer: Viewer,
): boolean {
  const { connections } = accountTypeOf(viewer.role);
  if (connections === "tree") return true;
  if (connections === "none") return false;
  if (connection.created_by === viewer.userId) return true;
  return (
    isOnBranch(connection.from_person, viewer) &&
    isOnBranch(connection.to_person, viewer)
  );
}

/**
 * Mirrors `private.can_edit_pet`: a Root, whoever added the companion, or
 * anyone who can already edit one of the people it lives with — looser than an
 * entry on purpose, since a pet carries no ownership or claim weight. A Leaf
 * edits none, even one that lives with them: a pet is its own chip, not part
 * of their entry. Whether one of its people is editable is the caller's to
 * answer (`canEditEntry` needs the full entry, which only the caller has).
 */
export function canEditCompanion(
  pet: { created_by: string | null; companions: readonly string[] },
  viewer: Viewer,
  canEditPerson: (personId: string) => boolean,
): boolean {
  const { companions } = accountTypeOf(viewer.role);
  if (companions === "tree") return true;
  if (companions === "none") return false;
  if (pet.created_by === viewer.userId) return true;
  return pet.companions.some(canEditPerson);
}

function isOnBranch(personId: string, viewer: Viewer): boolean {
  return (
    accountTypeOf(viewer.role).entries === "branch" &&
    !!viewer.branch?.has(personId)
  );
}
