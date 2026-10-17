/**
 * Where the iPhone app's leaf view asks for a leaf's first parent or first
 * child (Step 187): a dashed "+ parent" over a leaf with no parents, a
 * "+ child" under one with no children, so the top and bottom of a tree
 * aren't left bare and the tree grows from there.
 *
 * Only where the add would be kept: the add form adds on the first of the
 * member's trees that shows the leaf in full (`fullOn[0]`, Step 179.3), and
 * the database judges it on that tree (`add_people_with_connections`), so
 * this asks what it would, first:
 *
 * - nobody is added as a placeholder child's relative (Step 98.2);
 * - a Leaf adds only on their own line (Step 34): a parent of themselves or
 *   an ancestor, a child of anyone descended from those (not of someone who
 *   married in, until the other parent is named);
 * - everyone added needs a blood tie (Step 53): the leaf is blood, or the
 *   tree has no anchors;
 * - only a parent adds a child under 18 (Step 98): a leaf who is under 18
 *   themselves gets no "+ child" unless it's the member's own leaf.
 *
 * The add form still asks everything it asks, and the database has the last
 * word. Pure, so it is tested without a phone.
 */

import { accountTypeOf } from "@/lib/account-types";
import { bloodlineIds } from "@/lib/bloodline";
import { reach, stepsOf, toChildren, toParents, toSiblings, type WalkEdge } from "@/lib/graph-walk";
import { ageFromBirth } from "@/lib/minors";
import { toPartialIso } from "@/lib/partial-date";

/** Which empty rows get a placeholder. */
export type AddRows = { parents: boolean; children: boolean };

export const NO_ADDS: AddRows = { parents: false, children: false };

/** The tree the add form would add on, as far as the member sees it. */
export type AddTree = {
  /** The member's account type there (`tree_members.role`). */
  role: string | null;
  /** Its bloodline's anchors (`bloodline_anchors`). */
  anchors: readonly string[];
  /** Everyone placed on it. */
  people: ReadonlySet<string>;
};

export function addRows({
  leaf,
  selfId,
  has,
  tree,
  lines,
  today,
}: {
  leaf: {
    id: string;
    placeholder_number: number | null;
    date_of_birth: string | null;
    date_of_birth_precision: string | null;
  };
  /** The member's own entry. */
  selfId: string;
  /** Whether the leaf has parents, and children, already. */
  has: AddRows;
  /** The tree the add form would add on; null when none shows them in full. */
  tree: AddTree | null;
  /** Every line the member sees, on any of their trees. */
  lines: readonly WalkEdge[];
  today?: Date;
}): AddRows {
  if (!tree || leaf.placeholder_number != null) return NO_ADDS;
  if (has.parents && has.children) return NO_ADDS;
  // The tree's own lines: both ends placed on it.
  const edges = lines.filter(
    (l) => tree.people.has(l.from_person) && tree.people.has(l.to_person),
  );

  let parents = !has.parents;
  let children = !has.children;

  if (accountTypeOf(tree.role).addRelatives === "line") {
    if (!tree.people.has(selfId)) return NO_ADDS;
    const up = reach([selfId], stepsOf(edges, toParents));
    const line = reach(reach(up, stepsOf(edges, toSiblings)), stepsOf(edges, toChildren));
    parents &&= up.has(leaf.id);
    children &&= line.has(leaf.id);
  }

  if (tree.anchors.length > 0 && !bloodlineIds(tree.anchors, edges).has(leaf.id)) {
    return NO_ADDS;
  }

  if (
    leaf.id !== selfId &&
    ageFromBirth(toPartialIso(leaf.date_of_birth, leaf.date_of_birth_precision), today) ===
      "minor"
  ) {
    children = false;
  }

  return { parents, children };
}
