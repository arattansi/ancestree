/**
 * What the weekly newsletter's links say about themselves (Step 225): every
 * link in it, but the unsubscribe one, is tagged `utm_campaign=newsletter`,
 * `utm_content=<the block it's in>` and `utm_term=<the issue's day>`, the same
 * for everyone. Google Analytics reads them as any campaign's; and a
 * signed-in member arriving by one is counted once for that issue and block
 * (`note_newsletter_click`, from the proxy). Pure, so it's tested without a
 * server.
 */
import { taggedUrl } from "@/lib/campaign-url";

export const NEWSLETTER_CAMPAIGN = "newsletter";

/**
 * The blocks of the email whose links are counted, in the order it draws
 * them: the birthday cards to sign, the unread messages, This Week, Later
 * This Month, a tree's news (who joined, who was added, new photos), a story,
 * the main button, "invite family", and the button that asks for a story in a
 * week with none.
 */
export const NEWSLETTER_SECTIONS = [
  "cards",
  "messages",
  "this-week",
  "later",
  "news",
  "story",
  "open",
  "invite",
  "write-a-story",
] as const;

export type NewsletterSection = (typeof NEWSLETTER_SECTIONS)[number];

/** How the analytics card names each block. */
export const SECTION_LABELS: Record<NewsletterSection, string> = {
  cards: "Birthday cards",
  messages: "Unread messages",
  "this-week": "This week",
  later: "Later this month",
  news: "Tree news",
  story: "Stories",
  open: "Open my family tree",
  invite: "Invite family",
  "write-a-story": "Write a story",
};

const ISSUE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` that is a real day: not `2026-02-31`. */
export function isIssueDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISSUE_DAY.test(value)) return false;
  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value;
}

export function isNewsletterSection(value: unknown): value is NewsletterSection {
  return (
    typeof value === "string" &&
    (NEWSLETTER_SECTIONS as readonly string[]).includes(value)
  );
}

/** `url`, tagged as a link of `section` in the issue sent on `issueDay`. */
export function newsletterLink(
  url: string,
  section: NewsletterSection,
  issueDay: string,
): string {
  return taggedUrl(url, NEWSLETTER_CAMPAIGN, section, issueDay);
}

/**
 * Which issue and block a request's query says it came from, or null for
 * any other request: the campaign must be the newsletter's, the block one
 * of ours, the term a real day.
 */
export function readNewsletterClick(
  params: URLSearchParams,
): { issueDay: string; section: NewsletterSection } | null {
  if (params.get("utm_campaign") !== NEWSLETTER_CAMPAIGN) return null;
  const section = params.get("utm_content");
  const issueDay = params.get("utm_term");
  if (!isNewsletterSection(section) || !isIssueDay(issueDay)) return null;
  return { issueDay, section };
}

/**
 * Whether a request is the router asking for a page's data ahead of a visit
 * or after one (a prefetch, a refresh), not a person arriving: a tagged
 * address reaches it too, and counts once, from the visit.
 */
export function isRouterRequest(request: {
  headers: Pick<Headers, "has">;
  params: URLSearchParams;
}): boolean {
  return (
    request.headers.has("rsc") ||
    request.headers.has("next-router-prefetch") ||
    request.params.has("_rsc")
  );
}
