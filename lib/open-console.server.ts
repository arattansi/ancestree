import "server-only";

import { OPEN_CONSOLE_PATH, readOpenConsole } from "@/lib/admin-queue";
import { setCurrentTreeCookie } from "@/lib/current-tree.server";
import { rootOf } from "@/lib/tree-context";
import { adminHref } from "@/lib/tree-links";

/**
 * Open the admin console an alert email's button names (Step 30.1): make
 * its tree the one the browser is looking at — if the signed-in member is
 * a Root of it — and say where the waiting card is. Anyone else gets
 * whichever console the account page would open, if any. Only from a route
 * handler or server action, since it writes a cookie.
 */
export async function openConsole(params: URLSearchParams): Promise<string> {
  const { treeId, section } = readOpenConsole(params);
  if (treeId) {
    const { membership } = await rootOf(treeId);
    if (membership) await setCurrentTreeCookie(membership.tree.id);
  }
  return adminHref(section ?? undefined);
}

/**
 * Where a sign-in lands: `next`, except that a console button's route is
 * opened here and now. The sign-in button is a server action, and a server
 * action's redirect to a route handler is followed on the server — the
 * tree it switched to would never reach the browser, and the card's
 * `#fragment` would be lost on the way.
 */
export async function signInLanding(next: string): Promise<string> {
  const url = new URL(next, "http://landing.invalid");
  return url.pathname === OPEN_CONSOLE_PATH ? openConsole(url.searchParams) : next;
}
