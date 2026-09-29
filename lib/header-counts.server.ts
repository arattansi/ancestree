import "server-only";

import { countAdminQueue } from "@/lib/admin-notifications";
import { pickQueueTarget, queueCountLabel } from "@/lib/admin-queue";
import { getProfile, type Profile } from "@/lib/auth";
import { countUnreadNotifications } from "@/lib/claims";
import { countOpenConnectionSuggestions } from "@/lib/connection-suggestions.server";
import type { HeaderCounts } from "@/lib/header-counts";
import {
  currentAccess,
  listMyTrees,
  type MyTree,
  type TreeAccess,
} from "@/lib/tree-context";
import { adminHref } from "@/lib/tree-links";
import { countPendingTreeRequests } from "@/lib/tree-requests.server";

/**
 * The header's counts for a signed-in member (Step 77.2): counts only, one
 * wave. The bell's list is read when it's opened (`/api/notifications`).
 */
export async function headerCounts({
  profile,
  trees,
  access,
}: {
  profile: Profile;
  trees: MyTree[];
  access: TreeAccess | null;
}): Promise<HeaderCounts> {
  const currentTreeId =
    access?.kind === "member" ? access.membership.tree.id : null;
  const runs = trees.filter((t) => t.type.runsTree);
  const [unread, connections, queues, treeRequests] = await Promise.all([
    countUnreadNotifications(profile.auth_user_id),
    // The same audit the canvas reads, once per request between them.
    currentTreeId ? countOpenConnectionSuggestions(currentTreeId) : 0,
    Promise.all(runs.map((t) => countAdminQueue(t.id))),
    // A beta reviewer answers from an admin console, so has a tree to run.
    runs.length > 0 ? countPendingTreeRequests() : 0,
  ]);
  const count =
    queues.reduce((sum, q) => sum + q.inviteRequests + q.disputedClaims, 0) +
    treeRequests;
  // One tap from the count to what's waiting, on whichever tree it's on.
  const queue = pickQueueTarget({ trees: queues, treeRequests, currentTreeId });
  return {
    unread: unread.count,
    latestUnreadAt: unread.latestAt,
    connections,
    admin: queue
      ? {
          count,
          treeId: queue.treeId,
          href: adminHref(queue.section),
          label: queueCountLabel(count),
        }
      : null,
  };
}

/** The header's counts for whoever is signed in, or `null` for nobody. */
export async function loadHeaderCounts(): Promise<HeaderCounts | null> {
  const [profile, trees, access] = await Promise.all([
    getProfile(),
    listMyTrees(),
    currentAccess(),
  ]);
  return profile ? headerCounts({ profile, trees, access }) : null;
}
