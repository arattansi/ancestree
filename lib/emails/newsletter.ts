import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";
import {
  addedCount,
  type Issue,
  type IssueAdded,
  type IssueName,
  type IssueOccasion,
} from "@/lib/newsletter";
import { occasionDay, ordinal } from "@/lib/occasions";

/** Names a sentence lists before "and 12 more". */
export const NAMES_SHOWN = 6;

/** Plain text, so a real apostrophe. */
export const NEWSLETTER_SUBJECT = "Your family this week";

const TEXT = "font-size:15px;line-height:1.6;color:#0a0a0a;";
const LINK = "color:#0a0a0a;text-decoration:underline;";
const HEADING =
  "margin:28px 0 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#737373;";

/**
 * The weekly newsletter (Step 95), from what `weeklyIssue` found: This
 * Week and, past it, the round birthdays and anniversaries still to come
 * this month, then a section per tree that had news. Every name links
 * to its card on My Family Tree, where everyone in it is (`personUrl`); the
 * button opens the view. Names are the only thing a story or a photo
 * gives away, never its words or the picture.
 */
export function newsletterEmail(input: {
  issue: Issue;
  /** Their card on My Family Tree, on the site's origin. */
  personUrl: (personId: string) => string;
  /** My Family Tree, on the site's origin. */
  familyUrl: string;
  /** The page that turns it off, on the site's origin. */
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const { issue, personUrl } = input;
  const link = (n: IssueName) =>
    `<a href="${escapeHtml(personUrl(n.id))}" style="${LINK}">${escapeHtml(oneLine(n.name))}</a>`;

  // What's coming up first (Aalim, 2026-10-01), then each tree's news.
  const sections: string[] = [];
  if (issue.week.length) {
    sections.push(`<p style="${HEADING}">This Week</p>${occasionRows(issue.week, link)}`);
  }
  if (issue.later.length) {
    sections.push(
      `<p style="${HEADING}">Later This Month</p>${occasionRows(issue.later, link)}`,
    );
  }
  for (const tree of issue.trees) {
    const lines = [
      ...(tree.joined.length ? [`${list(tree.joined, link)} joined.`] : []),
      ...tree.added.map((g) => addedLine(g, link)),
      ...(tree.stories.length
        ? [
            `${tree.stories.length === 1 ? "A new story" : "New stories"} about ${list(tree.stories, link)}.`,
          ]
        : []),
      ...(tree.photos.length
        ? [
            `${tree.photos.length === 1 ? "A new photo" : "New photos"} of ${list(tree.photos, link)}.`,
          ]
        : []),
    ];
    sections.push(
      `<p style="${HEADING}">${escapeHtml(oneLine(tree.name))}</p>` +
        lines
          .map((l) => `<p style="margin:8px 0 0;${TEXT}">${l}</p>`)
          .join(""),
    );
  }

  const unsubscribe = escapeHtml(input.unsubscribeUrl);
  return {
    subject: NEWSLETTER_SUBJECT,
    html: renderEmail({
      title: "Your family this week",
      preheader: escapeHtml(preheaderOf(issue)),
      heading: "Your family this week",
      contentHtml: sections.join(""),
      cta: { label: "open my family tree", url: input.familyUrl },
      footnoteHtml: `Sent every Sunday.
                  <a href="${unsubscribe}" style="color:#737373;">Unsubscribe</a>.`,
    }),
  };
}

/**
 * "Sara Khan added Amina Khan, Yusuf Khan and Zahra Khan.", "You added Ali
 * Khan.", or "Amina Khan was added." when nobody is recorded. Past
 * `NAMES_SHOWN`, the rest are counted: "… and 98 more."
 */
function addedLine(g: IssueAdded, link: (n: IssueName) => string): string {
  const names = list(g.people, link);
  if (g.byYou) return `You added ${names}.`;
  if (g.by) return `${escapeHtml(oneLine(g.by))} added ${names}.`;
  return `${names} ${g.people.length === 1 ? "was" : "were"} added.`;
}

/** "A", "A and B", "A, B and C", "A, B, … and 4 more", each linked. */
function list(names: readonly IssueName[], link: (n: IssueName) => string): string {
  const shown = names.slice(0, NAMES_SHOWN).map(link);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** A row each: the day, then what it is, a round one marked. */
function occasionRows(
  occasions: readonly IssueOccasion[],
  link: (n: IssueName) => string,
): string {
  const rows = occasions.map((o) => {
    const day =
      o.daysAway === 0 ? "Today" : o.daysAway === 1 ? "Tomorrow" : occasionDay(o.date);
    const who = link({ id: o.people[0], name: o.name });
    const what =
      o.kind === "birthday"
        ? o.years === null
          ? `${who}&rsquo;s birthday`
          : `${who} turns ${o.years}`
        : o.years === null
          ? `${who}&rsquo;s anniversary`
          : `${who}&rsquo;s ${ordinal(o.years)} anniversary`;
    const mark = o.kind === "birthday" ? "&#127874;" : "&#128141;";
    const milestone = o.milestone
      ? ` <span style="display:inline-block;padding:1px 8px;border-radius:999px;background-color:#f5f5f5;font-size:12px;line-height:1.6;color:#0a0a0a;">Milestone</span>`
      : "";
    return `<tr>
                    <td style="padding:6px 12px 0 0;white-space:nowrap;vertical-align:top;font-size:14px;line-height:1.6;color:#737373;">${day}</td>
                    <td style="padding:6px 0 0;vertical-align:top;${TEXT}">${mark} ${what}${milestone}</td>
                  </tr>`;
  });
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">${rows.join("")}</table>`;
}

/**
 * The inbox's preview line, what's coming up first: "2 birthdays this week
 * · 1 milestone later this month · 4 added", each part only when there is
 * one.
 */
export function preheaderOf(issue: Issue): string {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const added = addedCount(issue);
  const stories = issue.trees.reduce((n, t) => n + t.stories.length, 0);
  const photos = issue.trees.reduce((n, t) => n + t.photos.length, 0);
  const birthdays = issue.week.filter((o) => o.kind === "birthday").length;
  const anniversaries = issue.week.length - birthdays;
  const parts = [
    birthdays ? `${plural(birthdays, "birthday", "birthdays")} this week` : "",
    anniversaries
      ? `${plural(anniversaries, "anniversary", "anniversaries")} this week`
      : "",
    issue.later.length
      ? `${plural(issue.later.length, "milestone", "milestones")} later this month`
      : "",
    added ? `${added} added` : "",
    stories ? plural(stories, "new story", "new stories") : "",
    photos ? `new photos of ${plural(photos, "person", "people")}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}
