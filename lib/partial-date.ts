/**
 * Dates the family only partly knows — "1931", "March 1931" — and how they
 * are shown.
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
