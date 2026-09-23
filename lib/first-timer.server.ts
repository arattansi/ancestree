import "server-only";

import {
  firstTimerStep,
  newestLiveInvite,
  type BoundInvite,
  type FirstTimerStep,
} from "@/lib/first-timer";
import { inviteHref } from "@/lib/sign-in-links";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What's waiting for someone signed in who isn't a member yet (Step 30.8;
 * the choice is `lib/first-timer.ts`). With the service role, since none of
 * these tables is readable without a member profile. Only ever called with
 * the signed-in account's own verified address (`verifiedEmail`), never one
 * typed in, and only what the page shows comes back: an invite's token, a
 * tree's name, whether they're on the waitlist. A failed read finds nothing.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/** Active, unarchived invites bound to `email`, newest first. */
async function boundInvites(admin: AdminClient, email: string): Promise<BoundInvite[]> {
  const { data } = await admin
    .from("invites")
    .select("token, created_at, expires_at")
    .eq("invited_email", email)
    .eq("status", "active")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map((invite) => ({
    token: invite.token,
    createdAt: invite.created_at,
    expiresAt: invite.expires_at,
  }));
}

/** The page of the invite waiting for this address, or `null`: for signing in. */
export async function waitingInviteHref(email: string): Promise<string | null> {
  const invite = newestLiveInvite(
    await boundInvites(createAdminClient(), email),
    new Date(),
  );
  return invite ? inviteHref(invite.token) : null;
}

/** Everything waiting for this address, for /join's pending state. */
export async function loadFirstTimerStep(email: string): Promise<FirstTimerStep> {
  const admin = createAdminClient();
  // An address has at most one request waiting (`invite_requests_pending_email_idx`)
  // and one place on the waitlist (`tree_requests_one_pending_email`).
  const [invites, { data: request }, { data: waitlist }] = await Promise.all([
    boundInvites(admin, email),
    admin
      .from("invite_requests")
      .select("trees(name)")
      .eq("email", email)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle(),
    admin
      .from("tree_requests")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .is("user_id", null)
      .limit(1)
      .maybeSingle(),
  ]);
  // A many-to-one embed that PostgREST may still hand back as an array.
  const tree = Array.isArray(request?.trees) ? request.trees[0] : request?.trees;
  return firstTimerStep({
    invites,
    requestedTree: tree?.name ?? null,
    waitlisted: Boolean(waitlist),
    now: new Date(),
  });
}
