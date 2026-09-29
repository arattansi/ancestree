import { toStoredDate } from "@/lib/partial-date";

/**
 * A marriage's dates (Step 77.4, audit R3): as a form holds them, and as
 * `relationships` stores them. One reading of each, for the add-a-relative
 * form, a first run's partner, a new connection and a spouse's own row.
 */

/** As typed: dates the way `DateField` keeps them, any of them empty. */
export type SpouseDates = {
  marriage_date?: string;
  is_divorced?: boolean;
  divorce_date?: string;
};

/**
 * As stored: a whole marriage date, or a day and month with no year (Step
 * 63), never both; a divorce date only for a divorce.
 */
export type StoredSpouseDates = {
  marriage_date: string | null;
  marriage_month: number | null;
  marriage_day: number | null;
  is_divorced: boolean;
  divorce_date: string | null;
};

/**
 * What a form's dates are stored as: padded to ISO ("1965-03-5" →
 * "1965-03-05"), or a wedding day with no year.
 */
export function toStoredSpouseDates(
  dates: SpouseDates | undefined,
): StoredSpouseDates {
  const married = toStoredDate(dates?.marriage_date);
  const divorced = dates?.is_divorced ?? false;
  return {
    marriage_date: married.date,
    marriage_month: married.withoutYear?.month ?? null,
    marriage_day: married.withoutYear?.day ?? null,
    is_divorced: divorced,
    divorce_date: divorced ? toStoredDate(dates?.divorce_date).date : null,
  };
}

/**
 * What an action is sent, however it was sent: trimmed, a date or a day and
 * month, and a divorce date only for a divorce. The database's own checks
 * have the last word on the dates themselves.
 */
export function normalizeSpouseDates(input: {
  marriage_date?: string | null;
  marriage_month?: number | null;
  marriage_day?: number | null;
  is_divorced?: boolean | null;
  divorce_date?: string | null;
}): StoredSpouseDates {
  const married = input.marriage_date?.trim() || null;
  const divorced = input.is_divorced ?? false;
  return {
    marriage_date: married,
    marriage_month: married ? null : (input.marriage_month ?? null),
    marriage_day: married ? null : (input.marriage_day ?? null),
    is_divorced: divorced,
    divorce_date: divorced ? input.divorce_date?.trim() || null : null,
  };
}
