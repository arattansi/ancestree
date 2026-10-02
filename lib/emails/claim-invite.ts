import { escapeHtml } from "@/lib/email";
import { INVITE_EMAIL_SUBJECT, renderInviteEmail } from "@/lib/emails/shared";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";

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
  /**
   * The entry is a child's placeholder (Step 98.3): it has no name of its
   * own to greet them by, only "Second Child", and it stays hidden from the
   * family until their parent approves, so the email says that instead.
   */
  placeholder?: boolean;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const entryName = escapeHtml(input.entryName);
  const inviterName = escapeHtml(input.inviterName);

  if (input.placeholder) {
    return {
      subject: INVITE_EMAIL_SUBJECT,
      html: renderInviteEmail({
        bodyHtml: `${inviterName} has kept a place for you on your
                  family&rsquo;s tree on ancestree. The link below signs you
                  straight in and makes it yours. Your details are hidden
                  from the family until your parent approves. It&rsquo;s
                  yours alone, so please don&rsquo;t forward it. It works once
                  and expires in ${INVITE_LIFETIME_DAYS} days.`,
        url: input.url,
      }),
    };
  }

  const html = renderInviteEmail({
    firstName,
    bodyHtml: `${inviterName} has been building your family&rsquo;s tree on
                  ancestree, and there&rsquo;s already an entry there for
                  <strong style="color:#0a0a0a;">${entryName}</strong>. The link
                  below signs you straight in and lets you claim it as your
                  own, so you can fill in your own details from then on.
                  It&rsquo;s yours alone, so please don&rsquo;t forward it. It
                  works once and expires in ${INVITE_LIFETIME_DAYS} days.`,
    url: input.url,
  });

  return { subject: INVITE_EMAIL_SUBJECT, html };
}
