/**
 * Branches, mirrored from `private.branch_ids` and `private.can_edit_person`
 * (Step 15).
 *
 * A branch admin curates the part of the tree they belong to. Their branch is
 * derived from their own entry with the same up-then-down walk the bloodline
 * gate uses — ancestors, then everyone descending from that whole set — plus,
 * one step only, the partners those people married.
 *
 * Up-then-down is what draws the boundary. Walking parent edges undirected
 * would leak: from a niece up to her *other* parent, and that parent's whole
 * birth family joins the branch. This way a spouse is on the branch but a
 * spouse's parents are not.
 *
 * The database is the enforcement point. This is the tested statement of the
 * rule, used to decide what the UI offers without a round trip per card.
 */

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

/** Who is asking, and what their role lets them reach. */
export type Viewer = {
  userId: string;
  role: string;
  /** The viewer's branch, or `null` when they are not a branch admin. */
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
 * Mirrors `private.can_edit_person`: admin, current owner, the original
 * creator while the entry is still unclaimed — or a branch admin anywhere on
 * their own branch, as long as the entry isn't somebody else's own.
 */
export function canEditEntry(entry: EntrySubject, viewer: Viewer): boolean {
  if (viewer.role === "admin") return true;
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
 * Mirrors `private.can_edit_relationship`. Both ends have to be on the branch:
 * one alone would let a branch admin redraw the line into someone else's
 * family, which is the leak the walk exists to prevent.
 */
export function canEditConnection(
  connection: {
    from_person: string;
    to_person: string;
    created_by: string | null;
  },
  viewer: Viewer,
): boolean {
  if (viewer.role === "admin") return true;
  if (connection.created_by === viewer.userId) return true;
  return (
    isOnBranch(connection.from_person, viewer) &&
    isOnBranch(connection.to_person, viewer)
  );
}

function isOnBranch(personId: string, viewer: Viewer): boolean {
  return viewer.role === "branch_admin" && !!viewer.branch?.has(personId);
}
