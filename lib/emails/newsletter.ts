import { escapeHtml } from "@/lib/email";
import { markdownEmailHtml } from "@/lib/emails/markdown";
import { emailButton, oneLine, renderEmail } from "@/lib/emails/shared";
import {
  addedCount,
  unreadCount,
  type Issue,
  type IssueAdded,
  type IssueName,
  type IssueOccasion,
  type IssueSender,
  type IssueStory,
} from "@/lib/newsletter";
import { occasionDay, ordinal } from "@/lib/occasions";

/** Names a sentence lists before "and 12 more". */
export const NAMES_SHOWN = 6;

/** Plain text, so a real apostrophe. */
export const NEWSLETTER_SUBJECT = "Your family this week";

export const TEXT = "font-size:15px;line-height:1.6;color:#0a0a0a;";
export const LINK = "color:#0a0a0a;text-decoration:underline;";
export const HEADING =
  "margin:28px 0 0;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#737373;";

/**
 * The weekly newsletter (Step 95), from what `weeklyIssue` found: This
 * Week and, past it, the round birthdays and anniversaries still to come
 * this month, then a section per tree that had news. Every name links
 * to its card on My Family Tree, where everyone in it is (`personUrl`); the
 * button opens the view. Whoever was added says what they are to the
 * reader, and each story links to itself with who told it and who asked
 * (Step 144), or, in a week with none, a button to write one; a photo
 * gives away only whom it's of. A note from the beta
 * reviewers, when there is one, goes above the greeting, in Markdown
 * (Step 159), and "invite family" sits
 * beside the main button (Step 143). First of all, who has written to them
 * that they haven't read, each opening that conversation (Step 180).
 */
export function newsletterEmail(input: {
  issue: Issue;
  /** Their card on My Family Tree, on the site's origin. */
  personUrl: (personId: string) => string;
  /** My Family Tree, on the site's origin. */
  familyUrl: string;
  /** The page that turns it off, on the site's origin. */
  unsubscribeUrl: string;
  /** Where they invite family, on the site's origin (Step 143). */
  inviteUrl: string;
  /** A story, on the site's origin (Step 144). */
  storyUrl: (storyId: string) => string;
  /** The messenger, on your conversation with a member or on the list, on
   *  the site's origin (Step 180). */
  messagesUrl: (userId?: string) => string;
  /** The beta reviewers' note for this send, in Markdown (Steps 144, 159). */
  note?: string | null;
}): { subject: string; html: string } {
  const { issue } = input;
  // Their note above everything (Step 144; above the greeting at Aalim's
  // ask), in Markdown: bold, italics, links and the rest (Step 159).
  const note = input.note?.trim();
  const lead = note
    ? `<div style="margin:0 0 28px;">${markdownEmailHtml(note)}</div>`
    : undefined;
  const sections = issueSections(issue, input);

  // A week with no stories asks for one (Step 144): written on whoever's
  // card they pick on My Family Tree.
  if (!issue.trees.some((t) => t.stories.length)) {
    sections.push(
      `<p style="${HEADING}">Share a Story</p><p style="margin:8px 0 0;${TEXT}">No new stories this week. Write one about someone for the family to read.</p><div style="margin:12px 0 0;font-size:0;">${emailButton({ label: "write a story", url: input.familyUrl }, "outline")}</div>`,
    );
  }

  const unsubscribe = escapeHtml(input.unsubscribeUrl);
  return {
    subject: NEWSLETTER_SUBJECT,
    html: renderEmail({
      title: "Your family this week",
      preheader: escapeHtml(preheaderOf(issue)),
      leadHtml: lead,
      heading: "Your family this week",
      contentHtml: sections.join(""),
      cta: { label: "open my family tree", url: input.familyUrl },
      secondaryCta: { label: "invite family", url: input.inviteUrl },
      footnoteHtml: `Sent weekly.
                  <a href="${unsubscribe}" style="color:#737373;">Unsubscribe</a>.`,
    }),
  };
}

/**
 * What an issue tells, a block each: Unread Messages, This Week, Later
 * This Month, then a section per tree that had news. Every name links to
 * its card (`personUrl`); whoever was added says what they are to the
 * reader, and each story links to itself with who told it and who asked.
 * The weekly newsletter's body, and the getting started win-back's "since
 * you were last here" (Step 151), which has no messages to tell.
 */
export function issueSections(
  issue: Issue,
  {
    personUrl,
    storyUrl,
    messagesUrl,
  }: {
    personUrl: (personId: string) => string;
    storyUrl: (storyId: string) => string;
    messagesUrl?: (userId?: string) => string;
  },
): string[] {
  const link = (n: IssueName) =>
    `<a href="${escapeHtml(personUrl(n.id))}" style="${LINK}">${escapeHtml(oneLine(n.name))}</a>`;
  // "Yusuf Khan (your first cousin)", where there's a word for it.
  const linkKin = (n: IssueName) =>
    n.relation ? `${link(n)} (${escapeHtml(n.relation)})` : link(n);

  const sections: string[] = [];
  // Who's waiting on a reply before anything else (Step 180).
  if (messagesUrl && issue.messages.length) {
    sections.push(
      `<p style="${HEADING}">Unread Messages</p>${unreadLines(issue.messages, messagesUrl)}`,
    );
  }
  // What's coming up first (Aalim, 2026-10-01), then each tree's news.
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
      ...(tree.joined.length ? [`${list(tree.joined, linkKin)} joined.`] : []),
      ...tree.added.map((g) => addedLine(g, linkKin)),
      ...tree.stories.map((st) => storyLine(st, storyUrl(st.id), link)),
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
  return sections;
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

/**
 * "<A story> about Amina Khan. Told by Hassan Rattansi; interviewed by
 * Aalim Rattansi." No title, ever (Aalim, 2026-10-12): "A story" links to
 * it, and each credit says itself only when there's someone in it.
 */
function storyLine(
  story: IssueStory,
  url: string,
  link: (n: IssueName) => string,
): string {
  const head = `<a href="${escapeHtml(url)}" style="${LINK}">A story</a> about ${link(story.about)}.`;
  const credits = [
    story.storytellers.length ? `told by ${list(story.storytellers, link)}` : "",
    story.interviewers.length ? `interviewed by ${list(story.interviewers, link)}` : "",
  ].filter(Boolean);
  if (!credits.length) return head;
  const said = credits.join("; ");
  return `${head} ${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
}

/**
 * "3 from Amina Khan (your first cousin).", a line each, newest first, the
 * name opening that conversation: who and how many, never what they said
 * (Step 180). Past `NAMES_SHOWN`, "And 4 more people." opens the list.
 */
function unreadLines(
  senders: readonly IssueSender[],
  messagesUrl: (userId?: string) => string,
): string {
  const line = (html: string) => `<p style="margin:8px 0 0;${TEXT}">${html}</p>`;
  const lines = senders.slice(0, NAMES_SHOWN).map((s) => {
    const name = `<a href="${escapeHtml(messagesUrl(s.userId))}" style="${LINK}">${escapeHtml(oneLine(s.name))}</a>`;
    const who = s.relation ? `${name} (${escapeHtml(s.relation)})` : name;
    // Written before they'd visited since messages began (Step 182).
    return line(s.waiting ? `${s.unread} from ${who}, waiting for you to visit.` : `${s.unread} from ${who}.`);
  });
  const rest = senders.length - NAMES_SHOWN;
  if (rest > 0) {
    lines.push(
      line(
        `<a href="${escapeHtml(messagesUrl())}" style="${LINK}">And ${rest} more ${rest === 1 ? "person" : "people"}</a>.`,
      ),
    );
  }
  return lines.join("");
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
 * The inbox's preview line, what's waiting and coming up first: "3 unread
 * messages · 2 birthdays this week · 1 milestone later this month · 4
 * added", each part only when there is one.
 */
export function preheaderOf(issue: Issue): string {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const added = addedCount(issue);
  const unread = unreadCount(issue);
  const stories = issue.trees.reduce((n, t) => n + t.stories.length, 0);
  const photos = issue.trees.reduce((n, t) => n + t.photos.length, 0);
  const birthdays = issue.week.filter((o) => o.kind === "birthday").length;
  const anniversaries = issue.week.length - birthdays;
  const parts = [
    unread ? plural(unread, "unread message", "unread messages") : "",
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
