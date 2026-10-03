import "server-only";

import { cookies } from "next/headers";

import {
  CURRENT_TREE_COOKIE,
  currentTreeCookieOptions,
  isTreeIdCookie,
} from "@/lib/current-tree-cookie";

/**
 * Which tree the member is looking at. Tree pages have plain URLs — `/tree`,
 * `/people/new` — so the tree they mean isn't in the address; it's this
 * cookie, set whenever they switch trees, join one, or found one. Pages
 * read it and fall back to the member's home tree when it's missing or
 * points somewhere they can no longer see.
 *
 * A switch holds while they're using the site, until two hours pass without
 * a visit (`lib/current-tree-cookie.ts`; the proxy renews it), and then they
 * land on My Family Tree again (Step 92.5).
 */

/** The tree id the browser last chose, if any. Safe in any server context. */
export async function readCurrentTreeId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CURRENT_TREE_COOKIE)?.value;
  return isTreeIdCookie(value) ? value : null;
}

/**
 * Remember a tree for as long as they keep using the site. Only from a
 * server action or route handler.
 */
export async function setCurrentTreeCookie(treeId: string): Promise<void> {
  const store = await cookies();
  store.set(CURRENT_TREE_COOKIE, treeId, currentTreeCookieOptions());
}

/** Forget the chosen tree, e.g. once it's deleted. */
export async function clearCurrentTreeCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CURRENT_TREE_COOKIE);
}
