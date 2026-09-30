import type { PhotoName } from "@/lib/photo-metadata";
import { asDatePrecision, splitDateParts } from "@/lib/partial-date";
import type { TagOption, TagPerson } from "@/lib/tag-person";
import { foldSearchText } from "@/lib/tree-search";

export type { TagOption, TagPerson } from "@/lib/tag-person";

/**
 * Who a new album photo might be of (Step 88.6): the names the photo
 * carries (`photo-metadata.ts`) matched to people on the tree, and everyone
 * on the tree put in order of whether they were alive when it was taken.
 * Nothing here decides a tag: each suggestion is one press to add.
 */

// ---------------------------------------------------------------------------
// Alive then
// ---------------------------------------------------------------------------

/** A rough date ("c. 1950") could be this many years either side. */
const CIRCA_YEARS = 5;

type Span = { from: number; to: number };

/** The days a date could be, as much of it as is known: "1962" is the
 *  whole of 1962. Day numbers, for comparing only. */
function spanOf(iso: string, precision: string, circa = false): Span | null {
  const { year, month, day } = splitDateParts(iso);
  const y = Number(year);
  if (!/^\d{4}$/.test(year)) return null;
  const known = asDatePrecision(precision);
  const m = month ? Number(month) : 1;
  const d = day ? Number(day) : 1;
  const widen = circa ? CIRCA_YEARS : 0;
  let from: number;
  let to: number;
  if (known === "year" || !month) {
    from = Date.UTC(y - widen, 0, 1);
    to = Date.UTC(y + widen + 1, 0, 0);
  } else if (known === "month" || !day) {
    from = Date.UTC(y - widen, m - 1, 1);
    to = Date.UTC(y + widen, m, 0);
  } else {
    from = Date.UTC(y - widen, m - 1, d);
    to = Date.UTC(y + widen, m - 1, d);
  }
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

/** The span of a date typed or read as partial ISO ("1962", "1962-03",
 *  "1962-03-05"). */
function spanOfTaken(taken: string): Span | null {
  const { month, day } = splitDateParts(taken);
  return spanOf(taken, day ? "day" : month ? "month" : "year");
}

export type LifeAt = "alive" | "unknown" | "not";

/**
 * Whether someone was alive when a photo was taken: certainly (born
 * before it and, if they've died, after it), certainly not (born after, or
 * dead before), or can't say.
 */
export function lifeAt(person: TagPerson, taken: string): LifeAt {
  const t = spanOfTaken(taken);
  if (!t) return "unknown";
  const born = person.born
    ? spanOf(person.born, person.bornPrecision, person.bornCirca)
    : null;
  const died =
    person.deceased && person.died
      ? spanOf(person.died, person.diedPrecision, person.diedCirca)
      : null;
  if (born && born.from > t.to) return "not";
  if (died && died.to < t.from) return "not";
  if (born && born.to <= t.from && (!person.deceased || (died && died.from >= t.to))) {
    return "alive";
  }
  return "unknown";
}

const LIFE_ORDER: Record<LifeAt, number> = { alive: 0, unknown: 1, not: 2 };

/** Everyone, those alive when the photo was taken first and those who
 *  can't have been in it last, otherwise as they were. */
export function rankByTaken<T extends TagOption>(options: T[], taken: string | null): T[] {
  if (!taken) return options;
  const rank = (o: T) => (o.person ? LIFE_ORDER[lifeAt(o.person, taken)] : 1);
  return options
    .map((o, i) => ({ o, i, r: rank(o) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ o }) => o);
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** A name as it's compared: no case, accents, punctuation or brackets;
 *  "Doe, Jane" as "jane doe". */
export function nameKey(raw: string | null | undefined): string {
  let s = (raw ?? "").replace(/[([{][^)\]}]*[)\]}]/g, " ");
  const parts = s.split(",");
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    s = `${parts[1]} ${parts[0]}`;
  }
  return foldSearchText(s)
    .replace(/['’‘`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

type Match = "full" | "given" | null;

/**
 * How a name from a photo matches someone: `full` when it's their given
 * name (first or preferred) and family name (last or maiden), with any of
 * their middle names or initials between; `given` when it's their given
 * name alone.
 */
export function matchName(name: string, person: TagPerson): Match {
  const n = nameKey(name);
  if (!n) return null;
  const givens = [person.first, person.preferred].map(nameKey).filter(Boolean);
  const families = [person.last, person.maiden].map(nameKey).filter(Boolean);
  const middles = nameKey(person.middle).split(" ").filter(Boolean);
  for (const g of givens) {
    for (const f of families) {
      if (n.length < g.length + f.length + 1) continue;
      if (!n.startsWith(`${g} `) || !n.endsWith(` ${f}`)) continue;
      const between = n.slice(g.length + 1, n.length - f.length - 1).trim();
      if (!between) return "full";
      const ok = between
        .split(" ")
        .every((w) => middles.includes(w) || (w.length === 1 && middles.some((m) => m[0] === w)));
      if (ok) return "full";
    }
  }
  return givens.includes(n) ? "given" : null;
}

/**
 * The people a photo's names point to, in the order to offer them.
 *
 * A name that's a full name suggests whoever has it. A lone given name
 * ("Jane") suggests someone only where the photo says it's a person (a
 * face or a People keyword, not any keyword) and only one person fits.
 * Where a name fits several, those alive when it was taken are kept
 * before the rest; and nobody is left out for their dates alone, since
 * a scan's date is often the day it was scanned.
 */
export function suggestTags(
  names: PhotoName[],
  options: TagOption[],
  taken: string | null,
): string[] {
  const out: string[] = [];
  const people = options.filter((o) => o.person);
  for (const { name, source } of names) {
    const matched = people.map((o) => ({ o, how: matchName(name, o.person!) }));
    const full = matched.filter((m) => m.how === "full").map((m) => m.o);
    const given =
      source === "keyword" ? [] : matched.filter((m) => m.how === "given").map((m) => m.o);
    let fits = full.length > 0 ? full : given;
    if (fits.length > 1 && taken) {
      const best = Math.min(...fits.map((o) => LIFE_ORDER[lifeAt(o.person!, taken)]));
      fits = fits.filter((o) => LIFE_ORDER[lifeAt(o.person!, taken)] === best);
    }
    if (full.length === 0 && fits.length !== 1) continue;
    for (const o of fits) if (!out.includes(o.id)) out.push(o.id);
  }
  return out;
}

/** "b. 1920" for telling apart two people of one name, or null. */
export function bornYear(person: TagPerson | undefined): string | null {
  const year = person?.born ? splitDateParts(person.born).year : "";
  return year ? `b. ${person?.bornCirca ? "c. " : ""}${year}` : null;
}
