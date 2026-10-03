/**
 * The cookie that remembers which tree the browser picked (Step 92.5), and
 * how long a pick lasts. Shared by the server's setters
 * (`lib/current-tree.server.ts`) and the proxy, which keeps a pick alive
 * while the member is using the site.
 *
 * A pick lasts until two hours pass without a visit, then the member is back
 * on My Family Tree. It used to be a session cookie, "until the browser
 * closes", but a browser that restores its tabs keeps session cookies, so a
 * pick could outlive the visit by days.
 */
export const CURRENT_TREE_COOKIE = "ancestree.tree";

/** How long a pick lasts without a visit. */
export const PICK_IDLE_SECONDS = 2 * 60 * 60;

/** A tree id, as the cookie holds it; anything else is ignored. */
export function isTreeIdCookie(value: string | undefined): value is string {
  return !!value && /^[0-9a-f-]{36}$/i.test(value);
}

export function currentTreeCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: PICK_IDLE_SECONDS,
  };
}

/**
 * Whether the proxy may renew the pick on this request: a page or data GET
 * only. Server actions (POSTs) and the two GET routes that set the cookie
 * themselves (a story link, an alert's console button) are left alone, so a
 * renewal of the old pick can never undo their switch.
 */
export function renewsPick(method: string, pathname: string): boolean {
  if (method !== "GET") return false;
  if (pathname.startsWith("/stories/")) return false;
  return pathname !== "/account/admin";
}
