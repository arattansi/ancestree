import {
  ancestorsOf,
  descendantsOf,
  type LayoutRelationship,
} from "@/lib/tree-layout";
import { inferSiblings } from "@/lib/siblings";

/**
 * One person's own tree: the vertical line they sit on, plus the partners who
 * married into it — and, beside them, their brothers and sisters (Step 19.3).
 *
 * Clicking a card spotlights this set and blurs the rest of the canvas, so a
 * single lineage can be read out of a tree that has grown too dense to follow
 * by eye. Partners are pulled in one step only — a spouse's *own* parents and
 * children belong to their line, not to this one — but without them a couple
 * would be split down the middle and the descent forks their children hang off
 * would have nothing to leave from.
 *
 * Siblings are the focused person's only: not an ancestor's, not a partner's,
 * and none of their children. "Where are my siblings?" was the first thing a
 * tester asked on clicking themselves. Their partners come along for the same
 * reason the line's do, one step and no further.
 *
 * Each person has one role. Someone who fits two — a sibling recorded on the
 * line by a data slip, a sibling's partner who is also a sibling — takes the
 * first of line, sibling, sibling's spouse.
 */
export type PersonSpotlight = {
  /** The person, their ancestors and descendants, and the partners along it. */
  line: Set<string>;
  /** The focused person's siblings: by a shared parent (half-siblings too), or
   *  by a stored `sibling` row. */
  siblings: Set<string>;
  /** Siblings known only from a stored `sibling` row, sharing no parent on
   *  the tree — no bus joins them, so the canvas draws a bracket instead. */
  looseSiblings: Set<string>;
  /** The siblings' partners. */
  siblingSpouses: Set<string>;
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
  const blood = new Set<string>([personId, ...ancestors, ...descendants]);

  // Collected first, added after: a partner is lit because someone on the line
  // married them, never because they married another partner.
  const line = new Set(blood);
  for (const partner of partnersOf(blood, relationships)) line.add(partner);

  const shared = inferSiblings(relationships).get(personId) ?? new Set();
  const stored = new Set<string>();
  for (const r of relationships) {
    if (r.type !== "sibling") continue;
    if (r.from_person === personId) stored.add(r.to_person);
    if (r.to_person === personId) stored.add(r.from_person);
  }

  const siblings = new Set<string>();
  const looseSiblings = new Set<string>();
  for (const id of [...shared, ...stored]) {
    if (id === personId || line.has(id)) continue;
    siblings.add(id);
    if (!shared.has(id)) looseSiblings.add(id);
  }

  const siblingSpouses = new Set<string>();
  for (const partner of partnersOf(siblings, relationships)) {
    if (!line.has(partner) && !siblings.has(partner))
      siblingSpouses.add(partner);
  }

  return {
    line,
    siblings,
    looseSiblings,
    siblingSpouses,
    ancestors: ancestors.size,
    descendants: descendants.size,
  };
}

/** Everyone a spotlight lights, whatever their role. */
export function spotlightPeople(spotlight: PersonSpotlight): Set<string> {
  return new Set([
    ...spotlight.line,
    ...spotlight.siblings,
    ...spotlight.siblingSpouses,
  ]);
}

/** The partners of anyone in `people`, one step out. */
function partnersOf(
  people: Set<string>,
  relationships: LayoutRelationship[],
): Set<string> {
  const partners = new Set<string>();
  for (const r of relationships) {
    if (r.type !== "spouse") continue;
    if (people.has(r.from_person)) partners.add(r.to_person);
    if (people.has(r.to_person)) partners.add(r.from_person);
  }
  return partners;
}
