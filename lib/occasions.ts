/**
 * Birthdays and wedding anniversaries coming up (Step 57.1), for the canvas's
 * **Upcoming** card. The canvas hands it the people it is drawing, so the
 * filters that narrow the tree narrow the list with it.
 *
 * Only whole dates count. A birth date known to the month or the year has no
 * day to keep (`date_of_birth_precision`, Step 17); a marriage date is always
 * whole, as it has no precision column. Only the living have birthdays here,
 * and only couples still married, both living, have anniversaries: this is
 * what's coming up to celebrate, not a record of the dead.
 *
 * Dates are calendar days, `YYYY-MM-DD`, with "today" in the viewer's own
 * time zone (`localDay`), so the list turns over at their midnight.
 */

import { asDatePrecision, MONTH_NAMES } from "@/lib/partial-date";
import { personHasDied } from "@/lib/person-name";

/** What an occasion reads off a person. */
export type OccasionPerson = {
  id: string;
  date_of_birth: string | null;
  date_of_birth_precision: string;
  date_of_death: string | null;
  is_deceased: boolean;
};

/** What an occasion reads off a line: only a marriage has one. */
export type OccasionEdge = {
  from_person: string;
  to_person: string;
  type: string;
  marriage_date: string | null;
  is_divorced: boolean;
};

export type Occasion = {
  kind: "birthday" | "anniversary";
  /** Whose birthday; both partners, for an anniversary. */
  people: string[];
  /** The day it next falls on, `YYYY-MM-DD`; today counts. */
  date: string;
  /** Days from today to `date`: 0 is today. */
  daysAway: number;
  /** The age they turn, or the years they'll have been married. */
  years: number;
};

/** How far ahead the card looks: a year, so everyone's next one is on it. */
export const OCCASION_DAYS = 366;

/** A week, today included: what the Upcoming button counts. */
export const WEEK_DAYS = 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type Ymd = { y: number; m: number; d: number };

function parse(iso: string | null | undefined): Ymd | null {
  const match = iso ? ISO_DATE.exec(iso) : null;
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const iso = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const utc = ({ y, m, d }: Ymd) => Date.UTC(y, m - 1, d);
const DAY_MS = 86_400_000;

/** Today in the viewer's own time zone, as `YYYY-MM-DD`. */
export function localDay(now: Date = new Date()): string {
  return iso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

/**
 * The day a date comes round again in `year`. Someone born on 29 February
 * keeps it on the 28th in a year without one: still February, still theirs.
 */
function inYear({ m, d }: Ymd, year: number): Ymd {
  return { y: year, m, d: m === 2 && d === 29 && !isLeap(year) ? 28 : d };
}

/** When `date` next comes round from `today`, today included. */
function nextOccurrence(date: Ymd, today: Ymd): Ymd {
  const thisYear = inYear(date, today.y);
  return utc(thisYear) >= utc(today) ? thisYear : inYear(date, today.y + 1);
}

function occasion(
  kind: Occasion["kind"],
  people: string[],
  from: Ymd,
  today: Ymd,
): Occasion | null {
  const next = nextOccurrence(from, today);
  const years = next.y - from.y;
  // The day itself (born today, married today) isn't an anniversary of it,
  // and a date still to come is a mistake in the entry.
  if (years < 1) return null;
  return {
    kind,
    people,
    date: iso(next),
    daysAway: Math.round((utc(next) - utc(today)) / DAY_MS),
    years,
  };
}

/**
 * Every birthday and anniversary among `people` in the next `within` days,
 * soonest first. Lines to anyone not in `people` are left out, so passing the
 * people a filtered canvas draws gives that canvas's occasions. `nameOf` puts
 * a day's occasions in alphabetical order; without it, they keep the order
 * `people` gave them.
 */
export function upcomingOccasions(
  people: readonly OccasionPerson[],
  edges: readonly OccasionEdge[],
  today: string,
  {
    within = OCCASION_DAYS,
    nameOf,
  }: { within?: number; nameOf?: (personId: string) => string } = {},
): Occasion[] {
  const day = parse(today);
  if (!day) return [];

  const living = new Map<string, OccasionPerson>();
  for (const p of people) if (!personHasDied(p)) living.set(p.id, p);

  const found: Occasion[] = [];
  for (const p of living.values()) {
    if (asDatePrecision(p.date_of_birth_precision) !== "day") continue;
    const born = parse(p.date_of_birth);
    const birthday = born && occasion("birthday", [p.id], born, day);
    if (birthday) found.push(birthday);
  }

  const couples = new Set<string>();
  for (const e of edges) {
    if (e.type !== "spouse" || e.is_divorced) continue;
    if (!living.has(e.from_person) || !living.has(e.to_person)) continue;
    // A marriage stored twice, once each way, is still one anniversary.
    const key = [e.from_person, e.to_person].sort().join("~");
    if (couples.has(key)) continue;
    const married = parse(e.marriage_date);
    const anniversary =
      married &&
      occasion("anniversary", [e.from_person, e.to_person], married, day);
    if (!anniversary) continue;
    couples.add(key);
    found.push(anniversary);
  }

  const name = (o: Occasion) =>
    nameOf ? o.people.map(nameOf).join(" & ") : "";
  return found
    .filter((o) => o.daysAway < within)
    .sort(
      (a, b) =>
        a.daysAway - b.daysAway ||
        // A birthday first, then the anniversaries of the same day.
        (a.kind === b.kind ? 0 : a.kind === "birthday" ? -1 : 1) ||
        name(a).localeCompare(name(b)),
    );
}

/** A run of occasions under one heading of the card. */
export type OccasionGroup = { key: string; label: string; items: Occasion[] };

/**
 * The card's headings: **Today**, **Tomorrow**, **This week** for the rest of
 * the next seven days, then a month at a time, the year added once it isn't
 * this one ("September 2027"), so a month a year off never reads as this one.
 */
export function groupOccasions(
  occasions: readonly Occasion[],
  today: string,
): OccasionGroup[] {
  const thisYear = parse(today)?.y;
  const groups: OccasionGroup[] = [];
  for (const o of occasions) {
    const date = parse(o.date)!;
    const [key, label] =
      o.daysAway === 0
        ? ["today", "Today"]
        : o.daysAway === 1
          ? ["tomorrow", "Tomorrow"]
          : o.daysAway < WEEK_DAYS
            ? ["week", "This week"]
            : [
                `${date.y}-${pad(date.m)}`,
                date.y === thisYear
                  ? MONTH_NAMES[date.m - 1]
                  : `${MONTH_NAMES[date.m - 1]} ${date.y}`,
              ];
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(o);
    else groups.push({ key, label, items: [o] });
  }
  return groups;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * "Sat 3 Oct": the day an occasion falls on, spelled out from fixed lists as
 * `formatPartialDate` does, so every relative reads the same thing.
 */
export function occasionDay(date: string): string {
  const ymd = parse(date);
  if (!ymd) return date;
  const weekday = WEEKDAYS[new Date(utc(ymd)).getUTCDay()];
  return `${weekday} ${ymd.d} ${MONTH_NAMES[ymd.m - 1].slice(0, 3)}`;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** What an occasion is, in the card's words: "Turns 34", "25th anniversary". */
export function occasionTitle(o: Occasion): string {
  return o.kind === "birthday"
    ? `Turns ${o.years}`
    : `${ordinal(o.years)} anniversary`;
}
