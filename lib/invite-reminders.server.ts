import "server-only";

import { sendEmails, unsentSummary } from "@/lib/email";
import { inviteReminderEmail } from "@/lib/emails/invite-reminder";
import {
  daysLeft,
  reminderStageDue,
  type ReminderStage,
} from "@/lib/invite-reminders";
import { inviteUrl } from "@/lib/invite-mint.server";
import { createAdminClient } from "@/lib/supabase/admin";

/** What a run did, for the cron job's answer and the logs: counts only. */
export type InviteReminderRun = {
  /** Live invites five days old or more, still worth reminding. */
  due: number;
  /** Sent to the mail provider (on a dry run, none). */
  sent: number;
  /** Noted by another run first. */
  skipped: number;
  /** Their email didn't go. */
  unsent: number;
  /** The reminders picked, by day: sent, or on a dry run, what would be. */
  reminders: { day5?: number; day25?: number };
};

/**
 * The day's reminders to people invited who haven't joined yet (Step 163),
 * from the daily cron after the newsletter and the getting started emails,
 * newsletter day included: each invite is reminded on day 5 and day 25
 * with its own link (`reminderStageDue`). The database leaves out any that
 * joined, lapsed, were archived, or are no longer worth having
 * (`invite_reminders_due`), and notes each just before it goes
 * (`record_invite_reminders`), so a second run the same day sends nothing.
 * `dry` sends nothing and notes nothing: it counts what would go.
 */
export async function sendInviteReminders(
  opts: { now?: Date; dry?: boolean } = {},
): Promise<InviteReminderRun> {
  const now = opts.now ?? new Date();
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("invite_reminders_due");
  if (error) throw new Error(`invite_reminders_due: ${error.message}`);
  const rows = data ?? [];

  const run: InviteReminderRun = { due: rows.length, sent: 0, skipped: 0, unsent: 0, reminders: {} };
  const picked = rows.flatMap((row) => {
    const stage = reminderStageDue(row.created_at, row.stages ?? [], now);
    return stage ? [{ row, stage }] : [];
  });
  for (const { stage } of picked) {
    const key = DAY_KEY[stage];
    run.reminders[key] = (run.reminders[key] ?? 0) + 1;
  }
  if (opts.dry || !picked.length) return log(run, opts.dry);

  const { data: noted, error: noteError } = await supabase.rpc("record_invite_reminders", {
    p_sends: picked.map(({ row, stage }) => ({ invite_id: row.invite_id, stage })),
  });
  if (noteError) throw new Error(`record_invite_reminders: ${noteError.message}`);
  const ours = new Set(noted ?? []);
  const toSend = picked.filter(({ row }) => ours.has(row.invite_id));
  run.skipped = picked.length - toSend.length;

  const results = await sendEmails(
    toSend.map(({ row, stage }) => ({
      to: row.email,
      ...inviteReminderEmail({
        stage,
        firstName: row.first_name,
        inviterName: row.inviter_name,
        treeName: row.tree_name,
        entryName: row.claim_person_name,
        placeholder: row.placeholder,
        daysLeft: daysLeft(row.expires_at, now),
        url: inviteUrl(row.token),
      }),
    })),
  );
  run.sent = results.filter((s) => s.ok).length;
  run.unsent = results.length - run.sent;
  const unsent = unsentSummary(results);
  if (unsent) console.error(`[invite reminders] ${unsent}`);
  return log(run, false);
}

const DAY_KEY: Record<ReminderStage, "day5" | "day25"> = { 1: "day5", 2: "day25" };

function log(run: InviteReminderRun, dry: boolean | undefined): InviteReminderRun {
  console.info(
    `[invite reminders]${dry ? " dry run:" : ""} due ${run.due}, sent ${run.sent}, skipped ${run.skipped}, unsent ${run.unsent}, reminders ${JSON.stringify(run.reminders)}`,
  );
  return run;
}
