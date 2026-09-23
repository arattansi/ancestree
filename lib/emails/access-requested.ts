import { escapeHtml } from "@/lib/email";
import { alertCapNoteHtml, oneLine, renderEmail } from "@/lib/emails/shared";
import type { AlertCap } from "@/lib/request-alerts";

/**
 * "Someone asked to join your tree" — to each Root of the tree the moment a
 * request lands (Step 30.1), from request access or a share link's form.
 * Until now they only saw a count, next time they happened to open
 * ancestree. The button opens that tree's admin console at Requests for
 * Access; the name is the one the requester typed.
 */
export function accessRequestedEmail(input: {
  firstName: string;
  lastName: string;
  treeName: string;
  /** `openConsoleHref("invite-requests", treeId)` on the site's origin. */
  url: string;
  /** Set on the alert that uses up the cap. */
  lastFor?: "hour" | "day" | null;
  cap: AlertCap;
}): { subject: string; html: string } {
  const name = oneLine(`${input.firstName} ${input.lastName}`);
  const tree = oneLine(input.treeName);
  const nameHtml = escapeHtml(name);
  const treeHtml = escapeHtml(tree);

  const html = renderEmail({
    title: "A request to join your tree on ancestree",
    preheader: `${nameHtml} asked to join ${treeHtml} on ancestree.`,
    heading: `${nameHtml} asked to join ${treeHtml}`,
    bodyHtml: `They asked on ancestree to join the family tree you look after.
                  Approve their request and we&rsquo;ll email them a link that
                  signs them straight in; decline it and nothing is sent.`,
    cta: { label: "Review the request", url: input.url },
    footnoteHtml: `You&rsquo;re a Root of ${treeHtml}, so requests to join it
                  come to you.${alertCapNoteHtml(input.lastFor, input.cap, "requests to join it")}`,
  });

  return { subject: `${name} asked to join ${tree} on ancestree`, html };
}
