import "server-only";

import type { TreeQueue } from "@/lib/admin-queue";
import { createClient } from "@/lib/supabase/server";

export type AdminActionItem = {
  /** Section id to reveal when the notification is clicked. */
  target: string;
  label: string;
  count: number;
};

/**
 * Things on the admin console that are waiting for a decision. Drives both the
 * "Needs attention" card on the console and the count badge on the header.
 * Soft signals (the own-tree register) are deliberately left out — this is the
 * queue, not the newsfeed.
 */
export function buildAdminActionItems(counts: {
  inviteRequests: number;
  disputedClaims: number;
  /** Requests to start a tree (Step 28) — a beta reviewer's only. */
  treeRequests?: number;
}): AdminActionItem[] {
  const items: AdminActionItem[] = [
    {
      target: "invite-requests",
      label: "requests for access",
      count: counts.inviteRequests,
    },
    {
      target: "disputes",
      label: "disputed claims",
      count: counts.disputedClaims,
    },
    {
      target: "tree-requests",
      label: "requests to start a tree",
      count: counts.treeRequests ?? 0,
    },
  ];
  return items.filter((i) => i.count > 0);
}

/**
 * Items waiting for an admin decision — cheap count-only queries for the
 * header badge, kept apart so the badge can open the card they're on (Step
 * 30.1). The own-tree register is a soft signal and left out of this count.
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
