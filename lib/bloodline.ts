/**
 * The bloodline, mirrored from `private.blood_ids` (Steps 14 and 53).
 *
 * From the tree's anchors, climb every `parent` edge upward to all ancestors,
 * then descend from that whole set: down every `parent` edge, and across every
 * `sibling` line, since a blood relative's brother or sister is blood too
 * (Step 53). Direction is the whole point: walking parent edges *undirected*
 * leaks — from a blood member down to their child, then back up to the
 * child's other parent, and every partner who married in lands inside the
 * bloodline. Up-then-down keeps cousins, great-aunts and half-siblings in
 * while keeping married-in partners out.
 *
 * Everyone added to a tree needs a blood tie (Step 53, `withoutBloodTie`):
 * they are blood, or a line joins them straight to someone who is — a
 * partner, or the other parent of a blood child. Nobody joins only through
 * someone who married in, whoever is adding.
 *
 * The database is the enforcement point; this is the tested statement of the
 * rule, and reads and words its refusal.
 */

export type ParentEdge = {
  /** The parent; either end of a spouse or sibling line. */
  from_person: string;
  /** The child; the other end of a spouse or sibling line. */
  to_person: string;
  type: string;
};

type Step = readonly [from: string, to: string];

/** `from -> [to]` for every step `stepsFor` finds in an edge. */
function stepsOf(
  edges: readonly ParentEdge[],
  stepsFor: (e: ParentEdge) => readonly Step[],
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
function reach(
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

const up = (e: ParentEdge): Step[] =>
  e.type === "parent" ? [[e.to_person, e.from_person]] : [];
const down = (e: ParentEdge): Step[] =>
  e.type === "parent" ? [[e.from_person, e.to_person]] : [];
const downAndAcross = (e: ParentEdge): Step[] =>
  e.type === "sibling"
    ? [
        [e.from_person, e.to_person],
        [e.to_person, e.from_person],
      ]
    : down(e);

/**
 * Step 14's walk: up every parent edge from `anchors`, then down every parent
 * edge. Branches are still measured with it (`lib/branch.ts`, mirroring
 * `private.branch_ids`), which never followed sibling lines.
 */
export function upThenDownIds(
  anchors: readonly string[],
  edges: readonly ParentEdge[],
): Set<string> {
  return reach(reach(anchors, stepsOf(edges, up)), stepsOf(edges, down));
}

/** Every person in the bloodline anchored on `anchors`. */
export function bloodlineIds(
  anchors: readonly string[],
  edges: readonly ParentEdge[],
): Set<string> {
  return reach(
    reach(anchors, stepsOf(edges, up)),
    stepsOf(edges, downAndAcross),
  );
}

/** True when `personId` is blood. A tree with no anchors has no gate. */
export function isBloodline(
  personId: string,
  anchors: readonly string[],
  edges: readonly ParentEdge[],
): boolean {
  if (anchors.length === 0) return true;
  return bloodlineIds(anchors, edges).has(personId);
}

/**
 * Of `people`, in order, everyone with no blood tie (Step 53): not blood, and
 * no line of any kind to someone who is. `edges` are the tree's lines once
 * the new ones are drawn. Mirrors `private.without_blood_tie`; empty for a
 * tree with no anchors.
 */
export function withoutBloodTie(
  people: readonly string[],
  anchors: readonly string[],
  edges: readonly ParentEdge[],
): string[] {
  if (anchors.length === 0) return [];
  const blood = bloodlineIds(anchors, edges);
  const tied = new Set(blood);
  for (const e of edges) {
    if (blood.has(e.from_person)) tied.add(e.to_person);
    if (blood.has(e.to_person)) tied.add(e.from_person);
  }
  return people.filter((id) => !tied.has(id));
}

/**
 * A refusal for want of a blood tie, as `add_people_with_connections` and
 * `place_people` raise it: `BLOODLINE_GATE: <name> has no blood tie to this
 * tree`, with the detail saying who — `new:<index>` into the people sent, or
 * the id of the person brought over.
 */
export type BloodTieRefusal = {
  /** Who has no tie, as the database names them. */
  name: string | null;
  /** Their place among the people sent, when they were being added. */
  index: number | null;
  /** Their id, when they were being brought over. */
  personId: string | null;
};

/** Reads a database error as a blood-tie refusal, or null if it isn't one. */
export function readBloodTieRefusal(
  error: { message?: string | null; details?: string | null } | null | undefined,
): BloodTieRefusal | null {
  const message = error?.message ?? "";
  if (!message.includes("BLOODLINE_GATE")) return null;
  const name =
    /BLOODLINE_GATE: (.+) has no blood tie/.exec(message)?.[1]?.trim() || null;
  const details = error?.details?.trim() ?? "";
  const index = /^new:(\d+)$/.exec(details);
  return {
    name,
    index: index ? Number(index[1]) : null,
    personId: !index && details ? details : null,
  };
}

/**
 * What adding someone says when they have no blood tie: "Add a relative", the
 * first run's quick add, and onboarding, where `selfIndex` is the entry being
 * made for the member themselves.
 */
export function bloodTieRefusal(
  refusal: BloodTieRefusal,
  selfIndex: number | null = null,
): string {
  if (selfIndex !== null && refusal.index === selfIndex) {
    return "Connect yourself to someone born into this family, as their child, parent, sibling or partner.";
  }
  return `${refusal.name ?? "This person"} isn't connected to anyone born into this family. Connect them to a blood relative too.`;
}

/** What bringing people over from another tree says. */
export function bloodTiePlacementRefusal(refusal: BloodTieRefusal): string {
  return `${refusal.name ?? "Someone you picked"} isn't connected to anyone born into this family. Bring them with a blood relative they're connected to.`;
}
