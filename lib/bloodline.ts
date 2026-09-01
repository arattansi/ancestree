/**
 * The bloodline derivation, mirrored from `private.bloodline_ids` (Step 14).
 *
 * From the tree's anchors, climb every `parent` edge upward to all ancestors,
 * then descend `parent` edges from that whole set. Direction is the whole
 * point: walking parent edges *undirected* leaks — from a blood member down to
 * their child, then back up to the child's other parent, and every partner who
 * married in lands inside the bloodline. Up-then-down keeps cousins,
 * great-aunts and half-siblings in while keeping married-in partners out.
 *
 * The database is the enforcement point; this is the tested statement of the
 * rule and is used to explain the gate in the UI without a round trip.
 */

export type ParentEdge = {
  /** The parent. */
  from_person: string;
  /** The child. */
  to_person: string;
  type: string;
};

/** Every person in the bloodline anchored on `anchors`. */
export function bloodlineIds(
  anchors: readonly string[],
  edges: readonly ParentEdge[],
): Set<string> {
  const parents = new Map<string, string[]>(); // child -> parents
  const children = new Map<string, string[]>(); // parent -> children
  for (const e of edges) {
    if (e.type !== "parent") continue;
    (parents.get(e.to_person) ?? parents.set(e.to_person, []).get(e.to_person)!)
      .push(e.from_person);
    (children.get(e.from_person) ??
      children.set(e.from_person, []).get(e.from_person)!)
      .push(e.to_person);
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

  return walk(walk(anchors, parents), children);
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
 * Everyone descending from `root`, `root` included.
 */
export function descendantIds(
  root: string,
  edges: readonly ParentEdge[],
): Set<string> {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const e of edges) {
      if (e.type !== "parent" || e.from_person !== id) continue;
      if (seen.has(e.to_person)) continue;
      seen.add(e.to_person);
      queue.push(e.to_person);
    }
  }
  return seen;
}

/**
 * What a member may add, mirroring the gate in `add_people_with_connections`
 * (Step 14.2): the bloodline, plus everyone descending from them.
 *
 * For a blood member that is the whole tree they can reach anyway. For someone
 * who married in it is their partner's family and their own children — never
 * their parents, siblings or in-laws, which are ancestors and collaterals
 * rather than descendants, and mean they are starting a tree of their own.
 */
export function growthAllowedIds(
  selfId: string,
  anchors: readonly string[],
  edges: readonly ParentEdge[],
): Set<string> {
  const blood = bloodlineIds(anchors, edges);
  if (blood.has(selfId)) return blood;
  for (const id of descendantIds(selfId, edges)) blood.add(id);
  return blood;
}
