import "server-only";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * After the response where there is one (`after`), else at once: a count
 * is never in the way of what it counts, and one that fails is only logged.
 */
function later(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task().catch(() => {});
  }
}

/**
 * What the server notes of an invite itself (Step 216), once it has checked
 * who may: the invite emailed, or a sign-in code sent from its page.
 */
export function noteInviteEvent(
  token: string,
  kind: "shared" | "code_sent",
): void {
  later(async () => {
    const { error } = await createAdminClient().rpc("note_invite_event", {
      p_token: token,
      p_kind: kind,
      p_channel: kind === "shared" ? "email" : undefined,
    });
    if (error) console.error(`[invite-events] ${kind} not noted — ${error.message}`);
  });
}

/** Invites emailed (`mintInvites` and the like): each one that went. */
export function noteInvitesEmailed(tokens: readonly string[]): void {
  for (const token of tokens) noteInviteEvent(token, "shared");
}

/**
 * A member who joined by name has added an email (Step 213): counted once,
 * on the invite they joined by. Anyone else's added email counts nothing.
 */
export function noteEmailAdded(userId: string): void {
  later(async () => {
    const { error } = await createAdminClient().rpc("note_invite_email_added", {
      p_user: userId,
    });
    if (error) console.error(`[invite-events] email added not noted — ${error.message}`);
  });
}
