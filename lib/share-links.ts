import type { Tables } from "@/lib/database.types";

export type ShareLink = Tables<"share_links">;

/** The subset of a share link that decides whether it still grants access. */
export type ShareLinkStatusFields = Pick<
  ShareLink,
  "revoked_at" | "expires_at"
>;

/**
 * A share link is usable when it has not been revoked and has not passed its
 * optional expiry. `now` is injectable for tests.
 */
export function isShareLinkUsable(
  link: ShareLinkStatusFields,
  now: Date = new Date(),
): boolean {
  if (link.revoked_at) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

export type ShareLinkState = "active" | "revoked" | "expired";

export function shareLinkState(
  link: ShareLinkStatusFields,
  now: Date = new Date(),
): ShareLinkState {
  if (link.revoked_at) return "revoked";
  if (link.expires_at && new Date(link.expires_at).getTime() <= now.getTime()) {
    return "expired";
  }
  return "active";
}
