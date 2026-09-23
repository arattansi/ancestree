/**
 * Where someone goes once they've signed in: a path on this site, carried
 * as `next` from the page that sent them to sign in, through the sign-in
 * email and back (Step 30.1) — so a Root who opens an alert email's button
 * while signed out still lands on the request. Anyone can type a `next`
 * into an address bar, so only a plain same-origin path is taken; anything
 * else falls back to the canvas.
 */

/** Where signing in lands when there's nowhere better to go. */
export const DEFAULT_NEXT = "/tree";

/** Longer than any address the app makes. */
const MAX_NEXT_LENGTH = 2048;
/** Resolves a path without trusting it to stay on this origin. */
const BASE = "http://next.invalid";

/**
 * `raw` as a path on this site — path, query and fragment — or `null` when
 * it could take the browser anywhere else. A second slash or a backslash
 * after the first makes a protocol-relative address (`//evil.example`;
 * browsers read `\` as `/`), and URL parsers drop tabs and newlines, so
 * those are refused before the resolved origin is checked.
 */
export function sameOriginPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) {
    return null;
  }
  if (raw[0] !== "/" || raw[1] === "/" || raw.includes("\\")) return null;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Only allow same-origin relative redirect targets. */
export function safeNext(next: string | null | undefined): string {
  return sameOriginPath(next) ?? DEFAULT_NEXT;
}

/**
 * The `next` to carry when someone signed out opens a members' page
 * (proxy.ts): where they were going, when that's somewhere other than
 * where signing in lands anyway. The router's own `_rsc` marker is never
 * part of an address to come back to.
 */
export function signInNext(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  params.delete("_rsc");
  const query = params.toString();
  const path = sameOriginPath(query ? `${pathname}?${query}` : pathname);
  return path && path !== DEFAULT_NEXT ? path : null;
}
