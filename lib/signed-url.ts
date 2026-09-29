/**
 * Photo addresses that last across saves (Step 87.1, audit C2). Every
 * server render signs each photo afresh (`PHOTO_URL_TTL_S`, an hour), so
 * after a save every card had a new address: it fell back to initials and
 * downloaded its photo again. The browser keeps the first address it was
 * given for a photo and reuses it until it's close to running out.
 *
 * Keyed on the address without its query, not on the stored path: a share
 * link never sends the path. A new photo is a new file (`photoPath`), so
 * its address differs before the query too.
 */

/** Signed again this long before the kept address would stop working. */
export const RESIGN_WITHIN_MS = 10 * 60 * 1000;

function decodeBase64Url(part: string): string {
  const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}

/**
 * When a storage-signed address stops working, in ms since the epoch, read
 * from its token's `exp` (no secret needed to read it), or `null` when the
 * address carries no token that says.
 */
export function signedUrlExpiry(url: string): number | null {
  const query = url.indexOf("?");
  if (query < 0) return null;
  const token = new URLSearchParams(url.slice(query + 1)).get("token");
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const { exp } = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * The address to show for `url`: the one kept for the same photo while it
 * still has more than `RESIGN_WITHIN_MS` to run, else `url`, which is kept
 * from then on. An address with no expiry to read is shown as it comes and
 * never kept.
 */
export function keepSignedUrl(
  kept: Map<string, string>,
  url: string,
  now: number,
): string {
  const query = url.indexOf("?");
  if (query < 0) return url;
  const key = url.slice(0, query);
  const old = kept.get(key);
  if (old !== undefined && old !== url) {
    const expires = signedUrlExpiry(old);
    if (expires !== null && expires - now > RESIGN_WITHIN_MS) return old;
  }
  if (signedUrlExpiry(url) !== null) kept.set(key, url);
  else kept.delete(key);
  return url;
}

// One for the tab, so going back to the tree from another page reuses them
// too. Never on the server, where it would be shared between requests.
const keptPhotos = new Map<string, string>();

/** `keepSignedUrl` against the tab's own photo addresses. */
export function keptPhotoUrl(url: string | null): string | null {
  if (url === null || typeof window === "undefined") return url;
  return keepSignedUrl(keptPhotos, url, Date.now());
}
