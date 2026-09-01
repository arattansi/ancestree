import { escapeHtml } from "@/lib/email";
import { INVITE_EMAIL_SUBJECT, renderInviteEmail } from "@/lib/emails/shared";

/**
 * "You're invited" email for an admin sending an invite directly to someone
 * they already know (the "Invite a relative" bulk form), as opposed to
 * lib/emails/invite-approved.ts which fires when an admin approves someone
 * else's public request — the wording differs slightly since nobody asked.
 */
export function inviteSentEmail(input: {
  firstName: string;
  inviterName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const inviterName = escapeHtml(input.inviterName);

  const html = renderInviteEmail({
    firstName,
    bodyHtml: `${inviterName} invited you to help build the family tree on
                  ancestree. The link below works once and expires in 14
                  days.`,
    url: input.url,
  });

  return { subject: INVITE_EMAIL_SUBJECT, html };
}
