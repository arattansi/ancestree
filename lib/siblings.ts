/**
 * Sibling inference from shared parents. Two people are siblings when they
 * share at least one parent. Used by the tree renderer (Step 6) to draw sibling
 * groupings; the DB exposes the same relation as the `sibling_edges` view.
 */

import { stepsOf, toChildren } from "@/lib/graph-walk";

export type ParentishRelationship = {
  from_person: string;
  to_person: string;
  type: string;
};

/** `personId -> set of sibling personIds`, from `parent` edges only. */
export function inferSiblings(
  relationships: ParentishRelationship[],
): Map<string, Set<string>> {
  const childrenByParent = stepsOf(relationships, toChildren);

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
