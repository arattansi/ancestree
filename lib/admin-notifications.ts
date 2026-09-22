import "server-only";

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
  ];
  return items.filter((i) => i.count > 0);
}

/**
 * Items waiting for an admin decision — cheap count-only query for the header
 * badge. The own-tree register is a soft signal and left out of this count.
 */
export async function countAdminActionItems(treeId: string): Promise<number> {
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
  return (reqs.count ?? 0) + (disputes.count ?? 0);
}
