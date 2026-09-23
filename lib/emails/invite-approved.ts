import { escapeHtml } from "@/lib/email";
import { INVITE_EMAIL_SUBJECT, renderInviteEmail } from "@/lib/emails/shared";

/**
 * "You're invited" email, sent by `approveInviteRequest` once an admin
 * approves a public invite request. See lib/emails/invite-sent.ts for the
 * sibling used when an admin invites someone directly, without a request.
 *
 * A Root may approve a request as the entry on the tree that the name
 * matched (Step 30.3). Then it names the entry, as lib/emails/claim-invite.ts
 * does: accepting makes it theirs, and the join page will say so too.
 */
export function inviteApprovedEmail(input: {
  firstName: string;
  inviterName: string;
  url: string;
  /** The entry the invite claims, when the Root approved them as one. */
  entryName?: string | null;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const inviterName = escapeHtml(input.inviterName);
  const entryName = input.entryName ? escapeHtml(input.entryName) : null;

  const html = renderInviteEmail({
    firstName,
    bodyHtml: entryName
      ? `${inviterName} approved your request to join the family tree
                  on ancestree, where there&rsquo;s already an entry for
                  <strong style="color:#0a0a0a;">${entryName}</strong>. The
                  link below signs you straight in and makes that entry yours,
                  so you can keep your own details up to date from then on.
                  The link is yours alone, so please don&rsquo;t forward it.
                  It works once and expires in 14 days.`
      : `${inviterName} approved your request to join the family tree
                  on ancestree. The link below signs you straight in &mdash;
                  it&rsquo;s yours alone, so please don&rsquo;t forward it. It
                  works once and expires in 14 days.`,
    url: input.url,
  });

  return { subject: INVITE_EMAIL_SUBJECT, html };
}
