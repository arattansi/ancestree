import { escapeHtml } from "@/lib/email";
import { INVITE_EMAIL_SUBJECT, renderInviteEmail } from "@/lib/emails/shared";

/**
 * "You're invited" email, sent by `approveInviteRequest` once an admin
 * approves a public invite request. See lib/emails/invite-sent.ts for the
 * sibling used when an admin invites someone directly, without a request.
 */
export function inviteApprovedEmail(input: {
  firstName: string;
  inviterName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const inviterName = escapeHtml(input.inviterName);

  const html = renderInviteEmail({
    firstName,
    bodyHtml: `${inviterName} approved your request to join the family tree
                  on ancestree. The link below works once and expires in 14
                  days.`,
    url: input.url,
  });

  return { subject: INVITE_EMAIL_SUBJECT, html };
}
