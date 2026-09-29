/**
 * Dates the family only partly knows — "1931", "March 1931", "5 March" — and
 * how they are typed, checked, stored and shown.
 *
 * A date is stored as a `date` plus how much of it is known
 * (`people.date_of_birth_precision`, Step 17), on the first day of its period:
 * "1931" is 1931-01-01 at "year", "March 1931" is 1931-03-01 at "month". So
 * anything that only reads the year needs no change, and anything that shows
 * the whole date has to ask the precision first — which is what this is for.
 *
 * A birthday or a wedding anniversary can also be a day and month with no
 * year (Step 63). A `date` needs a year, so that one is stored apart, as a
 * `DayMonth` (`people.birth_month` / `birth_day`, `relationships.
 * marriage_month` / `marriage_day`), with no `date`: whatever reads a year
 * sees none, as it should.
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

/** A day and month whose year isn't known (Step 63). */
export type DayMonth = { month: number; day: number };

/** The day and month two columns hold, or null unless both do. */
export function asDayMonth(
  month: number | null | undefined,
  day: number | null | undefined,
): DayMonth | null {
  return month && day ? { month, day } : null;
}

/** "5 March", or null. */
export function formatDayMonth(
  value: DayMonth | null | undefined,
): string | null {
  const monthName = value ? MONTH_NAMES[value.month - 1] : undefined;
  return value && monthName ? `${value.day} ${monthName}` : null;
}

/**
 * "3 May 1950", "May 1950" or "1950", as much of the date as is known, or
 * "3 May" for a day and month with no year (`withoutYear`); null when there
 * is no date. A rough date (`circa`, Step 81) reads "c. 1950".
 *
 * Spelled out from a fixed list rather than `toLocaleDateString`, which reads
 * the browser's locale — "May 3, 1950" in one relative's browser and "03/05/1950"
 * in another's — and can't say "only the year" at all.
 */
export function formatPartialDate(
  iso: string | null | undefined,
  precision?: string | null,
  withoutYear?: DayMonth | null,
  circa?: boolean | null,
): string | null {
  if (!iso) return formatDayMonth(withoutYear);
  const match = ISO_DATE.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return null;

  const known = (() => {
    switch (asDatePrecision(precision)) {
      case "year":
        return year;
      case "month":
        return `${monthName} ${year}`;
      default:
        return `${Number(day)} ${monthName} ${year}`;
    }
  })();
  return circaDate(known, circa);
}

/** A date or a year as a rough estimate reads it (Step 81): "c. 1950". */
export function circaDate(text: string, circa?: boolean | null): string {
  return circa ? `c. ${text}` : text;
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

/** Any leap year: a day and month with no year may be 29 February. */
const LEAP_YEAR = 2000;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * What's wrong with a typed date, in words for the form — or null when it is
 * fine. Empty is fine: whether a date is required is the form's call.
 *
 * `allowPartial` is off for dates that must be whole (marriage and divorce,
 * which have no precision column yet). `allowNoYear` lets a birthday or a
 * wedding anniversary be a day and month alone (Step 63).
 */
export function dateProblem(
  value: string | null | undefined,
  {
    allowPartial,
    allowNoYear = false,
    maxYear = new Date().getFullYear(),
  }: { allowPartial: boolean; allowNoYear?: boolean; maxYear?: number },
): string | null {
  const { year, month, day } = splitDateParts(value);
  if (!year && !month && !day) return null;
  if (!year) {
    return allowNoYear
      ? dayMonthProblem(month, day, allowPartial)
      : "Add the year.";
  }
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

/** What's wrong with a day and month typed without a year, or null. */
function dayMonthProblem(
  month: string,
  day: string,
  allowPartial: boolean,
): string | null {
  if (!month) return "Pick the month, or clear the day.";
  if (!/^(0?[1-9]|1[0-2])$/.test(month)) return "Pick a month.";
  // A month alone is half of "5 March", or of "March 1950" where that's allowed.
  if (!day) return allowPartial ? "Add the day, or the year." : "Add the day.";
  if (!/^\d{1,2}$/.test(day)) return "Use numbers for the day.";
  const d = Number(day);
  if (d < 1 || d > daysInMonth(LEAP_YEAR, Number(month))) {
    return "That day isn't in that month.";
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
 * A day and month with no year has no `date`, only `withoutYear`.
 */
export function toStoredDate(value: string | null | undefined): {
  date: string | null;
  precision: DatePrecision;
  withoutYear: DayMonth | null;
} {
  const parts = splitDateParts(value);
  if (!parts.year) {
    const withoutYear =
      /^\d{1,2}$/.test(parts.month) && /^\d{1,2}$/.test(parts.day)
        ? asDayMonth(Number(parts.month), Number(parts.day))
        : null;
    return { date: null, precision: "day", withoutYear };
  }
  const month = (parts.month || "1").padStart(2, "0");
  const day = (parts.day || "1").padStart(2, "0");
  return {
    date: `${parts.year}-${month}-${day}`,
    precision: precisionOf(parts),
    withoutYear: null,
  };
}

/**
 * The value a form opens with, for a stored date and its precision, or for a
 * day and month with no year: "-03-05".
 */
export function toPartialIso(
  date: string | null | undefined,
  precision?: string | null,
  withoutYear?: DayMonth | null,
): string {
  if (!date) {
    if (!withoutYear) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `-${pad(withoutYear.month)}-${pad(withoutYear.day)}`;
  }
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

/**
 * What's wrong with a marriage's dates, field by field. They have to be whole
 * — `relationships` has no precision column yet — though a marriage may be a
 * day and month without the year, for its anniversary (Step 63); and a
 * divorce can't come before the marriage it ends.
 */
export function marriageDateProblems({
  marriageDate,
  isDivorced,
  divorceDate,
}: {
  marriageDate?: string | null;
  isDivorced?: boolean | null;
  divorceDate?: string | null;
}): { marriage: string | null; divorce: string | null } {
  const marriage = dateProblem(marriageDate, {
    allowPartial: false,
    allowNoYear: true,
  });
  const divorce = isDivorced
    ? dateProblem(divorceDate, { allowPartial: false })
    : null;
  if (
    !marriage &&
    !divorce &&
    isDivorced &&
    isBeforeAtSharedPrecision(divorceDate, marriageDate)
  ) {
    return {
      marriage: null,
      divorce: "The divorce date can't be before the marriage date.",
    };
  }
  return { marriage, divorce };
}
