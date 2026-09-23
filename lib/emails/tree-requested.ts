import { escapeHtml } from "@/lib/email";
import { alertCapNoteHtml, oneLine, renderEmail } from "@/lib/emails/shared";
import type { AlertCap } from "@/lib/request-alerts";

/**
 * "Someone asked to start a tree" — to each beta reviewer the moment a new
 * request lands (Step 30.1): a sign-up from the home page's waitlist, or a
 * member asking from inside. The button opens Requests to Start a Tree on
 * a console the reviewer runs; the name is the one on the request.
 */
export function treeRequestedEmail(input: {
  kind: "waitlist" | "member";
  firstName: string;
  lastName: string;
  /** `openConsoleHref("tree-requests")` on the site's origin. */
  url: string;
  /** Set on the alert that uses up the cap. */
  lastFor?: "hour" | "day" | null;
  cap: AlertCap;
}): { subject: string; html: string } {
  const name = oneLine(`${input.firstName} ${input.lastName}`);
  const nameHtml = escapeHtml(name);

  const bodyHtml =
    input.kind === "waitlist"
      ? `They joined the waitlist on ancestree&rsquo;s home page, so they
                  don&rsquo;t have an account yet. Approve them and we&rsquo;ll
                  email them a founder invite from the tree whose console you
                  approve it on; decline it and nothing is sent.`
      : `They&rsquo;re already a member on ancestree, and asked to start a
                  family tree of their own. Approve them and we&rsquo;ll email
                  them to say they can; decline it and nothing is sent.`;

  const html = renderEmail({
    title: "A request to start a tree on ancestree",
    preheader: `${nameHtml} asked to start a tree on ancestree.`,
    heading: `${nameHtml} asked to start a tree`,
    bodyHtml,
    cta: { label: "Review the request", url: input.url },
    footnoteHtml: `You&rsquo;re a beta reviewer, so requests to start a tree
                  come to you.${alertCapNoteHtml(input.lastFor, input.cap, "requests from the waitlist")}`,
  });

  return { subject: `${name} asked to start a tree on ancestree`, html };
}
