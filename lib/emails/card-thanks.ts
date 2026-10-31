import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";

/**
 * "a thank-you from Ada" (Step 217.5): to someone who signed Ada's card
 * through a link, signed out, and left an email for this alone (decision
 * 16). Once, when Ada thanks everyone (`card_thanks_emails` forgets the
 * address as it hands it over). Ada's own words, as she wrote them; the
 * rest in the card's own lower case. No button: the card opens on the
 * browser they signed from, and nothing here would sign them in.
 */
export function cardThanksEmail(input: {
  firstName: string;
  /** As they signed. */
  signerName: string;
  message: string;
}): { subject: string; html: string } {
  const first = oneLine(input.firstName) || "They";
  const name = escapeHtml(first);
  const signer = escapeHtml(oneLine(input.signerName));
  const words = escapeHtml(input.message.trim()).replace(/\r?\n/g, "<br>");
  const line = oneLine(input.message);
  const preview = escapeHtml(line.length > 90 ? `${line.slice(0, 90).replace(/\s+\S*$/, "")}…` : line);

  const html = renderEmail({
    title: `a thank-you from ${name}`,
    preheader: `“${preview}”`,
    heading: signer ? `thank you, ${signer}.` : "thank you.",
    bodyHtml:
      `${name} thanked everyone who signed the birthday card:` +
      `<br><br>“${words}”<br><br>— ${name}`,
    footnoteHtml:
      "You left this address when you signed the card on ancestree, for this thank-you only. It has been deleted.",
  });

  return { subject: `a thank-you from ${first}`, html };
}
