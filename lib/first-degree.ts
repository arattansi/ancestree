import { partnersOf } from "@/lib/graph-walk";
import { personSpotlight } from "@/lib/person-spotlight";
import type { LayoutRelationship } from "@/lib/tree-layout";

/**
 * Everyone one line away from a person (Step 147): the circles the iPhone
 * app draws around a leaf, parents above it, children below, spouses to its
 * left and siblings to its right. Tapping one walks the tree to them.
 *
 * Siblings are the ones a spotlight lights (`personSpotlight`): by a shared
 * parent, by a stored `sibling` row, or seated together with no parent on
 * the tree (Step 125). Spouses include former ones, as `partnersOf` does.
 *
 * Each relative appears once, in the first of parents, children, spouses
 * and siblings they fit: a data slip can make someone two of them, and two
 * circles for one person would read as two people.
 */
export type FirstDegree = {
  parents: string[];
  children: string[];
  spouses: string[];
  siblings: string[];
};

export function firstDegree(
  personId: string,
  relationships: LayoutRelationship[],
): FirstDegree {
  const placed = new Set<string>([personId]);
  const take = (ids: Iterable<string>) => {
    const out: string[] = [];
    for (const id of ids) {
      if (placed.has(id)) continue;
      placed.add(id);
      out.push(id);
    }
    return out;
  };

  const parents = take(
    relationships
      .filter((r) => r.type === "parent" && r.to_person === personId)
      .map((r) => r.from_person),
  );
  const children = take(
    relationships
      .filter((r) => r.type === "parent" && r.from_person === personId)
      .map((r) => r.to_person),
  );
  const spouses = take(partnersOf(new Set([personId]), relationships));
  const siblings = take(personSpotlight(personId, relationships).siblings);
  return { parents, children, spouses, siblings };
}
