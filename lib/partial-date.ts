/**
 * Dates the family only partly knows — "1931", "March 1931" — and how they
 * are typed, checked, stored and shown.
 *
 * A date is stored as a `date` plus how much of it is known
 * (`people.date_of_birth_precision`, Step 17), on the first day of its period:
 * "1931" is 1931-01-01 at "year", "March 1931" is 1931-03-01 at "month". So
 * anything that only reads the year needs no change, and anything that shows
 * the whole date has to ask the precision first — which is what this is for.
 */

export const DATE_PRECISIONS = ["day", "month", "year"] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** A stored precision, or "day" for anything unrecognised (older rows). */
export function asDatePrecision(value: unknown): DatePrecision {
  return value === "month" || value === "year" ? value : "day";
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "3 May 1950", "May 1950" or "1950", as much of the date as is known; null
 * when there is no date.
 *
 * Spelled out from a fixed list rather than `toLocaleDateString`, which reads
 * the browser's locale — "May 3, 1950" in one relative's browser and "03/05/1950"
 * in another's — and can't say "only the year" at all.
 */
export function formatPartialDate(
  iso: string | null | undefined,
  precision?: string | null,
): string | null {
  if (!iso) return null;
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return null;

  switch (asDatePrecision(precision)) {
    case "year":
      return year;
    case "month":
      return `${monthName} ${year}`;
    default:
      return `${Number(day)} ${monthName} ${year}`;
  }
}

// ---------------------------------------------------------------------------
// Typing a date
// ---------------------------------------------------------------------------

/** The three boxes of a date being typed; any of them may be empty. */
export type DateParts = { year: string; month: string; day: string };

/**
 * A date being typed is held as one string, so the form keeps a single value
 * per date: `year-month-day` with any part allowed to be empty. Finished, it is
 * plain ISO — "1950-05-03" — or ISO's own reduced precision, "1950-05" and
 * "1950". Half-typed, it can be "-05" (a month, no year yet) or "1950--3" (a
 * day, no month), which is what lets the form say what's missing.
 */
export function splitDateParts(value: string | null | undefined): DateParts {
  const [year = "", month = "", day = ""] = (value ?? "").trim().split("-");
  return { year, month, day };
}

export function joinDateParts({ year, month, day }: DateParts): string {
  if (day) return `${year}-${month}-${day}`;
  if (month) return `${year}-${month}`;
  return year;
}

const MIN_YEAR = 1000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * What's wrong with a typed date, in words for the form — or null when it is
 * fine. Empty is fine: whether a date is required is the form's call.
 *
 * `allowPartial` is off for dates that must be whole (marriage and divorce,
 * which have no precision column yet).
 */
export function dateProblem(
  value: string | null | undefined,
  {
    allowPartial,
    maxYear = new Date().getFullYear(),
  }: { allowPartial: boolean; maxYear?: number },
): string | null {
  const { year, month, day } = splitDateParts(value);
  if (!year && !month && !day) return null;
  if (!year) return "Add the year.";
  if (!/^\d{4}$/.test(year)) return "Use a 4-digit year.";
  const y = Number(year);
  if (y < MIN_YEAR || y > maxYear) {
    return `Use a year between ${MIN_YEAR} and ${maxYear}.`;
  }
  if (day && !month) return "Pick the month, or clear the day.";
  if (month && !/^(0?[1-9]|1[0-2])$/.test(month)) return "Pick a month.";
  if (day) {
    if (!/^\d{1,2}$/.test(day)) return "Use numbers for the day.";
    const d = Number(day);
    if (d < 1 || d > daysInMonth(y, Number(month))) {
      return "That day isn't in that month.";
    }
  }
  if (!allowPartial && (!month || !day)) {
    return "Enter the whole date, or clear it.";
  }
  return null;
}

function precisionOf({ month, day }: DateParts): DatePrecision {
  if (day) return "day";
  if (month) return "month";
  return "year";
}

/**
 * Where a checked value is stored: the first day of its period, plus how much
 * of it is known. "1931" is 1931-01-01 at "year"; nothing is null at "day".
 */
export function toStoredDate(value: string | null | undefined): {
  date: string | null;
  precision: DatePrecision;
} {
  const parts = splitDateParts(value);
  if (!parts.year) return { date: null, precision: "day" };
  const month = (parts.month || "1").padStart(2, "0");
  const day = (parts.day || "1").padStart(2, "0");
  return { date: `${parts.year}-${month}-${day}`, precision: precisionOf(parts) };
}

/** The value a form opens with, for a stored date and its precision. */
export function toPartialIso(
  date: string | null | undefined,
  precision?: string | null,
): string {
  if (!date) return "";
  const match = ISO_DATE.exec(date);
  if (!match) return "";
  const [, year, month] = match;
  switch (asDatePrecision(precision)) {
    case "year":
      return year;
    case "month":
      return `${year}-${month}`;
    default:
      return date;
  }
}

const COARSENESS: Record<DatePrecision, number> = { day: 0, month: 1, year: 2 };

/**
 * Whether `a` is certainly before `b`, compared only as finely as the coarser
 * of the two is known: died "1990" is not before born 3 May 1990, but died
 * 30 April 1990 is before born "May 1990". Anything half-typed or out of range
 * counts as not before — its own check already says what's wrong with it.
 */
export function isBeforeAtSharedPrecision(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (dateProblem(a, { allowPartial: true })) return false;
  if (dateProblem(b, { allowPartial: true })) return false;
  const pa = splitDateParts(a);
  const pb = splitDateParts(b);
  const shared = Math.max(
    COARSENESS[precisionOf(pa)],
    COARSENESS[precisionOf(pb)],
  );
  const key = (p: DateParts) => [
    Number(p.year),
    shared <= COARSENESS.month ? Number(p.month) : 0,
    shared === COARSENESS.day ? Number(p.day) : 0,
  ];
  const [ka, kb] = [key(pa), key(pb)];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] < kb[i];
  }
  return false;
}
