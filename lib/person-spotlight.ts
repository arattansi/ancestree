import {
  ancestorsOf,
  descendantsOf,
  type LayoutRelationship,
} from "@/lib/tree-layout";

/**
 * One person's own tree: the vertical line they sit on, plus the partners who
 * married into it.
 *
 * Clicking a card spotlights this set and blurs the rest of the canvas, so a
 * single lineage can be read out of a tree that has grown too dense to follow
 * by eye. Partners are pulled in one step only — a spouse's *own* parents and
 * children belong to their line, not to this one — but without them a couple
 * would be split down the middle and the descent forks their children hang off
 * would have nothing to leave from.
 */
export type PersonSpotlight = {
  /** Everyone lit: the person, their line, and the partners along it. */
  people: Set<string>;
  /** How many people the line reaches above and below the person. */
  ancestors: number;
  descendants: number;
};

export function personSpotlight(
  personId: string,
  relationships: LayoutRelationship[],
): PersonSpotlight {
  const ancestors = ancestorsOf(personId, relationships);
  const descendants = descendantsOf(personId, relationships);
  const line = new Set<string>([personId, ...ancestors, ...descendants]);

  // Collected first, added after: a partner is lit because someone on the line
  // married them, never because they married another partner.
  const partners = new Set<string>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (line.has(r.from_person)) partners.add(r.to_person);
    if (line.has(r.to_person)) partners.add(r.from_person);
  }

  return {
    people: new Set<string>([...line, ...partners]),
    ancestors: ancestors.size,
    descendants: descendants.size,
  };
}
