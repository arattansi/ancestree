import { LAPSE_AFTER_DAYS } from "@/lib/carry";
import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";

/**
 * "Show your full entry?" — to whoever's yes a card brought onto another
 * tree waits on (Step 80): the member whose entry it is (`owner`), or each
 * person who may edit an entry that is nobody's own (`steward`), once for
 * everything asked of them in one go. The button opens their account's
 * settings, where the asks wait under Asked of You, and signs nobody in, so
 * a mail scanner opening it answers nothing. Sent again once, as a
 * `reminder`, to whoever hasn't answered in a week (Step 83).
 */
export function placementAskedEmail(input: {
  kind: "owner" | "steward";
  /** Who is bringing them over, as the tree knows them. */
  placerName: string;
  /** The tree they're being brought onto. */
  treeName: string;
  /** The tree the entries call home; a steward's email names it. */
  homeTreeName: string | null;
  /** How many entries are asked about; one for an owner. */
  entries: number;
  /** The one entry's name, when there is only one. */
  personName: string | null;
  /** `asksHref()` on the site's origin. */
  url: string;
  /** The one reminder, a week on, rather than the ask itself. */
  reminder?: boolean;
}): { subject: string; html: string } {
  const again = input.reminder ? "Reminder: " : "";
  const lapses = `The ask lapses ${LAPSE_AFTER_DAYS} days after it was made.`;
  const placer = oneLine(input.placerName) || "A relative";
  const tree = oneLine(input.treeName) || "their tree";
  const home = oneLine(input.homeTreeName ?? "") || "your tree";
  const placerHtml = escapeHtml(placer);
  const treeHtml = escapeHtml(tree);
  const homeHtml = escapeHtml(home);

  if (input.kind === "owner") {
    const what = `${placer} would like to show your full entry on ${tree}`;
    return {
      subject: `${again}${what}`,
      html: renderEmail({
        title: "Show your full entry on another tree?",
        preheader: `${again}${placerHtml} would like to show your full entry on ${treeHtml}.`,
        heading: `${placerHtml} would like to show your full entry on ${treeHtml}`,
        bodyHtml: `Your name and place of birth are on ${treeHtml} already.
                  Your photo, dates and everything else show there only if
                  you approve.`,
        cta: { label: "Approve or decline", url: input.url },
        footnoteHtml: `${lapses} You can change your answer later, from
                  your account&rsquo;s settings. If you&rsquo;re signed out,
                  sign in with this address first.`,
      }),
    };
  }

  const one = input.entries === 1;
  const person = oneLine(input.personName ?? "");
  const whose = !one
    ? `${input.entries} full entries from ${home}`
    : person
      ? `${person}’s full entry`
      : `a full entry from ${home}`;
  const whoseHtml = !one
    ? `${input.entries} full entries from ${homeHtml}`
    : person
      ? `${escapeHtml(person)}&rsquo;s full entry`
      : `a full entry from ${homeHtml}`;
  return {
    subject: `${again}${placer} would like to show ${whose} on ${tree}`,
    html: renderEmail({
      title: "Show full entries on another tree?",
      preheader: `${again}${placerHtml} would like to show ${whoseHtml} on ${treeHtml}.`,
      heading: `${placerHtml} would like to show ${whoseHtml} on ${treeHtml}`,
      bodyHtml: one
        ? `Their name and place of birth are on ${treeHtml} already. The
                  rest shows there only if someone who can edit the entry on
                  ${homeHtml} approves, and you can.`
        : `Their names and places of birth are on ${treeHtml} already. The
                  rest shows there only if someone who can edit the entries
                  on ${homeHtml} approves, and you can.`,
      cta: { label: one ? "Approve or decline" : "Review them", url: input.url },
      footnoteHtml: `Whoever answers first answers for everyone asked.
                  ${lapses} If you&rsquo;re signed out, sign in with this
                  address first.`,
    }),
  };
}
