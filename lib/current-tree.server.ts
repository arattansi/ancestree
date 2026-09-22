import "server-only";

import { cookies } from "next/headers";

/**
 * Which tree the member is looking at. Tree pages have plain URLs — `/tree`,
 * `/people/new` — so the tree they mean isn't in the address; it's this
 * cookie, set whenever they switch trees, join one, or found one. Pages
 * read it and fall back to the member's home tree when it's missing or
 * points somewhere they can no longer see.
 */
const COOKIE = "ancestree.tree";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** The tree id the browser last chose, if any. Safe in any server context. */
export async function readCurrentTreeId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

/** Remember a tree. Only from a server action or route handler. */
export async function setCurrentTreeCookie(treeId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, treeId, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Forget the chosen tree, e.g. once it's deleted. */
export async function clearCurrentTreeCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
