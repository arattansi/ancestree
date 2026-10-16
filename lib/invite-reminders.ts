/**
 * Reminders to someone invited who hasn't joined yet (Step 163, audit W4):
 * the same link again on day 5 and on day 25 of its 30
 * (`INVITE_LIFETIME_DAYS`). Pure; the daily cron's run is
 * `lib/invite-reminders.server.ts`, and the database says which invites
 * are still worth reminding (`invite_reminders_due`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The days, from when it was sent, that an invite's reminders go. */
export const INVITE_REMINDER_DAYS = [5, 25] as const;

/** 1 for day 5's reminder, 2 for day 25's (`invite_reminders.stage`). */
export type ReminderStage = 1 | 2;

/** Whole days since `from`, as the database counts them (`interval '5 days'`). */
export function daysSince(from: string | Date, now: Date): number {
  const at = from instanceof Date ? from : new Date(from);
  return Math.floor((now.getTime() - at.getTime()) / DAY_MS);
}

/**
 * The reminder an invite is due, given the stages it has had: the latest
 * whose day has come, if it hasn't had that one or a later one. A stage
 * missed (the job didn't run) is passed over once the next is due, so
 * nobody hears twice in a few days.
 */
export function reminderStageDue(
  createdAt: string | Date,
  stages: readonly number[],
  now: Date,
): ReminderStage | null {
  const age = daysSince(createdAt, now);
  let due: ReminderStage | null = null;
  INVITE_REMINDER_DAYS.forEach((day, i) => {
    if (age >= day) due = (i + 1) as ReminderStage;
  });
  if (due === null) return null;
  return due > Math.max(0, ...stages) ? due : null;
}

/** Whole days left before a live invite lapses: a part day counts. */
export function daysLeft(expiresAt: string | Date, now: Date): number {
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Math.max(1, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));
}
