/**
 * The approver's queue (Step 30.1): the admin console's cards that wait on
 * a decision, and the two ways into them from outside the console — the
 * header's count, and the button in an alert email. Kept pure, so the
 * header, the emails and the route that opens the console agree on where
 * each one lands.
 */

import { plural } from "@/lib/plural";

/** The console cards that hold a queue, in the order they're worked. */
export const QUEUE_SECTIONS = ["invite-requests", "reports"] as const;

export type QueueSection = (typeof QUEUE_SECTIONS)[number];

export function isQueueSection(raw: unknown): raw is QueueSection {
  return (
    typeof raw === "string" && (QUEUE_SECTIONS as readonly string[]).includes(raw)
  );
}

/** The route an alert email's button opens (`app/account/admin/route.ts`). */
export const OPEN_CONSOLE_PATH = "/account/admin";

/**
 * An alert email's button: the admin console at `section` — of `treeId`,
 * when the alert is about one tree. A route rather than the console's own
 * address because only a route can switch the tree the browser is looking
 * at, and a fragment never reaches the server. Callers add the site's
 * origin (`getSiteUrl()`). With no `section`, the console opens at its top
 * (a founder sent to the tree they started, Step 61).
 */
export function openConsoleHref(
  section: QueueSection | null,
  treeId?: string | null,
): string {
  const params = new URLSearchParams();
  if (treeId) params.set("tree", treeId);
  if (section) params.set("section", section);
  return `${OPEN_CONSOLE_PATH}?${params}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What `openConsoleHref` put in the address; anything else is dropped. */
export function readOpenConsole(params: URLSearchParams): {
  treeId: string | null;
  section: QueueSection | null;
} {
  const tree = params.get("tree");
  const section = params.get("section");
  return {
    treeId: tree && UUID.test(tree) ? tree.toLowerCase() : null,
    section: isQueueSection(section) ? section : null,
  };
}

/** What waits on one tree an approver runs. */
export type TreeQueue = {
  treeId: string;
  inviteRequests: number;
  /** Open reports on its own entries, disputed claims among them (Step 88.2). */
  reports: number;
};

export type QueueTarget = { treeId: string; section: QueueSection };

/**
 * Where the header's count takes an approver: the tree they're looking at,
 * when anything waits there; else the first tree they run with something
 * waiting. On that tree, requests for access first, then reports. `null`
 * when nothing waits. (Requests to start a tree are the admin page's,
 * Step 103: the header's **admin** counts them.)
 */
export function pickQueueTarget({
  trees,
  currentTreeId,
}: {
  /** The trees they run, in the order the header lists them. */
  trees: readonly TreeQueue[];
  currentTreeId: string | null;
}): QueueTarget | null {
  const waiting = (q: TreeQueue) => q.inviteRequests + q.reports > 0;
  const current = trees.find((q) => q.treeId === currentTreeId);
  const tree =
    (current && waiting(current) ? current : undefined) ?? trees.find(waiting);
  if (!tree) return null;
  const section: QueueSection =
    tree.inviteRequests > 0 ? "invite-requests" : "reports";
  return { treeId: tree.treeId, section };
}

/** What the header's count says to a screen reader, and on hover. */
export function queueCountLabel(count: number): string {
  return `${count} ${plural(count, "needs", "need")} attention in the Root console`;
}
