/**
 * The analytics tab's newsletter (Step 225): each weekly issue by the day it
 * went out, how many were sent, how many members arrived from one of its
 * links (once each, however many they opened) and how many by block. This
 * reads what `newsletter_engagement()` answers and words it, so it's tested
 * without a database; `newsletter-engagement.server.ts` loads it and
 * `components/dashboard/newsletter-clicks.tsx` draws it.
 */
import {
  isIssueDay,
  isNewsletterSection,
  NEWSLETTER_SECTIONS,
  SECTION_LABELS,
  type NewsletterSection,
} from "@/lib/newsletter-clicks";

export type NewsletterIssueRow = {
  /** The day it went out, `YYYY-MM-DD`. */
  day: string;
  sent: number;
  /** Members who arrived from a link of it. */
  clicked: number;
  /** Members who arrived from a link in each block of it. */
  bySection: Partial<Record<NewsletterSection, number>>;
  /** Copies with a pixel, the members who said yes to counting opens
   *  (Step 226), and how many of those were opened. */
  counting: number;
  opened: number;
};

export type NewsletterEngagement = {
  /** The first issue counted, or null before there was one. */
  countedFrom: string | null;
  /** Newest first. */
  issues: NewsletterIssueRow[];
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** What `newsletter_engagement()` answered, or null when it isn't that. */
export function readNewsletterEngagement(data: unknown): NewsletterEngagement | null {
  const root = fields(data);
  if (!Array.isArray(root.issues)) return null;
  const issues: NewsletterIssueRow[] = [];
  for (const raw of root.issues) {
    const row = fields(raw);
    if (!isIssueDay(row.day)) continue;
    const bySection: NewsletterIssueRow["bySection"] = {};
    for (const [section, n] of Object.entries(fields(row.by_section))) {
      if (isNewsletterSection(section) && count(n)) bySection[section] = count(n);
    }
    issues.push({
      day: row.day,
      sent: count(row.sent),
      clicked: count(row.clicked),
      bySection,
      counting: count(row.counting),
      opened: count(row.opened),
    });
  }
  return {
    countedFrom: isIssueDay(root.counted_from) ? root.counted_from : null,
    issues,
  };
}

/** "38%" of those sent who arrived from a link, or "–" before any were sent. */
export function clickedShare(row: Pick<NewsletterIssueRow, "sent" | "clicked">): string {
  if (row.sent <= 0) return "–";
  return `${Math.round((Math.min(row.clicked, row.sent) / row.sent) * 100)}%`;
}

/**
 * "60%" of the copies counting that were opened, or "–" when none was
 * counting. Opens read high: Apple Mail loads the image on arrival.
 */
export function openedShare(row: Pick<NewsletterIssueRow, "counting" | "opened">): string {
  if (row.counting <= 0) return "–";
  return `${Math.round((Math.min(row.opened, row.counting) / row.counting) * 100)}%`;
}

export type SectionTotal = { section: NewsletterSection; label: string; members: number };

/**
 * Each block's members over the issues shown, the most first (ties in the
 * order the email draws them), leaving out any nobody arrived from.
 */
export function sectionTotals(issues: readonly NewsletterIssueRow[]): SectionTotal[] {
  return NEWSLETTER_SECTIONS.map((section) => ({
    section,
    label: SECTION_LABELS[section],
    members: issues.reduce((sum, i) => sum + (i.bySection[section] ?? 0), 0),
  }))
    .filter((t) => t.members > 0)
    .sort((a, b) => b.members - a.members);
}
