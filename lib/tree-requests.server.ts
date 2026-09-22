import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { toTreeRequestStatus, type TreeRequestStatus } from "@/lib/tree-requests";

/** Where the signed-in member's ask to start a tree stands (Step 28). */
export async function getTreeRequestStatus(): Promise<TreeRequestStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_tree_request");
  if (error) return "none";
  return toTreeRequestStatus(data);
}

/** The signed-in member answers requests to start a tree (`private.beta_reviewers`). */
export const isBetaReviewer = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_beta_reviewer");
  return data === true;
});

export type TreeRequestItem = {
  id: string;
  /** A member's ask, or a sign-up from the waitlist on the home page. */
  kind: "member" | "waitlist";
  firstName: string;
  lastName: string;
  email: string;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  reviewedAt: string | null;
  /** Whether the approval email went; `null` until there is one. */
  emailSent: boolean | null;
  /**
   * A waitlist approval's founder invite is still out, unused. Joining
   * deletes the invite (`redeem_invite`), which clears this.
   */
  inviteOut: boolean;
};

const COLUMNS =
  "id, user_id, first_name, last_name, email, status, created_at, reviewed_at, email_sent, invite_id";
/** How many answered requests to keep showing under the open ones. */
const ANSWERED_LIMIT = 30;

/**
 * Every open request to start a tree, oldest first, then the most recently
 * answered. Reviewers only — for anyone else RLS would return their own ask,
 * which isn't a queue.
 */
export async function listTreeRequests(): Promise<TreeRequestItem[]> {
  if (!(await isBetaReviewer())) return [];
  const supabase = await createClient();
  const [open, answered] = await Promise.all([
    supabase
      .from("tree_requests")
      .select(COLUMNS)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("tree_requests")
      .select(COLUMNS)
      .neq("status", "pending")
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(ANSWERED_LIMIT),
  ]);

  return [...(open.data ?? []), ...(answered.data ?? [])].map((r) => ({
    id: r.id,
    kind: r.user_id ? "member" : "waitlist",
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    status:
      r.status === "approved" || r.status === "declined" ? r.status : "pending",
    createdAt: r.created_at,
    reviewedAt: r.reviewed_at,
    emailSent: r.email_sent,
    inviteOut: r.invite_id !== null,
  }));
}

/** Open requests to start a tree, for the header badge. Zero for anyone but a reviewer. */
export async function countPendingTreeRequests(): Promise<number> {
  if (!(await isBetaReviewer())) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("tree_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
