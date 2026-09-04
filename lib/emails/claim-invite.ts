import { escapeHtml } from "@/lib/email";
import { INVITE_EMAIL_SUBJECT, renderInviteEmail } from "@/lib/emails/shared";

/**
 * "Come and claim your entry" email, sent by an admin from an unclaimed entry
 * on the canvas.
 *
 * Unlike lib/emails/invite-sent.ts (a general "help build the tree" ask) and
 * lib/emails/invite-approved.ts (someone's public request being approved), this
 * one is about a specific person already drawn on the tree, so it says whose
 * entry it is and what claiming does. The recipient may well not know they are
 * on a family tree at all, which is exactly why the entry gets named up front.
 */
export function claimInviteEmail(input: {
  firstName: string;
  /** The entry's display name — usually the same person, hence the framing. */
  entryName: string;
  inviterName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const entryName = escapeHtml(input.entryName);
  const inviterName = escapeHtml(input.inviterName);

  const html = renderInviteEmail({
    firstName,
    bodyHtml: `${inviterName} has been building your family&rsquo;s tree on
                  ancestree, and there&rsquo;s already an entry there for
                  <strong style="color:#0a0a0a;">${entryName}</strong>. The link
                  below lets you join and claim it as your own, so you can fill
                  in your own details from then on. It works once and expires in
                  14 days.`,
    url: input.url,
  });

  return { subject: INVITE_EMAIL_SUBJECT, html };
}
