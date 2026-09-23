import { INVITED_AS } from "@/lib/account-types";
import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";

/**
 * "Someone is looking for their family" — to a member whose address a
 * newcomer gave on request access when it couldn't find them on a tree
 * (Step 30.5). Not an invite: the button opens the member's account page,
 * where the invite waits filled in, and signs nobody in, so a mail scanner
 * opening it spends nothing. The name and address are the ones the newcomer
 * typed; the member decides whether they're family.
 */
export function inviteRelayedEmail(input: {
  firstName: string;
  lastName: string;
  /** The newcomer's address, as they typed it. */
  email: string;
  /** `relayHref(id)` on the site's origin. */
  url: string;
}): { subject: string; html: string } {
  const name = oneLine(`${input.firstName} ${input.lastName}`);
  const nameHtml = escapeHtml(name);
  const emailHtml = escapeHtml(oneLine(input.email));

  const html = renderEmail({
    title: "Someone asked you to invite them to ancestree",
    preheader: `${nameHtml} is looking for their family on ancestree.`,
    heading: `${nameHtml} is looking for their family`,
    bodyHtml: `They couldn&rsquo;t find themselves on a family tree on
                  ancestree, so they gave us your address as a relative
                  who&rsquo;s here. If you know them, we&rsquo;ve filled in an
                  invite to ${emailHtml} for you: one tap sends it, and they
                  join as a ${INVITED_AS.name}. If you don&rsquo;t, ignore this
                  email.`,
    cta: { label: "Invite them", url: input.url },
    footnoteHtml: `They typed your address on ancestree&rsquo;s request access
                  form. We haven&rsquo;t told them whether you&rsquo;re on
                  ancestree, and nothing reaches them unless you invite
                  them. If you&rsquo;re signed out, sign in with this address
                  first.`,
  });

  return { subject: `${name} asked you to invite them to ancestree`, html };
}
