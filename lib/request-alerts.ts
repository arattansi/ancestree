/**
 * Telling approvers the moment someone asks (Step 30.1): a request to join
 * a tree emails that tree's Roots, and a request to start one emails the
 * beta reviewers (`lib/request-alerts.server.ts`). The forms are public, so
 * the emails are capped. Past the cap a request still waits in the queue;
 * it just doesn't email anyone.
 */

import type { TreeRequestStatus } from "@/lib/tree-requests";

/** At most this many alerts in any hour, and in any day. */
export type AlertCap = { perHour: number; perDay: number };

/**
 * Requests to join one tree. A family rarely sees more than a handful at
 * once — a share link dropped in a group chat — and by the fifth email its
 * Roots know to look at the queue. The daily cap bounds a slow drip that
 * stays under the hourly one.
 */
export const ACCESS_REQUEST_ALERT_CAP: AlertCap = { perHour: 5, perDay: 20 };

/**
 * The waitlist, one queue for the whole site: more headroom than one
 * family's, but it's the easiest form to flood (it needs no tree), so it
 * stays well inside the mail provider's daily quota.
 */
export const WAITLIST_ALERT_CAP: AlertCap = { perHour: 10, perDay: 30 };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type AlertBudget = {
  send: boolean;
  /**
   * This alert uses up the cap for the hour (or the day): the email says
   * so, since none follow for a while.
   */
  lastFor: "hour" | "day" | null;
};

/**
 * Whether to email about a request, from when the ones waiting in its
 * queue arrived over the last day — the new one included. Counted from
 * rows rather than a tally kept in memory, since each request may be
 * served by a different server.
 */
export function alertBudget(
  arrivals: readonly string[],
  now: Date,
  cap: AlertCap,
): AlertBudget {
  let hour = 0;
  let day = 0;
  for (const at of arrivals) {
    const age = now.getTime() - Date.parse(at);
    if (Number.isNaN(age)) continue;
    // Clocks differ a little between here and the database, so a row can
    // look a moment younger than now: it still counts.
    if (age < DAY_MS) day += 1;
    if (age < HOUR_MS) hour += 1;
  }
  if (hour > cap.perHour || day > cap.perDay) return { send: false, lastFor: null };
  return {
    send: true,
    lastFor: hour === cap.perHour ? "hour" : day === cap.perDay ? "day" : null,
  };
}

/** The addresses to alert: each once, in lower case, blanks dropped. */
export function alertRecipients(
  emails: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = (raw ?? "").trim().toLowerCase();
    if (email.includes("@")) seen.add(email);
  }
  return [...seen];
}

/**
 * A member's ask to start a tree is new — not a second press, which
 * `request_tree` also answers with "pending" — when it wasn't pending
 * before they asked.
 */
export function askedAfresh(
  before: unknown,
  after: TreeRequestStatus,
): boolean {
  return before === "none" && after === "pending";
}
