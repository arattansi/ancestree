import type { ConnectionEdge, PersonRef } from "@/lib/connections";

/**
 * Placeholder children (Step 98.2). A Root or a Branch can't add someone
 * else's child under 18 (Step 98.1), but can hold their place: an entry with
 * no details at all, shown as "First Child", "Second Child"… under their
 * parent, numbered when it's made and never renumbered
 * (`people.placeholder_number`). Only that parent fills it in, and that
 * makes it an ordinary entry, theirs (`add_placeholder_child`,
 * `people_before_write`).
 */

const ORDINALS = [
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
  "Eleventh",
  "Twelfth",
];

/**
 * "First Child" … "Twelfth Child", then "13th Child", as
 * `private.placeholder_label` writes it.
 */
export function placeholderLabel(n: number): string {
  if (n >= 1 && n <= ORDINALS.length) return `${ORDINALS[n - 1]} Child`;
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix} Child`;
}

/** Whether an entry is a placeholder child. */
export function isPlaceholder(p: {
  placeholder_number?: number | null;
}): boolean {
  return p.placeholder_number != null;
}

/**
 * The parents a placeholder could be added for, from the lines a save would
 * draw: the people already on the tree drawn as parents of the new person at
 * `index`, or, when they're only drawn as someone's sibling, that sibling's
 * parents. Empty when their parent is new too (someone in between), so
 * there's nobody yet to hold a place under.
 */
export function placeholderParents({
  index,
  edges,
  parentsOf,
}: {
  index: number;
  edges: readonly ConnectionEdge[];
  /** The parents of someone already on the tree. */
  parentsOf: (id: string) => readonly string[];
}): string[] {
  const isThem = (r: PersonRef) =>
    r.kind === "new" && r.index === index;
  const drawn = edges.filter((e) => e.type === "parent" && isThem(e.b));
  if (drawn.length > 0) {
    // Someone new among their parents: there's no entry yet to hang it on.
    if (drawn.some((e) => e.a.kind !== "existing")) return [];
    return [
      ...new Set(
        drawn.flatMap((e) => (e.a.kind === "existing" ? [e.a.id] : [])),
      ),
    ].slice(0, 2);
  }
  for (const e of edges) {
    if (e.type !== "sibling") continue;
    const other = isThem(e.a) ? e.b : isThem(e.b) ? e.a : null;
    if (other?.kind === "existing") {
      const parents = parentsOf(other.id);
      if (parents.length > 0) return parents.slice(0, 2);
    }
  }
  return [];
}
