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

// What fetches a link with no person behind it: the services that draw a
// link's preview when it's pasted or sent, and headless browsers. iMessage
// sends a Safari user agent ending "facebookexternalhit/1.1 Facebot
// Twitterbot/1.0". A URL is a crawler's calling card (Googlebot's
// "+http://www.google.com/bot.html"); no browser puts one in its user agent.
const NOT_A_PERSON =
  /facebookexternalhit|facebot|twitterbot|whatsapp|slackbot|slack-imgproxy|telegrambot|discordbot|skypeuripreview|linkedinbot|headlesschrome|https?:\/\//i;

/**
 * Whether opening a share link counts as a view (Step 33.7): only a
 * browser's visit does. A link preview still gets the page, since it needs
 * the title, but it isn't anyone looking at the tree.
 */
export function countsAsView(userAgent: string | null): boolean {
  // Every current browser's user agent starts "Mozilla/"; curl's, WhatsApp's
  // and Slack's don't.
  if (!userAgent?.startsWith("Mozilla/")) return false;
  return !NOT_A_PERSON.test(userAgent);
}

/**
 * The user agent a request for a share link's page counts a view by
 * (`countsAsView`), or `null` when it isn't anyone opening the link. Asking
 * to join from the page's dialog (Step 41.4) runs a server action, and an
 * action that revalidates — `requestInvite` does, for someone signed in —
 * gets the page it was sent from rendered again in its reply; Next marks
 * that request with a `Next-Action` header.
 */
export function viewerUserAgent(headers: Pick<Headers, "get">): string | null {
  if (headers.get("next-action")) return null;
  return headers.get("user-agent");
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
