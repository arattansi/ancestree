import {
  connectionPath,
  relationOf,
  type ConnectionRelationship,
  type PathStep,
} from "@/lib/connection-path";
import { countOf } from "@/lib/plural";

/**
 * Who someone in the messenger is to the reader (Step 177.1, the messaging
 * scope's §3.4): "Your first cousin", "Your mother-in-law", "Connected
 * through 3 people", in the words story credits (Step 99) use, and the
 * chain between them, each person named by what they are to the one
 * before: "your mother Leila → her sister Nadia → her son Bilal". Worked
 * out on the server over the people and lines the reader can see across
 * their trees, so it never runs through an entry they can't.
 */

/** One person on the chain, from the reader to the other member. */
export type ChainLink = {
  personId: string;
  /** What they are to the one before, and their name: "your mother Leila";
   *  "You" for the reader. */
  says: string;
};

export type MemberRelation = {
  /** "Your first cousin", "Connected through 3 people". */
  label: string;
  /** How far apart: the chain's steps, a stored sibling row as two. New
   *  Message lists the closest first. */
  distance: number;
  /** The reader first, the other member last. */
  chain: ChainLink[];
};

/** Someone on the reader's trees, as the chain needs them. */
export type RelationPerson = { name: string; sex: string | null };

/** `[neutral, male, female]` */
type Term = readonly [string, string, string];
const WORDS: Record<PathStep["kind"], Term> = {
  up: ["parent", "father", "mother"],
  down: ["child", "son", "daughter"],
  spouse: ["spouse", "husband", "wife"],
  sibling: ["sibling", "brother", "sister"],
};

const word = (term: Term, sex: string | null | undefined) =>
  sex === "male" ? term[1] : sex === "female" ? term[2] : term[0];

const possessive = (sex: string | null | undefined) =>
  sex === "male" ? "his" : sex === "female" ? "her" : "their";

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * What `otherId` is to `selfId` (both entries), or `null` when nothing the
 * reader can see joins them, or either isn't among `people`.
 */
export function memberRelation(
  selfId: string,
  otherId: string,
  people: ReadonlyMap<string, RelationPerson>,
  relationships: ConnectionRelationship[],
): MemberRelation | null {
  if (selfId === otherId || !people.has(selfId) || !people.has(otherId)) return null;
  const path = connectionPath(selfId, otherId, relationships);
  if (!path) return null;
  const relation = relationOf(otherId, selfId, people, relationships);
  const label = !relation
    ? `Connected through ${countOf(path.people.length - 2, "person", "people")}`
    : "term" in relation
      ? `Your ${lowerFirst(relation.term)}`
      : `Connected through ${countOf(relation.through, "person", "people")}`;

  const chain: ChainLink[] = [{ personId: selfId, says: "You" }];
  path.steps.forEach((step, i) => {
    const before = people.get(path.people[i]);
    const them = people.get(step.to);
    const ended =
      step.kind === "spouse" &&
      relationships.some(
        (r) =>
          r.type === "spouse" &&
          r.is_divorced &&
          ((r.from_person === step.from && r.to_person === step.to) ||
            (r.from_person === step.to && r.to_person === step.from)),
      );
    const whose = i === 0 ? "your" : possessive(before?.sex);
    const what = `${ended ? "former " : ""}${word(WORDS[step.kind], them?.sex)}`;
    chain.push({ personId: step.to, says: `${whose} ${what} ${them?.name ?? "someone"}`.trim() });
  });

  return {
    label,
    distance: path.steps.reduce((n, s) => n + (s.kind === "sibling" ? 2 : 1), 0),
    chain,
  };
}

/**
 * The people New Message lists, closest first (Mum at the top), then
 * everyone the reader isn't joined to, each run by name.
 */
export function closestFirst<T extends { name: string }>(
  contacts: readonly T[],
  distanceOf: (contact: T) => number | null,
): T[] {
  const far = Number.POSITIVE_INFINITY;
  return [...contacts].sort(
    (a, b) =>
      (distanceOf(a) ?? far) - (distanceOf(b) ?? far) ||
      a.name.localeCompare(b.name),
  );
}
