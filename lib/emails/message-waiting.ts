import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";

/**
 * "Aalim wrote to you on ancestree" (Step 182): to a member who hasn't
 * visited since messages began, once a relative writes to them. Who wrote,
 * never what: the words wait, encrypted, until the member visits and the
 * sender's device passes them on. Once for each relative until they've
 * visited (`claim_waiting_notice`), with its own unsubscribe link, which
 * works signed out. The button opens the conversation, which signs a
 * member in first and changes nothing on its own.
 */
export function messageWaitingEmail(input: {
  /** The sender, by their own entry's name, else the one they set. */
  senderName: string;
  /** `messagesHref(senderId)` on the site's origin. */
  url: string;
  /** `messageEmailsPageHref(token)` on the site's origin. */
  unsubscribe: string;
}): { subject: string; html: string } {
  const name = oneLine(input.senderName) || "A relative";
  const nameHtml = escapeHtml(name);

  const html = renderEmail({
    title: `${nameHtml} wrote to you on ancestree`,
    preheader: `${nameHtml} wrote to you on ancestree.`,
    heading: `${nameHtml} wrote to you`,
    bodyHtml: `Visit ancestree to read it.`,
    cta: { label: "read it", url: input.url },
    footnoteHtml: `One email for each relative who writes before you visit.
                  <a href="${escapeHtml(input.unsubscribe)}" style="color:#737373;">Unsubscribe</a>.`,
  });

  return { subject: `${name} wrote to you on ancestree`, html };
}
