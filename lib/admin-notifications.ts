import "server-only";

import {
  QUEUE_SECTIONS,
  type QueueSection,
  type TreeQueue,
} from "@/lib/admin-queue";
import { createClient } from "@/lib/supabase/server";

export type AdminActionItem = {
  /** The console card to open when it's pressed. */
  target: QueueSection;
  label: string;
  count: number;
};

/** What each queue is called in the console's "Needs attention" card. */
const QUEUE_LABELS: Record<QueueSection, string> = {
  "invite-requests": "requests for access",
  disputes: "disputed claims",
  "tree-requests": "requests to start a tree",
};

/**
 * What waits for a decision on the Root console, for its "Needs attention"
 * card, in the order the queue is worked (`QUEUE_SECTIONS`). The header's
 * count is `countAdminQueue` and `pickQueueTarget`.
 */
export function buildAdminActionItems(counts: {
  inviteRequests: number;
  disputedClaims: number;
  /** Requests to start a tree (Step 28) — a beta reviewer's only. */
  treeRequests?: number;
}): AdminActionItem[] {
  const waiting: Record<QueueSection, number> = {
    "invite-requests": counts.inviteRequests,
    disputes: counts.disputedClaims,
    "tree-requests": counts.treeRequests ?? 0,
  };
  return QUEUE_SECTIONS.map((target) => ({
    target,
    label: QUEUE_LABELS[target],
    count: waiting[target],
  })).filter((item) => item.count > 0);
}

/**
 * Items waiting for a Root's decision — cheap count-only queries for the
 * header badge, kept apart so the badge can open the card they're on (Step
 * 30.1).
 */
export async function countAdminQueue(treeId: string): Promise<TreeQueue> {
  const supabase = await createClient();
  const [reqs, disputes] = await Promise.all([
    supabase
      .from("invite_requests")
      .select("id", { count: "exact", head: true })
      .eq("tree_id", treeId)
      .eq("status", "pending"),
    // Disputes are per entry; the ones for this tree are on its people.
    supabase
      .from("claims")
      .select("id, people!inner(tree_id)", { count: "exact", head: true })
      .eq("status", "disputed")
      .eq("people.tree_id", treeId),
  ]);
  return {
    treeId,
    inviteRequests: reqs.count ?? 0,
    disputedClaims: disputes.count ?? 0,
  };
}
