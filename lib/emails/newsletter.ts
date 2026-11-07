import { escapeHtml } from "@/lib/email";
import { markdownEmailHtml } from "@/lib/emails/markdown";
import { emailButton, oneLine, renderEmail } from "@/lib/emails/shared";
import { newsletterLink, type NewsletterSection } from "@/lib/newsletter-clicks";
import {
  addedCount,
  cardsCount,
  cardsToStartCount,
  unreadCount,
  type Issue,
  type IssueAdded,
  type IssueCard,
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
 * beside the main button (Step 143). First of all, the birthday cards they
 * could sign and haven't (Step 223) and those they could start (Step 224),
 * then who has written to them that they haven't read, each opening that
 * conversation (Step 180).
 */
export function newsletterEmail(input: {
  issue: Issue;
  /** Their card on My Family Tree, on the site's origin. */
  personUrl: (personId: string) => string;
  /** Their card on the tree's canvas, for a card to start of someone My
   *  Family Tree doesn't show (Step 224), on the site's origin. */
  canvasUrl?: (personId: string) => string;
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
  /** The day the issue goes out, `YYYY-MM-DD`: with it every link but the
   *  unsubscribe one is tagged as the issue's and its block's, so Analytics
   *  and the admin page can tell which were opened (Step 225). */
  issueDay?: string;
}): { subject: string; html: string } {
  const { issue, issueDay } = input;
  const tag = issueDay
    ? (url: string, section: NewsletterSection) => newsletterLink(url, section, issueDay)
    : undefined;
  const tagged = (url: string, section: NewsletterSection) =>
    tag ? tag(url, section) : url;
  // Their note above everything (Step 144; above the greeting at Aalim's
  // ask), in Markdown: bold, italics, links and the rest (Step 159).
  const note = input.note?.trim();
  const lead = note
    ? `<div style="margin:0 0 28px;">${markdownEmailHtml(note)}</div>`
    : undefined;
  const sections = issueSections(issue, { ...input, tag });

  // A week with no stories asks for one (Step 144): written on whoever's
  // card they pick on My Family Tree.
  if (!issue.trees.some((t) => t.stories.length)) {
    sections.push(
      `<p style="${HEADING}">Share a Story</p><p style="margin:8px 0 0;${TEXT}">No new stories this week. Write one about someone for the family to read.</p><div style="margin:12px 0 0;font-size:0;">${emailButton({ label: "write a story", url: tagged(input.familyUrl, "write-a-story") }, "outline")}</div>`,
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
      cta: { label: "open my family tree", url: tagged(input.familyUrl, "open") },
      secondaryCta: { label: "invite family", url: tagged(input.inviteUrl, "invite") },
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
    canvasUrl,
    storyUrl,
    messagesUrl,
    tag,
  }: {
    personUrl: (personId: string) => string;
    canvasUrl?: (personId: string) => string;
    storyUrl: (storyId: string) => string;
    messagesUrl?: (userId?: string) => string;
    /** Tags a link as one of a block of the email (Step 225): the weekly
     *  newsletter's; the getting started win-back tags its own. */
    tag?: (url: string, section: NewsletterSection) => string;
  },
): string[] {
  // A link, tagged as the block it's in when the issue is (Step 225).
  const tagged = (url: string, section: NewsletterSection) =>
    tag ? tag(url, section) : url;
  const linkIn = (section: NewsletterSection) => (n: IssueName) =>
    `<a href="${escapeHtml(tagged(personUrl(n.id), section))}" style="${LINK}">${escapeHtml(oneLine(n.name))}</a>`;
  // "Yusuf Khan (your first cousin)", where there's a word for it.
  const linkKinIn = (section: NewsletterSection) => (n: IssueName) =>
    n.relation ? `${linkIn(section)(n)} (${escapeHtml(n.relation)})` : linkIn(section)(n);

  const sections: string[] = [];
  // Birthday cards to sign at the very top (Aalim, Step 223): each closes at
  // the end of the day, so it can't wait for the rest. Then those they could
  // start (Step 224), each opening their details, where it's started: on
  // the canvas for someone My Family Tree doesn't show.
  const linkCardIn = (section: NewsletterSection) => (c: IssueCard) =>
    c.onCanvas && canvasUrl
      ? `<a href="${escapeHtml(tagged(canvasUrl(c.id), section))}" style="${LINK}">${escapeHtml(oneLine(c.name))}</a>${c.relation ? ` (${escapeHtml(c.relation)})` : ""}`
      : linkKinIn(section)(c);
  if (issue.cards?.length) {
    sections.push(
      `<p style="${HEADING}">Birthday Cards to Sign</p>${cardRows(issue.cards, linkCardIn("cards"))}`,
    );
  }
  if (issue.toStart?.length) {
    sections.push(
      `<p style="${HEADING}">Birthday Cards to Start</p>${cardRows(issue.toStart, linkCardIn("cards-to-start"))}`,
    );
  }
  // Who's waiting on a reply before anything else (Step 180).
  if (messagesUrl && issue.messages.length) {
    sections.push(
      `<p style="${HEADING}">Unread Messages</p>${unreadLines(issue.messages, (userId) => tagged(messagesUrl(userId), "messages"))}`,
    );
  }
  // What's coming up first (Aalim, 2026-10-01), then each tree's news.
  if (issue.week.length) {
    sections.push(
      `<p style="${HEADING}">This Week</p>${occasionRows(issue.week, linkIn("this-week"))}`,
    );
  }
  if (issue.later.length) {
    sections.push(
      `<p style="${HEADING}">Later This Month</p>${occasionRows(issue.later, linkIn("later"))}`,
    );
  }
  for (const tree of issue.trees) {
    const lines = [
      ...(tree.joined.length ? [`${list(tree.joined, linkKinIn("news"))} joined.`] : []),
      ...tree.added.map((g) => addedLine(g, linkKinIn("news"))),
      ...tree.stories.map((st) =>
        storyLine(st, tagged(storyUrl(st.id), "story"), linkIn("story")),
      ),
      ...(tree.photos.length
        ? [
            `${tree.photos.length === 1 ? "A new photo" : "New photos"} of ${list(tree.photos, linkIn("news"))}.`,
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
 * "<A story> about Amina Khan and Yusuf Khan. Told by Hassan Rattansi;
 * interviewed by Aalim Rattansi." No title, ever (Aalim, 2026-10-12): "A
 * story" links to it, and each credit says itself only when there's
 * someone in it. Everyone it's about the reader sees is named (Step 183).
 */
function storyLine(
  story: IssueStory,
  url: string,
  link: (n: IssueName) => string,
): string {
  const head = `<a href="${escapeHtml(url)}" style="${LINK}">A story</a> about ${list(story.about, link)}.`;
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

/**
 * A row each, soonest first (Step 223): their birthday, then an envelope and
 * whose card it is, the name opening their details, where it waits to be
 * signed or started. "Sat 28 Nov  ✉️ Aly Rattansi (your brother)".
 */
function cardRows(
  cards: readonly IssueCard[],
  linkCard: (c: IssueCard) => string,
): string {
  const rows = cards.map((c) => {
    const day = c.daysAway === 0 ? "Today" : c.daysAway === 1 ? "Tomorrow" : occasionDay(c.date);
    return `<tr>
                    <td style="padding:6px 12px 0 0;white-space:nowrap;vertical-align:top;font-size:14px;line-height:1.6;color:#737373;">${day}</td>
                    <td style="padding:6px 0 0;vertical-align:top;${TEXT}">&#9993;&#65039; ${linkCard(c)}</td>
                  </tr>`;
  });
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">${rows.join("")}</table>`;
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
 * The inbox's preview line, what's waiting and coming up first: "1 card to
 * sign · 1 card to start · 3 unread messages · 2 birthdays this week · 1
 * milestone later this month · 4 added", each part only when there is one.
 */
export function preheaderOf(issue: Issue): string {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const added = addedCount(issue);
  const unread = unreadCount(issue);
  const cards = cardsCount(issue);
  const toStart = cardsToStartCount(issue);
  const stories = issue.trees.reduce((n, t) => n + t.stories.length, 0);
  const photos = issue.trees.reduce((n, t) => n + t.photos.length, 0);
  const birthdays = issue.week.filter((o) => o.kind === "birthday").length;
  const anniversaries = issue.week.length - birthdays;
  const parts = [
    cards ? plural(cards, "card to sign", "cards to sign") : "",
    toStart ? plural(toStart, "card to start", "cards to start") : "",
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
