import { escapeHtml } from "@/lib/email";
import { renderInviteEmail } from "@/lib/emails/shared";

/**
 * "Start your family's tree" email for a Root inviting someone to found a
 * tree of their own (Step 25). Unlike lib/emails/invite-sent.ts the link
 * doesn't join the sender's tree: redeeming it creates a fresh one with the
 * recipient as its Root.
 */
export function founderInviteEmail(input: {
  firstName: string;
  inviterName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const inviterName = escapeHtml(input.inviterName);

  const html = renderInviteEmail({
    firstName,
    bodyHtml: `${inviterName} invited you to start your own family tree on
                  ancestree. The link below signs you straight in and opens a
                  brand-new tree with you as its first Root &mdash; you decide
                  who joins it. It&rsquo;s yours alone, so please don&rsquo;t
                  forward it. It works once and expires in 14 days.`,
    url: input.url,
  });

  return { subject: "Start your family tree on ancestree", html };
}
