import "server-only";

import { openConsoleHref } from "@/lib/admin-queue";
import { sendEmail } from "@/lib/email";
import { accessRequestedEmail } from "@/lib/emails/access-requested";
import { treeRequestedEmail } from "@/lib/emails/tree-requested";
import {
  ACCESS_REQUEST_ALERT_CAP,
  WAITLIST_ALERT_CAP,
  alertBudget,
  alertRecipients,
} from "@/lib/request-alerts";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Emailing approvers the moment someone asks (Step 30.1). Both run after
 * the person asking has their answer (`after()` in the server actions), so
 * nothing here can slow the form down or fail it: every problem is logged
 * and swallowed, and the request waits in the queue either way. Addresses
 * come from the service role (`tree_root_emails`, `beta_reviewer_emails`)
 * and never reach a browser.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back the caps look: a day, the longer of their two spans. */
function sinceADayAgo(): string {
  return new Date(Date.now() - DAY_MS).toISOString();
}

/**
 * One email per address rather than one to all of them, so no approver
 * sees another's address. One at a time: there are only ever a few, and
 * the mail provider limits how fast a team may send.
 */
async function sendToEach(
  to: string[],
  message: { subject: string; html: string },
  what: string,
): Promise<void> {
  let failed = 0;
  let lastError = "";
  for (const address of to) {
    const sent = await sendEmail({ to: address, ...message });
    if (!sent.ok) {
      failed += 1;
      lastError = sent.error;
    }
  }
  if (failed > 0) {
    console.error(
      `[request-alerts] ${what}: ${failed} of ${to.length} alerts failed to send — ${lastError}`,
    );
  } else {
    console.info(`[request-alerts] ${what}: emailed ${to.length}`);
  }
}

/**
 * Email every Root of a tree that someone just asked to join it —
 * `requestInvite`, for a new request only. Capped per tree, counting the
 * requests waiting on it (`ACCESS_REQUEST_ALERT_CAP`).
 */
export async function alertRootsOfAccessRequest(request: {
  treeId: string;
  treeName: string;
  firstName: string;
  lastName: string;
}): Promise<void> {
  const what = `request to join tree ${request.treeId}`;
  try {
    const supabase = createAdminClient();
    const { data: recent, error: recentError } = await supabase
      .from("invite_requests")
      .select("created_at")
      .eq("tree_id", request.treeId)
      .eq("status", "pending")
      .gte("created_at", sinceADayAgo())
      .order("created_at", { ascending: false })
      .limit(ACCESS_REQUEST_ALERT_CAP.perDay + 1);
    if (recentError) throw recentError;

    const budget = alertBudget(
      (recent ?? []).map((r) => r.created_at),
      new Date(),
      ACCESS_REQUEST_ALERT_CAP,
    );
    if (!budget.send) {
      console.warn(`[request-alerts] ${what}: over the alert cap, so no email`);
      return;
    }

    const { data: emails, error } = await supabase.rpc("tree_root_emails", {
      p_tree_id: request.treeId,
    });
    if (error) throw error;
    const to = alertRecipients(emails ?? []);
    if (to.length === 0) return;

    await sendToEach(
      to,
      accessRequestedEmail({
        firstName: request.firstName,
        lastName: request.lastName,
        treeName: request.treeName,
        url: `${getSiteUrl()}${openConsoleHref("invite-requests", request.treeId)}`,
        lastFor: budget.lastFor,
        cap: ACCESS_REQUEST_ALERT_CAP,
      }),
      what,
    );
  } catch (err) {
    console.error(`[request-alerts] ${what}: couldn't alert its Roots`, err);
  }
}

/**
 * Email every beta reviewer about a new request to start a tree: a
 * waitlist sign-up (`joinBetaWaitlist`), capped across the site
 * (`WAITLIST_ALERT_CAP`), or a member's ask (`requestNewTree`). A member
 * can only have one ask open and needs an account to make it, so theirs
 * aren't capped — nor drowned out by a flooded waitlist.
 */
export async function alertReviewersOfTreeRequest(
  request:
    | { kind: "waitlist"; firstName: string; lastName: string }
    | { kind: "member"; userId: string },
): Promise<void> {
  const what = `${request.kind} request to start a tree`;
  try {
    const supabase = createAdminClient();

    let name: { firstName: string; lastName: string };
    let lastFor: "hour" | "day" | null = null;
    if (request.kind === "waitlist") {
      const { data: recent, error } = await supabase
        .from("tree_requests")
        .select("created_at")
        .is("user_id", null)
        .eq("status", "pending")
        .gte("created_at", sinceADayAgo())
        .order("created_at", { ascending: false })
        .limit(WAITLIST_ALERT_CAP.perDay + 1);
      if (error) throw error;
      const budget = alertBudget(
        (recent ?? []).map((r) => r.created_at),
        new Date(),
        WAITLIST_ALERT_CAP,
      );
      if (!budget.send) {
        console.warn(`[request-alerts] ${what}: over the alert cap, so no email`);
        return;
      }
      name = { firstName: request.firstName, lastName: request.lastName };
      lastFor = budget.lastFor;
    } else {
      // The name `request_tree` wrote: the one the queue shows.
      const { data: row, error } = await supabase
        .from("tree_requests")
        .select("first_name, last_name")
        .eq("user_id", request.userId)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      if (!row) return;
      name = { firstName: row.first_name, lastName: row.last_name };
    }

    const { data: emails, error } = await supabase.rpc("beta_reviewer_emails");
    if (error) throw error;
    const to = alertRecipients(emails ?? []);
    if (to.length === 0) return;

    await sendToEach(
      to,
      treeRequestedEmail({
        kind: request.kind,
        ...name,
        url: `${getSiteUrl()}${openConsoleHref("tree-requests")}`,
        lastFor,
        cap: WAITLIST_ALERT_CAP,
      }),
      what,
    );
  } catch (err) {
    console.error(`[request-alerts] ${what}: couldn't alert the reviewers`, err);
  }
}
