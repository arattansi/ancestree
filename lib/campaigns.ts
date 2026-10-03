/**
 * Invite-link campaigns (Step 103.3): open links a beta reviewer posts
 * somewhere — a social profile, a newsletter, a talk — through which anyone
 * can sign up and start a tree at once, no approval. Each counts its opens,
 * sign-ups and trees founded, and can be paused. Pure, for the admin page,
 * the link's own page and their tests.
 */

/** As `campaigns_name_check` holds it. */
export const CAMPAIGN_NAME_MAX = 80;
/** As `campaigns_placement_check` holds it. */
export const CAMPAIGN_PLACEMENT_MAX = 500;

export type Campaign = {
  id: string;
  code: string;
  name: string;
  /** Where the link is posted. */
  placement: string | null;
  opens: number;
  signups: number;
  treesFounded: number;
  paused: boolean;
  createdAt: string;
};

/**
 * The home page's own link (Step 119): "start a tree" for anyone signed
 * out, there and in join a tree. Made by migration
 * `20261003160000_anyone_starts_a_tree`; paused on /admin, it closes
 * sign-ups from the home page.
 */
export const HOME_CAMPAIGN_CODE = "df9590fa4260";

/** The link's own page, where people sign up through it. */
export function campaignHref(code: string): string {
  return `/start/${encodeURIComponent(code)}`;
}

/** A campaign's link code, as the database makes them: 12 hex digits. */
export function isCampaignCode(code: string): boolean {
  return /^[0-9a-f]{12}$/.test(code);
}

export type CampaignFields =
  | { ok: true; name: string; placement: string | null }
  | { ok: false; error: string };

/** A campaign's name and where it's posted, as typed, checked and trimmed. */
export function readCampaignFields(
  name: unknown,
  placement: unknown,
): CampaignFields {
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  const p = typeof placement === "string" ? placement.trim() : "";
  if (!n) return { ok: false, error: "Name the link." };
  if (n.length > CAMPAIGN_NAME_MAX) {
    return { ok: false, error: `Keep the name under ${CAMPAIGN_NAME_MAX} characters.` };
  }
  if (p.length > CAMPAIGN_PLACEMENT_MAX) {
    return {
      ok: false,
      error: `Keep where it's posted under ${CAMPAIGN_PLACEMENT_MAX} characters.`,
    };
  }
  return { ok: true, name: n, placement: p || null };
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "12 opens · 3 sign-ups · 3 trees" */
export function campaignCounts(c: Pick<Campaign, "opens" | "signups" | "treesFounded">): string {
  return [
    plural(c.opens, "open", "opens"),
    plural(c.signups, "sign-up", "sign-ups"),
    plural(c.treesFounded, "tree", "trees"),
  ].join(" · ");
}

/**
 * Link-preview fetchers and crawlers, which open a link as it's posted or
 * shared and would count as opens: a chat app drawing its card, a search
 * engine. Only what says so in its user agent; the apps' own in-app
 * browsers ("LinkedInApp", "Twitter for iPhone") are people, and count.
 */
const CRAWLER =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|whatsapp\/|embedly|vkshare|headless|lighthouse|curl\/|wget\//i;

/**
 * Whether opening the page counts as an open: not a crawler or a link
 * preview, and not a browser's prefetch (`Sec-Purpose` / `Purpose`).
 */
export function countsAsOpen(headers: {
  userAgent: string | null;
  purpose: string | null;
}): boolean {
  if (headers.purpose && /prefetch|prerender/i.test(headers.purpose)) return false;
  const ua = headers.userAgent?.trim();
  if (!ua) return false;
  return !CRAWLER.test(ua);
}
