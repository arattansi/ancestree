import "server-only";

import { openConsoleHref } from "@/lib/admin-queue";
import { sendEmails, unsentSummary, type SendEmailInput } from "@/lib/email";
import { onboardingEmail } from "@/lib/emails/onboarding";
import { isSendDay } from "@/lib/newsletter";
import {
  buildFamilyIssues,
  readNewsletterSchedule,
  type FamilyIssue,
} from "@/lib/newsletter.server";
import {
  daysBetween,
  isDripHour,
  pickOnboardingEmail,
  utcDay,
  type ChurnBand,
  type OnboardingHold,
  type OnboardingKind,
  type OnboardingSend,
  type OnboardingStep,
} from "@/lib/onboarding";
import { personDisplayName } from "@/lib/person-name";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { readIn } from "@/lib/tree";
import {
  addRelativeHref,
  gettingStartedOneClickHref,
  gettingStartedPageHref,
  inviteRelativeHref,
  myFamilyFocusHref,
  myFamilyHref,
  peopleYouAddedHref,
  storyHref,
  treeHref,
} from "@/lib/tree-links";

/** What a run did, for the cron job's answer and the logs: counts only. */
export type OnboardingRun = {
  /** Members in the drip today. */
  due: number;
  /** Sent to the mail provider (on a dry run, none). */
  sent: number;
  /** Noted by another run first, or turned off meanwhile. */
  skipped: number;
  /** Couldn't be made: logged, never sent half-made. */
  failed: number;
  /** Their email didn't go. */
  unsent: number;
  /** The emails picked, by kind: sent, or on a dry run, what would be. */
  emails: Partial<Record<OnboardingKind, number>>;
  /** Everyone due, by churn band. */
  bands: Partial<Record<ChurnBand, number>>;
  /** Why the rest got nothing today. */
  holds: Partial<Record<OnboardingHold, number>>;
  /**
   * Nothing went: it's the newsletter's day, or a weekday call that isn't
   * at 3pm Pacific.
   */
  held?: "newsletter day" | "not 3pm Pacific";
};

/** A member in the drip, as `onboarding_due` reads them. */
type DueRow = {
  user_id: string;
  email: string;
  self_person_id: string | null;
  token: string;
  started_at: string;
  last_active: string | null;
  claimable: string[];
  people_added: number;
  invited: boolean;
  shared: boolean;
  tree_ids: string[];
  root_of: string[];
  sends: unknown;
};

/** An email picked for one member. */
type Picked = {
  row: DueRow;
  kind: OnboardingKind;
  step: OnboardingStep;
  reminder: boolean;
};

function emptyRun(): OnboardingRun {
  return { due: 0, sent: 0, skipped: 0, failed: 0, unsent: 0, emails: {}, bands: {}, holds: {} };
}

const tally = <K extends string>(counts: Partial<Record<K, number>>, key: K) => {
  counts[key] = (counts[key] ?? 0) + 1;
};

/** The sends `onboarding_due` returns, as the engine reads them. */
function sendsOf(raw: unknown): OnboardingSend[] {
  return Array.isArray(raw) ? (raw as OnboardingSend[]) : [];
}

/**
 * The getting started emails (Step 151), called by the cron jobs: on a
 * weekday by `/api/cron/getting-started` at 3pm Pacific (Step 172), on a
 * weekend by the newsletter's morning call, after the newsletter. Each
 * member in the drip gets today's email as `pickOnboardingEmail` picks it
 * from what they've done and how long they've been away, or nothing.
 * Nothing goes on the newsletter's day, or from a call at any other hour
 * (`isDripHour`). Each member is noted (`record_onboarding_sends`) just
 * before their email goes, so a second call that day sends nothing twice.
 *
 * `users` makes it a test send to those members: whatever their band and
 * next step call for now, whatever the day (`kind` picks the email
 * instead), noted nowhere, so the drip itself goes on as before. `dry`
 * makes, sends and notes nothing, and counts what would go; like any run,
 * it starts the drip for members it hasn't seen yet. The logs keep
 * counts, never an address.
 */
export async function sendOnboardingEmails(
  opts: {
    now?: Date;
    users?: string[];
    dry?: boolean;
    kind?: OnboardingKind;
  } = {},
): Promise<OnboardingRun> {
  const now = opts.now ?? new Date();
  const test = !!opts.users?.length;
  const run = emptyRun();
  if (!test && !opts.dry && !isDripHour(now)) return { ...run, held: "not 3pm Pacific" };
  const newsletterDay = isSendDay(await readNewsletterSchedule(), now);
  if (newsletterDay && !test && !opts.dry) return { ...run, held: "newsletter day" };

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("onboarding_due", {
    p_users: opts.users,
  });
  if (error) throw new Error(`onboarding_due: ${error.message}`);
  const due = (data ?? []) as DueRow[];
  run.due = due.length;

  const picked: Picked[] = [];
  for (const row of due) {
    const p = pickFor(row, { now, newsletterDay, test, kind: opts.kind });
    if (p.band) tally(run.bands, p.band);
    if ("hold" in p) tally(run.holds, p.hold);
    else picked.push(p);
  }
  // A dry run counts what it picked, and makes none of it.
  if (opts.dry) {
    for (const p of picked) tally(run.emails, p.kind);
    return log(run, true);
  }
  if (!picked.length) return log(run, false);

  const emails = await composeEmails(picked, now, run);
  for (const p of picked) if (emails.has(p.row.user_id)) tally(run.emails, p.kind);

  let toSend = [...emails.values()];
  if (!test) {
    const { data: noted, error: noteError } = await supabase.rpc(
      "record_onboarding_sends",
      {
        p_sends: picked
          .filter((p) => emails.has(p.row.user_id))
          .map((p) => ({ user_id: p.row.user_id, step: p.kind })),
      },
    );
    if (noteError) throw new Error(`record_onboarding_sends: ${noteError.message}`);
    const ours = new Set(noted ?? []);
    toSend = [...emails].filter(([id]) => ours.has(id)).map(([, e]) => e);
    run.skipped = emails.size - toSend.length;
  }

  const results = await sendEmails(toSend);
  run.sent = results.filter((s) => s.ok).length;
  run.unsent = results.length - run.sent;
  const unsent = unsentSummary(results);
  if (unsent) console.error(`[onboarding] ${unsent}`);
  return log(run, false);
}

/**
 * One member's email today, or why there's none. A test send may name the
 * email (`kind`): a step's own, or the win-back's over their next step (a
 * story's, once every step is taken).
 */
function pickFor(
  row: DueRow,
  {
    now,
    newsletterDay,
    test,
    kind: named,
  }: { now: Date; newsletterDay: boolean; test: boolean; kind?: OnboardingKind },
): (Picked & { band: ChurnBand }) | { hold: OnboardingHold; band: ChurnBand | null } {
  const pick = pickOnboardingEmail(
    {
      started_at: row.started_at,
      last_active: row.last_active,
      claimable: row.claimable.length,
      people_added: row.people_added,
      invited: row.invited,
      shared: row.shared,
      sends: sendsOf(row.sends),
    },
    { now, newsletterDay, test },
  );
  const forced = test ? named : undefined;
  if (pick.kind === null && !forced) return { hold: pick.hold, band: pick.band };
  const next = pick.kind === null ? null : pick;
  const kind = forced ?? next!.kind;
  const step: OnboardingStep =
    kind === "winback" || kind === "last" ? (next?.step ?? "story") : kind;
  return {
    row,
    kind,
    step,
    reminder: next?.step === step ? next.reminder : false,
    band: pick.band!,
  };
}

/**
 * A member's getting started email of `kind`, as it would go to them now,
 * sent to nobody and noted nowhere (Step 151): the admin page's preview
 * and its test email. A win-back or the last one tells the last two
 * weeks, as if they'd been away that long. Null when they're out of the
 * drip (switched off, or past its 60 days), or it can't be made.
 */
export async function previewOnboardingEmail(
  userId: string,
  kind: OnboardingKind,
): Promise<SendEmailInput | null> {
  const now = new Date();
  const { data, error } = await createAdminClient().rpc("onboarding_due", {
    p_users: [userId],
  });
  if (error) throw new Error(`onboarding_due: ${error.message}`);
  const [row] = (data ?? []) as DueRow[];
  if (!row) return null;
  const twoWeeks = new Date(now);
  twoWeeks.setUTCDate(twoWeeks.getUTCDate() - 14);
  const shown =
    kind === "winback" || kind === "last" ? { ...row, last_active: utcDay(twoWeeks) } : row;
  const p = pickFor(shown, { now, newsletterDay: false, test: true, kind });
  if ("hold" in p) return null;
  const emails = await composeEmails([p], now, emptyRun());
  return emails.get(userId) ?? null;
}

function log(run: OnboardingRun, dry: boolean | undefined): OnboardingRun {
  console.info(
    `[onboarding]${dry ? " dry run:" : ""} due ${run.due}, sent ${run.sent}, skipped ${run.skipped}, failed ${run.failed}, unsent ${run.unsent}, emails ${JSON.stringify(run.emails)}`,
  );
  return run;
}

/**
 * Each picked member's email, by user id: the names of the people to
 * invite, read once for everyone, and what changed in the family of each
 * one away, since the day after they were last here.
 */
async function composeEmails(
  picked: readonly Picked[],
  now: Date,
  run: OnboardingRun,
): Promise<Map<string, SendEmailInput>> {
  const admin = createAdminClient();
  const toName = [
    ...new Set(picked.flatMap((p) => (p.step === "claim" ? p.row.claimable : []))),
  ];
  const away = picked.filter(
    (p) => (p.kind === "winback" || p.kind === "last") && p.row.self_person_id,
  );
  const [named, recaps] = await Promise.all([
    readIn(toName, (chunk) =>
      admin
        .from("people")
        .select("id, first_name, preferred_name, last_name")
        .in("id", chunk),
    ),
    away.length
      ? buildFamilyIssues(
          away.map((p) => ({
            user_id: p.row.user_id,
            self_person_id: p.row.self_person_id,
            since: sinceLastHere(p.row, now),
            tree_ids: p.row.tree_ids,
          })),
          now,
        )
      : { issues: new Map<string, FamilyIssue>(), failed: new Set<string>() },
  ]);
  const nameOf = new Map(named.map((p) => [p.id, personDisplayName(p)]));

  const site = getSiteUrl();
  const emails = new Map<string, SendEmailInput>();
  for (const p of picked) {
    const { row } = p;
    if (recaps.failed.has(row.user_id)) {
      run.failed++;
      continue;
    }
    try {
      const people = row.claimable.flatMap((id) => {
        const name = nameOf.get(id);
        return name ? [name] : [];
      });
      // Nobody left to name: nothing to ask.
      if (p.step === "claim" && people.length === 0) {
        run.failed++;
        continue;
      }
      const runs = row.root_of[0] ?? null;
      const invite = runs
        ? openConsoleHref("family-link", runs)
        : inviteRelativeHref(row.tree_ids[0] ?? "");
      const unsubscribe = `${site}${gettingStartedPageHref(row.token)}`;
      emails.set(row.user_id, {
        to: row.email,
        ...onboardingEmail({
          kind: p.kind,
          step: p.step,
          reminder: p.reminder,
          people,
          runsTree: !!runs,
          recap: recaps.issues.get(row.user_id)?.issue ?? null,
          urls: {
            claim: `${site}${peopleYouAddedHref()}`,
            invite: `${site}${invite}`,
            family: `${site}${row.self_person_id ? addRelativeHref(row.self_person_id) : treeHref()}`,
            home: `${site}${myFamilyHref()}`,
            unsubscribe,
            personUrl: (id) => `${site}${myFamilyFocusHref(id)}`,
            storyUrl: (id) => `${site}${storyHref(id)}`,
          },
        }),
        headers: {
          "List-Unsubscribe": `<${site}${gettingStartedOneClickHref(row.token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    } catch (err) {
      run.failed++;
      console.error("[onboarding] couldn't make one email", err);
    }
  }
  return emails;
}

/**
 * The start of the day after they were last here, as an ISO timestamp:
 * what changed since then is news to them. Never more than 60 days back.
 */
function sinceLastHere(
  row: Pick<DueRow, "last_active" | "started_at">,
  now: Date,
): string {
  const today = utcDay(now);
  const last = row.last_active ?? utcDay(row.started_at);
  const back = Math.min(daysBetween(last, today) - 1, 60);
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - Math.max(back, 0));
  return since.toISOString();
}
