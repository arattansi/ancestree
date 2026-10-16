import { NextResponse, type NextRequest } from "next/server";

import { fromTheJob } from "@/lib/cron.server";
import {
  sendInviteReminders,
  type InviteReminderRun,
} from "@/lib/invite-reminders.server";
import {
  sendScheduledNewsletters,
  sendWeeklyNewsletters,
  type NewsletterRun,
} from "@/lib/newsletter.server";
import { isOnboardingKind } from "@/lib/onboarding";
import { sendOnboardingEmails, type OnboardingRun } from "@/lib/onboarding.server";

/** A run reads every tree and sends in batches: allow it the full five minutes. */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `GET /api/cron/newsletter`: the weekly newsletter (Step 95), the getting
 * started emails (Step 151) and the reminders to people invited who
 * haven't joined (Step 163), called by Vercel Cron every day at 15:00 UTC
 * (`vercel.json`) and by nobody else — without the job's secret it answers
 * 401 and does nothing. The newsletter goes only on the day the beta
 * reviewers chose, unless they paused it (`newsletter_schedule`); the
 * getting started emails on Saturday and Sunday when it isn't the
 * newsletter's day (a weekday's wait for 3pm Pacific,
 * `/api/cron/getting-started`, Step 172); the reminders every day. Each
 * runs whether or not the others failed.
 *
 * `?user=<id>` (repeatable) sends the newsletter to those members now,
 * whatever the day, for a test send with the same secret. `?drip=send`
 * with `user` sends them a getting started email instead (`kind` names
 * which), noted nowhere; `?drip=dry` sends nothing and answers what the
 * day's run would send (to `user`, or everyone). `?reminders=send` runs
 * only the day's invite reminders (again, after a failure: a second run
 * sends nothing twice); `?reminders=dry` answers what they would be, and
 * sends none. Answers with counts only.
 */
export async function GET(request: NextRequest) {
  if (!fromTheJob(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  // A test send names its members; a malformed one is refused rather than
  // read as "everyone".
  const users = params.getAll("user");
  if (users.some((u) => !UUID.test(u))) {
    return NextResponse.json({ error: "Not a member id." }, { status: 400 });
  }
  const reminders = params.get("reminders");
  if (reminders !== null) {
    if ((reminders !== "dry" && reminders !== "send") || users.length) {
      return NextResponse.json({ error: "Not a reminders run." }, { status: 400 });
    }
    try {
      const run = await sendInviteReminders({ dry: reminders === "dry" });
      return NextResponse.json({ reminders: run }, { headers: NO_STORE });
    } catch (err) {
      console.error("[invite reminders] the run failed", err);
      return NextResponse.json({ error: "The run failed." }, { status: 500 });
    }
  }

  const drip = params.get("drip");
  const kind = params.get("kind");
  if (
    (drip !== null && drip !== "send" && drip !== "dry") ||
    (drip === "send" && !users.length) ||
    (kind !== null && !isOnboardingKind(kind))
  ) {
    return NextResponse.json({ error: "Not a drip run." }, { status: 400 });
  }

  if (drip) {
    try {
      const run = await sendOnboardingEmails({
        users: users.length ? users : undefined,
        dry: drip === "dry",
        kind: kind && isOnboardingKind(kind) ? kind : undefined,
      });
      return NextResponse.json({ drip: run }, { headers: NO_STORE });
    } catch (err) {
      console.error("[onboarding] the run failed", err);
      return NextResponse.json({ error: "The run failed." }, { status: 500 });
    }
  }

  let newsletter: NewsletterRun | { error: string };
  try {
    newsletter = users.length
      ? await sendWeeklyNewsletters({ users })
      : await sendScheduledNewsletters();
  } catch (err) {
    console.error("[newsletter] the run failed", err);
    newsletter = { error: "The run failed." };
  }
  // A test send of the newsletter is only that.
  if (users.length) {
    return "error" in newsletter
      ? NextResponse.json(newsletter, { status: 500 })
      : NextResponse.json(newsletter, { headers: NO_STORE });
  }

  let gettingStarted: OnboardingRun | { error: string };
  try {
    gettingStarted = await sendOnboardingEmails();
  } catch (err) {
    console.error("[onboarding] the run failed", err);
    gettingStarted = { error: "The run failed." };
  }
  let inviteReminders: InviteReminderRun | { error: string };
  try {
    inviteReminders = await sendInviteReminders();
  } catch (err) {
    console.error("[invite reminders] the run failed", err);
    inviteReminders = { error: "The run failed." };
  }
  const failed =
    "error" in newsletter || "error" in gettingStarted || "error" in inviteReminders;
  return NextResponse.json(
    { ...newsletter, drip: gettingStarted, reminders: inviteReminders },
    { status: failed ? 500 : 200, headers: NO_STORE },
  );
}
