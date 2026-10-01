import { countOf } from "@/lib/plural";
import type { LayoutRelationship } from "@/lib/tree-layout";

/**
 * How two people on the tree are connected: the shortest chain of recorded
 * relationships from one to the other, and a name for what that chain makes
 * them to each other.
 *
 * The canvas spotlights the chain the way it spotlights one person's tree, so
 * "how is Zahra related to Karim?" is answered by the family itself rather
 * than by a sentence.
 */

/** One link of the chain, read in the direction it is walked. */
export type PathStep = {
  from: string;
  to: string;
  /** `up` climbs to a parent, `down` drops to a child; `sibling` is a stored
   *  "sibling of" row, walked only where no shared parent is on the tree. */
  kind: "up" | "down" | "spouse" | "sibling";
};

export type ConnectionPath = {
  /** Everyone on the chain, from the first person to the second. */
  people: string[];
  steps: PathStep[];
  /**
   * The other half of a couple the chain turns round on: two cousins meet at
   * a grandparent, and the grandparent's partner is just as much the reason
   * they are cousins. Lit with the chain, never part of it.
   */
  coParents: string[];
};

// Blood before marriage on a tie, and a stored sibling row only where the
// parents it stands in for are missing: through a shared parent is two steps,
// and the row costs a shade more than that.
const COST = { up: 10, down: 10, spouse: 11, sibling: 21 } as const;

export function connectionPath(
  fromId: string,
  toId: string,
  relationships: LayoutRelationship[],
): ConnectionPath | null {
  if (fromId === toId) return null;

  const links = new Map<string, PathStep[]>();
  const link = (step: PathStep) => {
    const list = links.get(step.from);
    if (list) list.push(step);
    else links.set(step.from, [step]);
  };
  for (const r of relationships) {
    const [a, b] = [r.from_person, r.to_person];
    if (a === b) continue;
    if (r.type === "parent") {
      // Stored from = parent, to = child.
      link({ from: a, to: b, kind: "down" });
      link({ from: b, to: a, kind: "up" });
    } else if (r.type === "spouse" || r.type === "sibling") {
      link({ from: a, to: b, kind: r.type });
      link({ from: b, to: a, kind: r.type });
    }
  }
  if (!links.has(fromId) || !links.has(toId)) return null;

  // Dijkstra over a family-sized graph: a plain scan for the nearest open
  // person is quicker to read than a heap and never the slow part.
  const cost = new Map<string, number>([[fromId, 0]]);
  const arrivedBy = new Map<string, PathStep>();
  const done = new Set<string>();
  for (;;) {
    let current: string | null = null;
    let best = Infinity;
    for (const [id, c] of cost) {
      if (!done.has(id) && c < best) {
        best = c;
        current = id;
      }
    }
    if (current === null) return null;
    if (current === toId) break;
    done.add(current);
    for (const step of links.get(current) ?? []) {
      if (done.has(step.to)) continue;
      const next = best + COST[step.kind];
      if (next < (cost.get(step.to) ?? Infinity)) {
        cost.set(step.to, next);
        arrivedBy.set(step.to, step);
      }
    }
  }

  const steps: PathStep[] = [];
  for (let id = toId; id !== fromId; ) {
    const step = arrivedBy.get(id);
    if (!step) return null;
    steps.unshift(step);
    id = step.from;
  }

  const parentsOf = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (r.type !== "parent") continue;
    const set = parentsOf.get(r.to_person);
    if (set) set.add(r.from_person);
    else parentsOf.set(r.to_person, new Set([r.from_person]));
  }
  const people = [fromId, ...steps.map((s) => s.to)];
  const onPath = new Set(people);
  const coParents = new Set<string>();
  for (let i = 0; i + 1 < steps.length; i++) {
    if (steps[i].kind !== "up" || steps[i + 1].kind !== "down") continue;
    const theirs = parentsOf.get(steps[i + 1].to);
    for (const parent of parentsOf.get(steps[i].from) ?? [])
      if (theirs?.has(parent) && !onPath.has(parent)) coParents.add(parent);
  }

  return { people, steps, coParents: [...coParents] };
}

const ORDINALS = [
  "",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
];
const REMOVES = ["", "once", "twice", "three times", "four times"];

/** "Great-great-" for a line `count` generations longer than a grandparent's. */
const greats = (count: number) => "great-".repeat(Math.max(0, count));

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A person's recorded sex, where it picks the word: "aunt" over "aunt or
 *  uncle". Anything but `male` / `female` keeps the neutral term. */
export type SexOf = (personId: string) => string | null | undefined;

/** `[neutral, male, female]` */
type Term = readonly [string, string, string];
const PARENT: Term = ["parent", "father", "mother"];
const CHILD: Term = ["child", "son", "daughter"];
const AUNT_UNCLE: Term = ["aunt or uncle", "uncle", "aunt"];
const NIECE_NEPHEW: Term = ["niece or nephew", "nephew", "niece"];

const word = (term: Term, sex: string | null | undefined) =>
  sex === "male" ? term[1] : sex === "female" ? term[2] : term[0];

/**
 * What `up` generations up then `down` generations down makes two people,
 * walked from `first` to `last`.
 */
function bloodKinship(
  up: number,
  down: number,
  halfSiblings: boolean,
  [first, last]: [string | null | undefined, string | null | undefined],
): string {
  if (up === 0 || down === 0) {
    const span = up + down;
    const prefix = span === 1 ? "" : `${greats(span - 2)}grand`;
    // Elder first whichever of them was asked about first: the pair is named,
    // not one of them in terms of the other. Walking down starts at the elder.
    const [elder, younger] = up === 0 ? [first, last] : [last, first];
    return capitalise(
      `${prefix}${word(PARENT, elder)} & ${prefix}${word(CHILD, younger)}`,
    );
  }
  if (up === 1 && down === 1) {
    const half = halfSiblings ? "half-" : "";
    const both = first === last ? first : null;
    if (both === "male") return capitalise(`${half}brothers`);
    if (both === "female") return capitalise(`${half}sisters`);
    return capitalise(`${half}siblings`);
  }
  if (up === 1 || down === 1) {
    const span = Math.max(up, down);
    const prefix = span > 2 ? `${greats(span - 3)}grand-` : "";
    // One step up and several down starts at the aunt or uncle.
    const [elder, younger] = up === 1 ? [first, last] : [last, first];
    return capitalise(
      `${prefix}${word(AUNT_UNCLE, elder)} & ${prefix}${word(NIECE_NEPHEW, younger)}`,
    );
  }
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const ordinal = ORDINALS[degree] ?? `${degree}th`;
  const times = REMOVES[removed] ?? `${removed} times`;
  return `${ordinal} cousins${removed > 0 ? ` ${times} removed` : ""}`;
}

/**
 * A name for the connection: "First cousins once removed", "Siblings by
 * marriage". A chain that winds through more than the ends' own marriages has
 * no everyday name, so it says how long it is instead.
 */
export function connectionLabel(
  path: ConnectionPath,
  relationships: LayoutRelationship[],
  sexOf: SexOf = () => null,
): string {
  // A stored sibling row stands in for the parent it skips: up one, down one.
  const moves = path.steps.flatMap((s) =>
    s.kind === "sibling" ? (["up", "down"] as const) : [s.kind],
  );
  const core = [...moves];
  let married = false;
  if (core[0] === "spouse") {
    core.shift();
    married = true;
  }
  if (core[core.length - 1] === "spouse") {
    core.pop();
    married = true;
  }
  if (core.length === 0) return "Spouses";

  const up = core.findIndex((m) => m !== "up");
  const ups = up === -1 ? core.length : up;
  const downs = core.length - ups;
  const straight = core.slice(ups).every((m) => m === "down");
  if (!straight) {
    if (!married && core.length === 2 && core[0] === "down" && core[1] === "up")
      return "Parents of the same child";
    const between = path.people.length - 2;
    return `Connected through ${countOf(between, "person", "people")}`;
  }

  // Half-siblings only when the tree can tell: both have two parents on it,
  // and they share just the one.
  let halfSiblings = false;
  if (ups === 1 && downs === 1 && path.steps.length === moves.length) {
    const offset = moves[0] === "spouse" ? 1 : 0;
    const [a, b] = [path.people[offset], path.people[offset + 2]];
    const parents = (id: string) =>
      new Set(
        relationships
          .filter((r) => r.type === "parent" && r.to_person === id)
          .map((r) => r.from_person),
      );
    const [pa, pb] = [parents(a), parents(b)];
    const shared = [...pa].filter((id) => pb.has(id)).length;
    halfSiblings = pa.size >= 2 && pb.size >= 2 && shared === 1;
  }

  // The words follow the two people asked about, even where a marriage at
  // either end is what makes them family: an uncle's wife is still an aunt.
  const kinship = bloodKinship(ups, downs, halfSiblings, [
    sexOf(path.people[0]),
    sexOf(path.people[path.people.length - 1]),
  ]);
  return married ? `${kinship} by marriage` : kinship;
}

/** A recorded relationship, with whether a marriage has ended. */
export type ConnectionRelationship = LayoutRelationship & {
  is_divorced?: boolean | null;
};

const SIBLING: Term = ["sibling", "brother", "sister"];
const SPOUSE: Term = ["spouse", "husband", "wife"];
const CHILD_IN_LAW: Term = ["child-in-law", "son-in-law", "daughter-in-law"];
const PARENT_IN_LAW: Term = ["parent-in-law", "father-in-law", "mother-in-law"];
const SIBLING_IN_LAW: Term = ["sibling-in-law", "brother-in-law", "sister-in-law"];
const STEPPARENT: Term = ["step-parent", "stepfather", "stepmother"];
const STEPCHILD: Term = ["stepchild", "stepson", "stepdaughter"];

/**
 * What someone `up` generations up then `down` down from them is to them,
 * in one word for the person it starts at, as their `sex` says: walking up
 * three from a great-grandson reaches his great-grandparent, so "great-
 * grandson".
 */
function bloodTerm(
  up: number,
  down: number,
  halfSiblings: boolean,
  sex: string | null | undefined,
): string {
  if (up === 0 || down === 0) {
    // Down from them: they're the elder. Up: the younger.
    const span = up + down;
    const prefix = span === 1 ? "" : `${greats(span - 2)}grand`;
    return `${prefix}${word(up === 0 ? PARENT : CHILD, sex)}`;
  }
  if (up === 1 && down === 1) return `${halfSiblings ? "half-" : ""}${word(SIBLING, sex)}`;
  if (up === 1 || down === 1) {
    const span = Math.max(up, down);
    const prefix = span > 2 ? `${greats(span - 3)}grand-` : "";
    // One up and several down: their parent is the other's grandparent or
    // further, so they're the aunt or uncle.
    return `${prefix}${word(up === 1 ? AUNT_UNCLE : NIECE_NEPHEW, sex)}`;
  }
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  const ordinal = (ORDINALS[degree] ?? `${degree}th`).toLowerCase();
  const times = REMOVES[removed] ?? `${removed} times`;
  return `${ordinal} cousin${removed > 0 ? ` ${times} removed` : ""}`;
}

/** Whether the chain's one step up and one down are a half-sibling's:
 *  both have two parents on the tree, and they share just the one. */
function halfSiblingsOn(
  path: ConnectionPath,
  moves: readonly string[],
  relationships: LayoutRelationship[],
): boolean {
  if (path.steps.length !== moves.length) return false;
  const offset = moves[0] === "spouse" ? 1 : 0;
  const [a, b] = [path.people[offset], path.people[offset + 2]];
  if (!a || !b) return false;
  const parents = (id: string) =>
    new Set(
      relationships
        .filter((r) => r.type === "parent" && r.to_person === id)
        .map((r) => r.from_person),
    );
  const [pa, pb] = [parents(a), parents(b)];
  const shared = [...pa].filter((id) => pb.has(id)).length;
  return pa.size >= 2 && pb.size >= 2 && shared === 1;
}

/**
 * What one person is to another (Step 99: a story credit's card), for the
 * first of them: "Great-grandson", "Mother-in-law", "First cousin once
 * removed". `{ through }` when a chain joins them but no everyday word
 * does; null when nothing on the tree joins them, or either isn't on it.
 */
export type Relation = { term: string } | { through: number };

export function relationOf(
  fromId: string,
  toId: string,
  people: ReadonlyMap<string, { sex?: string | null }>,
  relationships: ConnectionRelationship[],
): Relation | null {
  if (fromId === toId || !people.has(fromId) || !people.has(toId)) return null;
  const path = connectionPath(fromId, toId, relationships);
  if (!path) return null;
  const sex = people.get(fromId)?.sex;
  const named = (term: string): Relation => ({ term: capitalise(term) });
  const through: Relation = { through: path.people.length - 2 };

  // A stored sibling row stands in for the parent it skips: up one, down one.
  const moves = path.steps.flatMap((s) =>
    s.kind === "sibling" ? (["up", "down"] as const) : [s.kind],
  );
  if (moves.length === 1 && moves[0] === "spouse") {
    // Only the edge itself knows a marriage has ended.
    const ended = relationships.some(
      (r) =>
        r.type === "spouse" &&
        r.is_divorced &&
        ((r.from_person === fromId && r.to_person === toId) ||
          (r.from_person === toId && r.to_person === fromId)),
    );
    return named(`${ended ? "former " : ""}${word(SPOUSE, sex)}`);
  }

  const core = [...moves];
  const theirSpouse = core[0] === "spouse";
  if (theirSpouse) core.shift();
  const otherSpouse = core[core.length - 1] === "spouse";
  if (otherSpouse) core.pop();
  if (core.length === 0) return through;

  const ups = core.findIndex((m) => m !== "up");
  const up = ups === -1 ? core.length : ups;
  const down = core.length - up;
  if (!core.slice(up).every((m) => m === "down")) {
    // Down to a child and up to its other parent.
    if (!theirSpouse && !otherSpouse && core.length === 2) return named("co-parent");
    return through;
  }

  // The everyday words for a marriage at one end.
  if (theirSpouse !== otherSpouse) {
    const key = `${theirSpouse ? "s" : ""}${up}${down}${otherSpouse ? "s" : ""}`;
    const inLaw: Record<string, Term> = {
      s10: CHILD_IN_LAW, // their spouse is the other's child
      s01: STEPPARENT, // their spouse is the other's parent
      s11: SIBLING_IN_LAW, // their spouse is the other's sibling
      "01s": PARENT_IN_LAW, // their child is the other's spouse
      "10s": STEPCHILD, // their parent is the other's spouse
      "11s": SIBLING_IN_LAW, // their sibling is the other's spouse
    };
    if (inLaw[key]) return named(word(inLaw[key], sex));
  }

  const half = up === 1 && down === 1 && halfSiblingsOn(path, moves, relationships);
  const blood = bloodTerm(up, down, half, sex);
  return named(theirSpouse || otherSpouse ? `${blood} by marriage` : blood);
}

/** A relation as a story credit's card says it: "Great-grandson of Amarshi
 *  Sayani", "Connected to Amarshi Sayani through 3 people". */
export function relationText(relation: Relation, toName: string): string {
  return "term" in relation
    ? `${relation.term} of ${toName}`
    : `Connected to ${toName} through ${countOf(relation.through, "person", "people")}`;
}
