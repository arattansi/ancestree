/**
 * Someone signed in who isn't a member yet (Step 30.8): they've just
 * verified an address, and no invite has made them a member. What signing
 * in does for them, in this order: open the invite emailed to that address;
 * else say where their request to join stands; else offer request access
 * with the address filled in. It's their own verified address, so nothing
 * found for it tells anyone anything about someone else. Pure, so the
 * choice is tested; the rows come from `lib/first-timer.server.ts`.
 */

import { inviteHref } from "@/lib/sign-in-links";

/**
 * An invite bound to their address (`invites.invited_email`), still active
 * and unarchived. Whether it has run out is checked here.
 */
export type BoundInvite = {
  token: string;
  createdAt: string;
  expiresAt: string | null;
};

export type FirstTimerStep =
  /**
   * An invite is waiting: its own page. It isn't redeemed on the spot,
   * because its accept form asks for the privacy agreement and a plain
   * sign-in no longer does (Step 30.4).
   */
  | { kind: "invite"; href: string }
  /** They've asked to join a tree, and its Roots haven't answered yet. */
  | { kind: "requested"; treeName: string }
  /**
   * Nothing waiting: request access, with the address they verified.
   * `waitlisted` when they're already on the waitlist to start a tree.
   */
  | { kind: "ask"; waitlisted: boolean };

/**
 * The signed-in account's address, lower-cased, once it has been verified;
 * `null` before then. Invites, requests and the waitlist all keep their
 * addresses lower-cased, so this is what they're looked up by.
 */
export function verifiedEmail(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
}): string | null {
  const email = user.email?.trim().toLowerCase();
  return email && user.email_confirmed_at ? email : null;
}

/**
 * The newest invite that hasn't run out, judged as `invite_preview` judges
 * it (no expiry never runs out), or `null` when none is left.
 */
export function newestLiveInvite(
  invites: readonly BoundInvite[],
  now: Date,
): BoundInvite | null {
  let newest: BoundInvite | null = null;
  for (const invite of invites) {
    if (invite.expiresAt && new Date(invite.expiresAt) <= now) continue;
    if (!newest || new Date(invite.createdAt) > new Date(newest.createdAt)) {
      newest = invite;
    }
  }
  return newest;
}

/** What signing in does for them; the order is at the top of this file. */
export function firstTimerStep({
  invites,
  requestedTree,
  waitlisted,
  now,
}: {
  invites: readonly BoundInvite[];
  /** The tree their pending request to join waits on, when they have one. */
  requestedTree: string | null;
  waitlisted: boolean;
  now: Date;
}): FirstTimerStep {
  const invite = newestLiveInvite(invites, now);
  if (invite) return { kind: "invite", href: inviteHref(invite.token) };
  if (requestedTree !== null) return { kind: "requested", treeName: requestedTree };
  return { kind: "ask", waitlisted };
}
