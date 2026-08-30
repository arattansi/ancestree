/**
 * Sibling inference from shared parents. Two people are siblings when they
 * share at least one parent. Used by the tree renderer (Step 6) to draw sibling
 * groupings; the DB exposes the same relation as the `sibling_edges` view.
 */

export type ParentishRelationship = {
  from_person: string;
  to_person: string;
  type: string;
};

/** `personId -> set of sibling personIds`, from `parent` edges only. */
export function inferSiblings(
  relationships: ParentishRelationship[],
): Map<string, Set<string>> {
  const childrenByParent = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== "parent") continue;
    const kids = childrenByParent.get(r.from_person);
    if (kids) kids.push(r.to_person);
    else childrenByParent.set(r.from_person, [r.to_person]);
  }

  const siblings = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let set = siblings.get(a);
    if (!set) {
      set = new Set<string>();
      siblings.set(a, set);
    }
    set.add(b);
  };

  for (const kids of childrenByParent.values()) {
    for (const a of kids) {
      for (const b of kids) {
        if (a !== b) link(a, b);
      }
    }
  }
  return siblings;
}

/** Flat, de-duplicated, order-independent list of sibling pairs. */
export function siblingPairs(
  relationships: ParentishRelationship[],
): Array<[string, string]> {
  const seen = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const [a, set] of inferSiblings(relationships)) {
    for (const b of set) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(a < b ? [a, b] : [b, a]);
    }
  }
  return pairs;
}
