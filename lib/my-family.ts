/**
 * My Family Tree (Step 92): every account's own view, gathered from every
 * tree it's a member of and joined through the entries those trees share —
 * one `people` row is placed on many trees, and a line is a fact about two
 * people, not a tree. A view only: nothing is added there.
 *
 * Who's in (Aalim, 2026-09-30):
 * - their blood: the Step 55 walk from their own entry — up every parent
 *   line, then down parent lines and across sibling lines;
 * - the blood of their current partner(s): a spouse line not marked ended.
 *   An ex's family stays out;
 * - then, as cards only, anyone in those two married or had children with,
 *   exes and co-parents included — and not *their* families.
 *
 * So Karim sees his father's side through his cousin Aalim, with Aalim's mom
 * and Raiya there only as partners; Raiya, married to Aalim, sees both of
 * Aalim's sides as well as her own family.
 *
 * Pure: `lib/my-family.server.ts` reads the trees, merges them with
 * `mergeShowings` and `mergeLines`, and keeps whom `familyTies` names.
 */

import { bloodlineIds } from "@/lib/bloodline";
import { partnersOf, type WalkEdge } from "@/lib/graph-walk";
import type { TreeGraphEdge } from "@/lib/tree";

/** A line as the rule reads it: a marriage that ended is a former partner's. */
export type FamilyEdge = WalkEdge & { is_divorced: boolean };

/** How someone is in My Family Tree. */
export type FamilyTie =
  /** Shares an ancestor with the viewer, the viewer included (Step 55). */
  | "blood"
  /** A current partner of the viewer, or shares an ancestor with one. */
  | "partner_blood"
  /** Married, or had a child with, someone above: shown alone, without
   *  their own family. */
  | "partner";

/** Everyone the viewer's current partners are: a spouse line not ended. */
function currentPartnersOf(
  selfId: string,
  edges: readonly FamilyEdge[],
): string[] {
  return edges.flatMap((e) => {
    if (e.type !== "spouse" || e.is_divorced) return [];
    if (e.from_person === selfId) return [e.to_person];
    if (e.to_person === selfId) return [e.from_person];
    return [];
  });
}

/** Everyone who had a child with someone in `people`: the child's other
 *  parents, whether or not they ever married. */
function coParentsOf(
  people: ReadonlySet<string>,
  edges: readonly FamilyEdge[],
): Set<string> {
  const parentsByChild = new Map<string, string[]>();
  for (const e of edges) {
    if (e.type !== "parent") continue;
    const parents = parentsByChild.get(e.to_person);
    if (parents) parents.push(e.from_person);
    else parentsByChild.set(e.to_person, [e.from_person]);
  }
  const coParents = new Set<string>();
  for (const parents of parentsByChild.values()) {
    if (!parents.some((p) => people.has(p))) continue;
    for (const p of parents) coParents.add(p);
  }
  return coParents;
}

/**
 * Who's in the viewer's My Family Tree, and how, from their own entry and
 * the lines their trees draw. The viewer is always in, as blood, even with
 * no lines yet.
 */
export function familyTies(
  selfId: string,
  edges: readonly FamilyEdge[],
): Map<string, FamilyTie> {
  const ties = new Map<string, FamilyTie>();
  for (const id of bloodlineIds([selfId], edges)) ties.set(id, "blood");
  const partners = currentPartnersOf(selfId, edges);
  for (const id of bloodlineIds(partners, edges)) {
    if (!ties.has(id)) ties.set(id, "partner_blood");
  }
  // One step out from everyone in, and no further: a partner's or
  // co-parent's own family never comes with them.
  const inside = new Set(ties.keys());
  for (const id of [
    ...partnersOf(inside, edges),
    ...coParentsOf(inside, edges),
  ]) {
    if (!ties.has(id)) ties.set(id, "partner");
  }
  return ties;
}

/** One of the viewer's trees showing someone. */
export type Showing<R extends { id: string }> = {
  treeId: string;
  /** The card as that tree shows it. */
  row: R;
  /** Only their name and place of birth, waiting on a yes (Step 80). */
  basic: boolean;
  /** That tree is their home tree. */
  isHome: boolean;
  /** When that tree placed them; null when it isn't known. */
  placedAt: string | null;
};

/** Someone on My Family Tree: one card, whichever trees show them. */
export type MergedCard<R> = {
  row: R;
  /** The tree the card comes from, whose mark it wears (Step 92). */
  treeId: string;
  /** Every one of the viewer's trees that shows them, in the key's order. */
  treeIds: string[];
};

/**
 * Which showing a card comes from: their home tree, when the viewer is a
 * member there; else the viewer's tree that has shown them in full longest
 * (the same rule `delete_tree` picks a new home by); else one showing their
 * basic card, longest first. A full card beats a basic one (Step 80).
 */
export function cardShowing<R extends { id: string }>(
  showings: readonly Showing<R>[],
): Showing<R> | null {
  const home = showings.find((s) => s.isHome && !s.basic);
  if (home) return home;
  const since = (s: Showing<R>) =>
    (s.placedAt ? Date.parse(s.placedAt) : NaN) || Infinity;
  const longest = (a: Showing<R>, b: Showing<R>) =>
    since(a) - since(b) || a.treeId.localeCompare(b.treeId);
  return (
    [...showings.filter((s) => !s.basic)].sort(longest)[0] ??
    [...showings].sort(longest)[0] ??
    null
  );
}

/**
 * Every tree's showings of everyone as one card each, by person id. `trees`
 * are the viewer's trees in the key's order, which each card's `treeIds`
 * follow.
 */
export function mergeShowings<R extends { id: string }>(
  showings: readonly Showing<R>[],
  trees: readonly string[],
): Map<string, MergedCard<R>> {
  const byPerson = new Map<string, Showing<R>[]>();
  for (const s of showings) {
    const list = byPerson.get(s.row.id);
    if (list) list.push(s);
    else byPerson.set(s.row.id, [s]);
  }
  const order = new Map(trees.map((id, i) => [id, i]));
  const cards = new Map<string, MergedCard<R>>();
  for (const [id, list] of byPerson) {
    const chosen = cardShowing(list);
    if (!chosen) continue;
    const treeIds = [...new Set(list.map((s) => s.treeId))].sort(
      (a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity),
    );
    cards.set(id, { row: chosen.row, treeId: chosen.treeId, treeIds });
  }
  return cards;
}

/** A line on My Family Tree, and the tree it was drawn on. */
export type FamilyLine = TreeGraphEdge & { drawn_on_tree_id: string | null };

/**
 * Every tree's copy of each line as one, by id. A tree that shows only a
 * basic card at one end keeps the line's dates back unless it was drawn
 * there (Step 80); any of the viewer's trees that shows them shows them
 * here, and a line drawn on any of the viewer's trees is drawn here.
 */
export function mergeLines(lines: readonly FamilyLine[]): FamilyLine[] {
  const byId = new Map<string, FamilyLine>();
  for (const line of lines) {
    const seen = byId.get(line.id);
    if (!seen) {
      byId.set(line.id, { ...line });
      continue;
    }
    seen.marriage_date ??= line.marriage_date;
    seen.marriage_month ??= line.marriage_month;
    seen.marriage_day ??= line.marriage_day;
    seen.divorce_date ??= line.divorce_date;
    seen.drawn_here ||= line.drawn_here;
  }
  return [...byId.values()];
}

/**
 * A tree's mark on My Family Tree's cards and key (Step 92): two hues, the
 * data-viz reference palette's blue and magenta (`--tree-mark-1`, `-2` in
 * globals.css; docs/design-system.md "Tree marks"), filled for the first
 * two trees and as rings for the next two. Past four the marks repeat; the
 * key and the sheet name every tree.
 */
export type TreeMark = { colour: string; ring: boolean };

const TREE_MARK_COLOURS = ["var(--tree-mark-1)", "var(--tree-mark-2)"];

/** The mark of the viewer's `index`th tree, in the order they joined. */
export function treeMarkOf(index: number): TreeMark {
  const n = TREE_MARK_COLOURS.length;
  const slot = ((index % (2 * n)) + 2 * n) % (2 * n);
  return { colour: TREE_MARK_COLOURS[slot % n], ring: slot >= n };
}

/**
 * The canvas's name for My Family Tree where a tree's id would go (Step
 * 92.2): what this tab keeps of the view (`use-canvas-memory`) and its
 * cards' drops (none: nothing is dragged there) are kept under it.
 */
export const MY_FAMILY_VIEW = "my-family";

/** One of the viewer's trees as the view's key and cards show it. */
export type FamilyViewTree = { id: string; name: string; mark: TreeMark };

/** Which of the viewer's trees a card on the view comes from, and is on. */
export type FamilyShowing = {
  /** The card's tree, whose mark it wears. */
  tree_id: string;
  /** Every one of the viewer's trees that shows them, in the key's order. */
  tree_ids: string[];
};

/**
 * The companions My Family Tree hangs off its people (Step 92.2): those
 * with someone in the view, each kept to whom the view shows. A pet stays
 * on the one tree it was added to, so no two trees bring the same one. A
 * primary companion the view leaves out is let go, and the chip hangs
 * from the topmost of those shown, as on a tree whose primary was deleted.
 */
export function companionsShowing<
  P extends { companions: string[]; primary_person_id: string | null },
>(pets: readonly P[], shown: ReadonlySet<string>): P[] {
  return pets.flatMap((pet) => {
    const companions = pet.companions.filter((id) => shown.has(id));
    if (companions.length === 0) return [];
    if (companions.length === pet.companions.length) return [pet];
    const primary = pet.primary_person_id;
    return [
      {
        ...pet,
        companions,
        primary_person_id: primary && shown.has(primary) ? primary : null,
      },
    ];
  });
}
