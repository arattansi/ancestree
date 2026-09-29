/**
 * The header's counts (Step 77.2): what its badges show, drawn with the
 * page and asked for again as someone moves around, so they don't go stale
 * between saves (audit S4, N7).
 */
export type HeaderCounts = {
  /** Unread notifications, all of them. */
  unread: number;
  /** When the newest unread one arrived, in ms (0 for none). */
  latestUnreadAt: number;
  /** Open connection suggestions on the tree being looked at. */
  connections: number;
  /** The tree being looked at, when they're a member of it. */
  currentTreeId: string | null;
  /** What waits in the admin consoles they run, and where it opens. */
  admin: {
    count: number;
    treeId: string;
    href: string;
    label: string;
  } | null;
};

/** How long counts stay fresh before moving on or coming back asks again. */
export const COUNTS_FRESH_MS = 30_000;

/** Whether counts read at `readAt` are due to be asked for again. */
export function countsStale(readAt: number, now: number): boolean {
  return now - readAt >= COUNTS_FRESH_MS;
}

/**
 * What the bell's badge says: every unread notification, unless the newest
 * of them arrived before they last looked (opened the bell, or read a list
 * that marked them read). Zero hides it.
 */
export function unreadShown(
  counts: Pick<HeaderCounts, "unread" | "latestUnreadAt">,
  seenUpTo: number,
): number {
  return counts.latestUnreadAt > seenUpTo ? counts.unread : 0;
}

/** Counts from the server, or `null` for anything that isn't them. */
export function parseHeaderCounts(value: unknown): HeaderCounts | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const unread = num(v.unread);
  const latestUnreadAt = num(v.latestUnreadAt);
  const connections = num(v.connections);
  if (unread === null || latestUnreadAt === null || connections === null) return null;
  const currentTreeId =
    typeof v.currentTreeId === "string" ? v.currentTreeId : null;
  const a = v.admin as Record<string, unknown> | null | undefined;
  const admin =
    a &&
    num(a.count) !== null &&
    typeof a.treeId === "string" &&
    typeof a.href === "string" &&
    typeof a.label === "string"
      ? { count: a.count as number, treeId: a.treeId, href: a.href, label: a.label }
      : null;
  return { unread, latestUnreadAt, connections, currentTreeId, admin };
}
