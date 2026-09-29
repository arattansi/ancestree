/**
 * Walking a tree's lines (Step 77.6, audit R7): the one walk the bloodline,
 * a branch, a person's own line, "Only descendants of" and the canvas's
 * spotlight all take — from a seed, along the steps each line allows, until
 * nobody new turns up. A cycle in the data (a mis-entered parent line) ends
 * on the people already seen rather than going round for ever.
 */

/** A line between two entries, as a walk reads it. */
export type WalkEdge = {
  /** The parent; either end of a spouse or sibling line. */
  from_person: string;
  /** The child; the other end of a spouse or sibling line. */
  to_person: string;
  type: string;
};

/** A step a walk may take: from one end of a line to the other. */
export type Step = readonly [from: string, to: string];

/** `from -> [to]` for every step `stepsFor` finds in an edge. */
export function stepsOf(
  edges: readonly WalkEdge[],
  stepsFor: (e: WalkEdge) => readonly Step[],
): Map<string, string[]> {
  const steps = new Map<string, string[]>();
  for (const e of edges) {
    for (const [from, to] of stepsFor(e)) {
      const next = steps.get(from);
      if (next) next.push(to);
      else steps.set(from, [to]);
    }
  }
  return steps;
}

/** `seed`, and everyone reachable from it along `steps`. */
export function reach(
  seed: Iterable<string>,
  steps: Map<string, string[]>,
): Set<string> {
  const seen = new Set<string>(seed);
  const queue = [...seen];
  while (queue.length > 0) {
    for (const id of steps.get(queue.pop()!) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  return seen;
}

/** Up a parent line: from the child to the parent. */
export const toParents = (e: WalkEdge): Step[] =>
  e.type === "parent" ? [[e.to_person, e.from_person]] : [];

/** Down a parent line: from the parent to the child. */
export const toChildren = (e: WalkEdge): Step[] =>
  e.type === "parent" ? [[e.from_person, e.to_person]] : [];

/** Along a sibling line, either way. */
export const toSiblings = (e: WalkEdge): Step[] =>
  e.type === "sibling"
    ? [
        [e.from_person, e.to_person],
        [e.to_person, e.from_person],
      ]
    : [];

/**
 * Everyone anyone in `people` married, one step out. Returned apart rather
 * than added, so nobody joins for having married another partner.
 */
export function partnersOf(
  people: ReadonlySet<string>,
  edges: readonly WalkEdge[],
): Set<string> {
  const partners = new Set<string>();
  for (const e of edges) {
    if (e.type !== "spouse") continue;
    if (people.has(e.from_person)) partners.add(e.to_person);
    if (people.has(e.to_person)) partners.add(e.from_person);
  }
  return partners;
}
