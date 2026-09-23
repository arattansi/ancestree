/**
 * The approver's queue (Step 30.1): the admin console's cards that wait on
 * a decision, and the two ways into them from outside the console — the
 * header's count, and the button in an alert email. Kept pure, so the
 * header, the emails and the route that opens the console agree on where
 * each one lands.
 */

/** The console cards that hold a queue, in the order they're worked. */
export const QUEUE_SECTIONS = [
  "invite-requests",
  "disputes",
  "tree-requests",
] as const;

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
 * origin (`getSiteUrl()`).
 */
export function openConsoleHref(
  section: QueueSection,
  treeId?: string | null,
): string {
  const params = new URLSearchParams();
  if (treeId) params.set("tree", treeId);
  params.set("section", section);
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
  disputedClaims: number;
};

export type QueueTarget = { treeId: string; section: QueueSection };

/**
 * Where the header's count takes an approver: the tree they're looking at,
 * when anything waits there; else the first tree they run with something
 * waiting. On that tree, requests for access first, then disputes, then
 * requests to start a tree — a beta reviewer's, the same on every console
 * they run. `null` when nothing waits.
 */
export function pickQueueTarget({
  trees,
  treeRequests,
  currentTreeId,
}: {
  /** The trees they run, in the order the header lists them. */
  trees: readonly TreeQueue[];
  treeRequests: number;
  currentTreeId: string | null;
}): QueueTarget | null {
  const own = (q: TreeQueue) => q.inviteRequests + q.disputedClaims;
  const current = trees.find((q) => q.treeId === currentTreeId);
  const tree =
    (current && own(current) + treeRequests > 0 ? current : undefined) ??
    trees.find((q) => own(q) > 0) ??
    (treeRequests > 0 ? (current ?? trees[0]) : undefined);
  if (!tree) return null;
  const section: QueueSection =
    tree.inviteRequests > 0
      ? "invite-requests"
      : tree.disputedClaims > 0
        ? "disputes"
        : "tree-requests";
  return { treeId: tree.treeId, section };
}

/** What the header's count says to a screen reader, and on hover. */
export function queueCountLabel(count: number): string {
  return `${count} ${count === 1 ? "needs" : "need"} attention in admin`;
}
