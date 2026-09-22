import { escapeHtml } from "@/lib/email";
import { renderInviteEmail } from "@/lib/emails/shared";

/**
 * "Start your family tree" for someone off the beta waitlist (Step 28): a
 * reviewer approved their request, and the link is a founder invite. The
 * sibling of lib/emails/founder-invite.ts, which a Root sends unasked —
 * as lib/emails/invite-approved.ts is to invite-sent.ts.
 */
export function founderApprovedEmail(input: {
  firstName: string;
  inviterName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const inviterName = escapeHtml(input.inviterName);

  const html = renderInviteEmail({
    firstName,
    bodyHtml: `${inviterName} approved your request to start a family tree on
                  ancestree. The link below signs you straight in and opens a
                  brand-new tree with you as its first Root &mdash; you decide
                  who joins it. It&rsquo;s yours alone, so please don&rsquo;t
                  forward it. It works once and expires in 14 days.`,
    url: input.url,
  });

  return { subject: "Start your family tree on ancestree", html };
}
