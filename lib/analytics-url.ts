/**
 * The address Google Analytics is told a page has (Step 197): the page's
 * own, with every secret in it taken out. Many of ancestree's links carry
 * one — an invite's token, a sign-in email's one-time `token_hash`, an
 * unsubscribe page's token — and Analytics would otherwise record each
 * page view's whole address, and the address before it, for anyone who can
 * see the property. Pure, for `components/google-analytics.tsx` and its
 * tests.
 */

/**
 * Pages whose address holds a token right after these segments, which
 * Analytics sees as `:token`. `shared/story` before `shared`.
 */
const TOKEN_ROUTES = [
  // An invite, a claim invite or a Root's family link (`inviteHref`).
  "join",
  // The newsletter's, the getting started emails' and the message emails'
  // unsubscribe pages (`lib/tree-links.ts`).
  "newsletter",
  "getting-started",
  "message-emails",
  // A story's public link (`storyLinkPath`), and a tree's share link.
  "shared/story",
  "shared",
  // A library subscription's page, and a story sent in (`lib/blog.ts`).
  "library/subscription",
  "library/submissions",
];

const TOKEN_PATH = new RegExp(`^/(${TOKEN_ROUTES.join("|")})/[^/]+`, "i");

/** What Analytics sees in a token's place. */
export const TOKEN_PLACEHOLDER = ":token";

/**
 * Query parameters that are secrets themselves, left out: a sign-in
 * email's one-time token, the invite a sign-in redeems, and the codes and
 * tokens Supabase's own redirects can carry.
 */
const SECRET_PARAMS = new Set([
  "token_hash",
  "token",
  "invite",
  "code",
  "access_token",
  "refresh_token",
]);

/** A query parameter holding one of our own addresses: where signing in lands. */
const ADDRESS_PARAMS = new Set(["next"]);

/** `pathname` with any token in it replaced by `:token`. */
export function redactedPath(pathname: string): string {
  return pathname.replace(TOKEN_PATH, `/$1/${TOKEN_PLACEHOLDER}`);
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

/**
 * `search` (with its `?`, or empty) without its secrets, and `next` read
 * as an address of its own. Every other parameter is kept as it was
 * written, `utm_*` tags and all.
 */
export function redactedSearch(search: string): string {
  const kept: string[] = [];
  for (const pair of search.replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = decoded(eq < 0 ? pair : pair.slice(0, eq));
    if (SECRET_PARAMS.has(key)) continue;
    if (ADDRESS_PARAMS.has(key) && eq >= 0) {
      const address = decoded(pair.slice(eq + 1));
      const value = redactedAddress(address);
      if (value !== address) {
        kept.push(`${pair.slice(0, eq)}=${encodeURIComponent(value)}`);
        continue;
      }
    }
    kept.push(pair);
  }
  return kept.length > 0 ? `?${kept.join("&")}` : "";
}

/** A path on this site, as `next` carries one: path and query, redacted. */
function redactedAddress(address: string): string {
  const hash = address.indexOf("#");
  const bare = hash < 0 ? address : address.slice(0, hash);
  const q = bare.indexOf("?");
  if (q < 0) return redactedPath(bare);
  return redactedPath(bare.slice(0, q)) + redactedSearch(bare.slice(q));
}

/**
 * A whole address — the page's, or the one before it — as Analytics may
 * see it: tokens in the path replaced, secret parameters left out, and no
 * fragment, which can hold a key (`/messages/link`) or a session's tokens.
 * Empty, or not an address, it's empty.
 */
export function redactedUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  return `${url.origin}${redactedPath(url.pathname)}${redactedSearch(url.search)}`;
}
