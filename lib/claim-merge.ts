import { personDisplayName, type NamedPerson } from "@/lib/person-name";

/** How a relative stands to the member, read off a stored line. */
export type MergeRelation = "parent" | "partner" | "sibling" | "child";

export type MergeRelative = {
  id: string;
  name: string;
  relation: MergeRelation;
};

type Line = { from_person: string; to_person: string; type: string };

const ORDER: MergeRelation[] = ["parent", "partner", "sibling", "child"];

/**
 * The relatives on the member's own entry that "This is me" moves onto the
 * entry they claim: `claim_person` merges that entry, a placeholder they
 * added for themselves, into the claimed one and deletes it (Step 36).
 * Parents first, then partners, siblings and children, each by name. A line
 * to the claimed entry itself is dropped by the merge rather than moved, and
 * someone not on this canvas can't be named, so neither is listed.
 */
export function relativesThatMove(
  selfId: string,
  claimedId: string,
  people: (NamedPerson & { id: string })[],
  lines: Line[],
): MergeRelative[] {
  const nameById = new Map(people.map((p) => [p.id, personDisplayName(p)]));
  const seen = new Set<string>();
  const out: MergeRelative[] = [];
  for (const line of lines) {
    if (line.from_person !== selfId && line.to_person !== selfId) continue;
    const otherId =
      line.from_person === selfId ? line.to_person : line.from_person;
    if (otherId === claimedId || otherId === selfId) continue;
    const name = nameById.get(otherId);
    if (!name) continue;
    // Parent lines run from the parent to the child.
    const relation: MergeRelation | null =
      line.type === "parent"
        ? line.to_person === selfId
          ? "parent"
          : "child"
        : line.type === "spouse"
          ? "partner"
          : line.type === "sibling"
            ? "sibling"
            : null;
    if (!relation || seen.has(`${relation}:${otherId}`)) continue;
    seen.add(`${relation}:${otherId}`);
    out.push({ id: otherId, name, relation });
  }
  return out.sort(
    (a, b) =>
      ORDER.indexOf(a.relation) - ORDER.indexOf(b.relation) ||
      a.name.localeCompare(b.name),
  );
}

const NOUNS: Record<MergeRelation, [one: string, many: string]> = {
  parent: ["parent", "parents"],
  partner: ["partner", "partners"],
  sibling: ["sibling", "siblings"],
  child: ["child", "children"],
};

/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
function listNames(names: string[], max = 3): string {
  if (names.length > max) {
    return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
  }
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What "This is me" asks before it merges, naming who moves: "Your parents
 * Amina and Karim, and your partner Sam will be connected to this entry
 * instead, and the entry you added for yourself will be removed." A comma
 * before the "and" between groups keeps each group's own "and" readable.
 */
export function mergeConfirmation(relatives: MergeRelative[]): string {
  const groups = ORDER.flatMap((relation) => {
    const names = relatives
      .filter((r) => r.relation === relation)
      .map((r) => r.name);
    if (names.length === 0) return [];
    const [one, many] = NOUNS[relation];
    return [`your ${names.length === 1 ? one : many} ${listNames(names)}`];
  });
  const undo = "This can't be undone.";
  if (groups.length === 0) {
    return `The entry you added for yourself will be removed, and this one becomes yours. ${undo}`;
  }
  const who =
    groups.length === 1
      ? groups[0]
      : `${groups.slice(0, -1).join(", ")}, and ${groups[groups.length - 1]}`;
  return `${who[0].toUpperCase()}${who.slice(1)} will be connected to this entry instead, and the entry you added for yourself will be removed. ${undo}`;
}
