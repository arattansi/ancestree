/**
 * Asking to start a tree during the beta (Step 28). A member's ask is
 * answered by a reviewer (`private.beta_reviewers`); until then starting a
 * tree is closed to them, the database included (`found_tree`).
 */

/**
 * Where a member's ask stands, as `my_tree_request()` reports it: they
 * founded a tree already (one each), they may start one, they've asked and
 * are waiting, or they haven't asked.
 */
export type TreeRequestStatus = "none" | "pending" | "approved" | "founded";

/** Anything the database didn't say plainly is taken as not having asked. */
export function toTreeRequestStatus(raw: unknown): TreeRequestStatus {
  return raw === "pending" || raw === "approved" || raw === "founded"
    ? raw
    : "none";
}

/** What an ask says once it's in, signed in or out. */
export const TREE_REQUEST_RECEIVED =
  "Your request has been received. We’ll notify you when you can start building a new tree.";

/** The same, for someone on the waitlist, who hears by email. */
export function waitlistReceived(email: string): string {
  return `Your request has been received. We’ll email you at ${email} when you can start building a new tree.`;
}
