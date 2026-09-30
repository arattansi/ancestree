import type { TreeGraphPerson } from "@/lib/tree";

/**
 * Someone on the tree as an album photo's names and date are matched to
 * them (Step 88.6, `photo-tags.ts`). Apart from the matching, so the canvas,
 * which makes one for everyone, doesn't load that until a photo is added.
 */

/** What matching needs to know of someone on the tree. */
export type TagPerson = {
  first: string | null;
  middle: string | null;
  preferred: string | null;
  last: string | null;
  maiden: string | null;
  born: string | null;
  bornPrecision: string;
  bornCirca: boolean;
  died: string | null;
  diedPrecision: string;
  diedCirca: boolean;
  deceased: boolean;
};

/** Someone who may be tagged: `person` is missing for a card whose name
 *  and dates this tree doesn't show (a basic card, or one blurred), which
 *  nothing is matched to. */
export type TagOption = { id: string; label: string; person?: TagPerson };

export function tagPersonOf(p: TreeGraphPerson): TagPerson | undefined {
  if (p.basic || p.blurred) return undefined;
  return {
    first: p.first_name,
    middle: p.middle_name,
    preferred: p.preferred_name,
    last: p.last_name,
    maiden: p.maiden_name,
    born: p.date_of_birth,
    bornPrecision: p.date_of_birth_precision,
    bornCirca: p.date_of_birth_circa,
    died: p.date_of_death,
    diedPrecision: p.date_of_death_precision,
    diedCirca: p.date_of_death_circa,
    deceased: p.is_deceased,
  };
}
