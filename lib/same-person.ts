/**
 * "Same person?" on My Family Tree (Step 92.4). Trees are built apart, so
 * the view can gather one person twice: two `people` rows, each on a tree
 * of the viewer's, where one entry placed on both would have been one card.
 * Both are shown (Aalim, Step 92); the likely pairs are flagged, to the
 * viewer only, and merging them is a later step.
 *
 * A pair is flagged when
 * 1. their names agree: a given name (first or preferred) and a family name
 *    (last or maiden) in common, and no two different maiden names;
 * 2. nothing tells them apart: no line between them, not two members' own
 *    entries, no two different sexes, no birth or death dates that can't be
 *    the same (a year more than one apart, five for a "c." date; a different
 *    birthday), no two different countries of birth;
 * 3. and they stand in the same spot in the family: both parents of one
 *    child; or children of one parent, partners of one person or siblings
 *    of one person; or born on the same known day. "One" person counts a
 *    pair already flagged, so a side of the family entered twice is flagged
 *    from the people it hangs on — and a pair that stands only on others
 *    goes when the viewer says those are two people (`shownSamePairs`).
 *
 * Two entries that one tree of the viewer's shows side by side are that
 * tree's to tell apart (a namesake sibling, a second wife of the same name),
 * so only "both parents of one child" flags them: nobody has two mothers
 * of the same name.
 *
 * Pure: `lib/my-family.server.ts` hands it the view's cards and lines.
 */

import { asDatePrecision } from "@/lib/partial-date";
import type { WalkEdge } from "@/lib/graph-walk";

/** What the rule reads of a card on the view. */
export type SamePersonEntry = {
  id: string;
  first_name: string | null;
  preferred_name: string | null;
  last_name: string;
  maiden_name: string | null;
  sex: string | null;
  date_of_birth: string | null;
  date_of_birth_precision: string;
  date_of_birth_circa: boolean;
  /** A birthday kept without its year (Step 63). */
  birth_month: number | null;
  birth_day: number | null;
  date_of_death: string | null;
  date_of_death_precision: string;
  date_of_death_circa: boolean;
  country_of_birth: string;
  /** The viewer's trees that show them. */
  tree_ids: readonly string[];
};

/** Two cards' ids, the lower first: how a pair is named and remembered. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** A name as it compares: case, accents, dots and dashes aside. */
export function foldName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function namesOf(...names: (string | null)[]): Set<string> {
  return new Set(names.map(foldName).filter((n) => n.length > 0));
}

function shareOne(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** Rule 1: the same given name and family name, maiden names not differing. */
export function namesAgree(a: SamePersonEntry, b: SamePersonEntry): boolean {
  const maidenA = foldName(a.maiden_name);
  const maidenB = foldName(b.maiden_name);
  if (maidenA && maidenB && maidenA !== maidenB) return false;
  return (
    shareOne(
      namesOf(a.first_name, a.preferred_name),
      namesOf(b.first_name, b.preferred_name),
    ) &&
    shareOne(
      namesOf(a.last_name, a.maiden_name),
      namesOf(b.last_name, b.maiden_name),
    )
  );
}

/** What's known of a date: its year, and its month and day when known. */
type Known = {
  year: number | null;
  month: number | null;
  day: number | null;
  circa: boolean;
};

function knownDate(
  date: string | null,
  precision: string,
  circa: boolean,
  withoutYear: { month: number | null; day: number | null } = {
    month: null,
    day: null,
  },
): Known {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!m) {
    // A birthday with no year is a day and a month all the same.
    const whole = withoutYear.month != null && withoutYear.day != null;
    return {
      year: null,
      month: whole ? withoutYear.month : null,
      day: whole ? withoutYear.day : null,
      circa: false,
    };
  }
  const p = asDatePrecision(precision);
  // A "c." date is a guess at the year: its month and day say nothing.
  return {
    year: Number(m[1]),
    month: p !== "year" && !circa ? Number(m[2]) : null,
    day: p === "day" && !circa ? Number(m[3]) : null,
    circa,
  };
}

/** Whether two dates could be one: years a slip apart, or a guess apart. */
function datesFit(a: Known, b: Known): boolean {
  if (a.year != null && b.year != null) {
    const slack = a.circa || b.circa ? 5 : 1;
    if (Math.abs(a.year - b.year) > slack) return false;
    if (a.year === b.year && a.month != null && b.month != null) {
      if (a.month !== b.month) return false;
    }
  }
  // A birthday known on both is the same day, whatever the years say.
  if (a.month != null && a.day != null && b.month != null && b.day != null) {
    if (a.month !== b.month || a.day !== b.day) return false;
  }
  return true;
}

function birthOf(p: SamePersonEntry): Known {
  return knownDate(
    p.date_of_birth,
    p.date_of_birth_precision,
    p.date_of_birth_circa,
    { month: p.birth_month, day: p.birth_day },
  );
}

function deathOf(p: SamePersonEntry): Known {
  return knownDate(
    p.date_of_death,
    p.date_of_death_precision,
    p.date_of_death_circa,
  );
}

/** Rule 2, but for the line between them: what their own details say. */
export function detailsFit(a: SamePersonEntry, b: SamePersonEntry): boolean {
  const known = (sex: string | null) =>
    sex === "male" || sex === "female" ? sex : null;
  const sexA = known(a.sex);
  const sexB = known(b.sex);
  if (sexA && sexB && sexA !== sexB) return false;
  const bornA = birthOf(a);
  const bornB = birthOf(b);
  if (!datesFit(bornA, bornB)) return false;
  const diedA = deathOf(a);
  const diedB = deathOf(b);
  if (!datesFit(diedA, diedB)) return false;
  // One can't have died before the other was born.
  const slack = (x: Known, y: Known) => (x.circa || y.circa ? 5 : 1);
  if (diedA.year != null && bornB.year != null) {
    if (bornB.year - diedA.year > slack(diedA, bornB)) return false;
  }
  if (diedB.year != null && bornA.year != null) {
    if (bornA.year - diedB.year > slack(diedB, bornA)) return false;
  }
  const countryA = foldName(a.country_of_birth);
  const countryB = foldName(b.country_of_birth);
  if (countryA && countryB && countryA !== countryB) return false;
  return true;
}

/** Born on the same day, known to the day on both. */
function sameBirthday(a: SamePersonEntry, b: SamePersonEntry): boolean {
  const x = birthOf(a);
  const y = birthOf(b);
  return (
    x.year != null &&
    x.day != null &&
    x.year === y.year &&
    x.month === y.month &&
    x.day === y.day
  );
}

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

const NONE: ReadonlySet<string> = new Set();

/** A likely pair, the lower id first, and what it stands on. */
export type SamePair = {
  ids: [string, string];
  /**
   * Empty when the pair stands on its own spot; otherwise the pairs
   * (`pairKey`) that put them in one, any of which will do: their
   * children's, their parents', their partners'.
   */
  via: string[];
};

/**
 * The likely pairs among the view's cards, in id order. `owned` are
 * members' own entries (their `self_person_id` or an approved claim): two of
 * them are two people.
 */
export function likelySamePeople(
  people: readonly SamePersonEntry[],
  lines: readonly WalkEdge[],
  owned: ReadonlySet<string>,
): SamePair[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parents = new Map<string, Set<string>>();
  const children = new Map<string, Set<string>>();
  const partners = new Map<string, Set<string>>();
  const siblings = new Map<string, Set<string>>();
  const linked = new Set<string>();
  for (const e of lines) {
    if (!byId.has(e.from_person) || !byId.has(e.to_person)) continue;
    linked.add(pairKey(e.from_person, e.to_person));
    if (e.type === "parent") {
      addTo(parents, e.to_person, e.from_person);
      addTo(children, e.from_person, e.to_person);
    } else if (e.type === "spouse" || e.type === "sibling") {
      const map = e.type === "spouse" ? partners : siblings;
      addTo(map, e.from_person, e.to_person);
      addTo(map, e.to_person, e.from_person);
    }
  }

  // Everyone whose names agree, and nothing tells apart. Bucketed by given
  // name first, so a view of hundreds compares only its namesakes.
  const byGivenName = new Map<string, string[]>();
  for (const p of people) {
    for (const name of namesOf(p.first_name, p.preferred_name)) {
      const list = byGivenName.get(name);
      if (list) list.push(p.id);
      else byGivenName.set(name, [p.id]);
    }
  }
  const candidates = new Map<string, [SamePersonEntry, SamePersonEntry]>();
  for (const ids of byGivenName.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        if (candidates.has(key) || linked.has(key)) continue;
        const a = byId.get(ids[i])!;
        const b = byId.get(ids[j])!;
        if (owned.has(a.id) && owned.has(b.id)) continue;
        if (!namesAgree(a, b) || !detailsFit(a, b)) continue;
        candidates.set(key, a.id < b.id ? [a, b] : [b, a]);
      }
    }
  }

  // Rule 3. Where they stand: the same person in one of the roles that
  // count, or a pair of candidates there (`spot.via`), which counts once
  // that pair is flagged itself.
  const spots = new Map<string, { own: boolean; via: Set<string> }>();
  const meet = (
    map: Map<string, Set<string>>,
    a: string,
    b: string,
    spot: { own: boolean; via: Set<string> },
  ) => {
    const ofB = map.get(b) ?? NONE;
    for (const x of map.get(a) ?? NONE) {
      for (const y of ofB) {
        if (x === y) spot.own = true;
        else if (candidates.has(pairKey(x, y))) spot.via.add(pairKey(x, y));
      }
    }
  };
  for (const [key, [a, b]] of candidates) {
    const spot = { own: false, via: new Set<string>() };
    meet(children, a.id, b.id, spot);
    if (!a.tree_ids.some((t) => b.tree_ids.includes(t))) {
      meet(parents, a.id, b.id, spot);
      meet(partners, a.id, b.id, spot);
      meet(siblings, a.id, b.id, spot);
      if (sameBirthday(a, b)) spot.own = true;
    }
    spots.set(key, spot);
  }

  // Flagged pairs counting as one person, until nothing changes.
  const flagged = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [key, spot] of spots) {
      if (flagged.has(key)) continue;
      if (!spot.own && ![...spot.via].some((k) => flagged.has(k))) continue;
      flagged.add(key);
      grew = true;
    }
  }

  return [...flagged].sort().map((key) => {
    const spot = spots.get(key)!;
    return {
      ids: key.split("|") as [string, string],
      via: spot.own ? [] : [...spot.via].filter((k) => flagged.has(k)).sort(),
    };
  });
}

/**
 * The pairs still asked about once the viewer has said some are two people
 * (`dismissed`, by `pairKey`): a pair that stood only on those goes with
 * them, and comes back with them.
 */
export function shownSamePairs(
  pairs: readonly SamePair[],
  dismissed: ReadonlySet<string> = NONE,
): SamePair[] {
  const shown = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pairs) {
      const key = pairKey(...p.ids);
      if (shown.has(key) || dismissed.has(key)) continue;
      if (p.via.length > 0 && !p.via.some((k) => shown.has(k))) continue;
      shown.add(key);
      grew = true;
    }
  }
  return pairs.filter((p) => shown.has(pairKey(...p.ids)));
}

/** Each flagged card's others, by id, for its card and its sheet. */
export function samePeopleById(
  pairs: readonly SamePair[],
  dismissed: ReadonlySet<string> = NONE,
): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const {
    ids: [a, b],
  } of shownSamePairs(pairs, dismissed)) {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      const list = byId.get(x);
      if (list) list.push(y);
      else byId.set(x, [y]);
    }
  }
  return byId;
}
