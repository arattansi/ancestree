import { MONTH_NAMES } from "@/lib/partial-date";

/**
 * "23 Sep 2026": when an invite was sent, a link expires, a request came in
 * (Step 77.4, audit R4). Spelled out from a fixed list and read in UTC, not
 * with `toLocaleDateString`: that reads the browser's locale and time zone,
 * so a relative in one country saw "Sep 23, 2026", another "23/09/2026",
 * and the server's drawing of the page could disagree with the browser's
 * about the day. UTC is what the server draws with, so both agree; an hour
 * either side of midnight may name the neighbouring day.
 */
export function shortDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = MONTH_NAMES[date.getUTCMonth()].slice(0, 3);
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}
