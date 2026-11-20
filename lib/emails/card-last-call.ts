import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";
import { cardDay, possessive } from "@/lib/birthday-cards";

/**
 * "last chance to sign Ada’s birthday card!" (Step 232; Aalim's words): a
 * week before Ada's card opens, once, to each member reminded to sign it who
 * hasn't (`claim_card_last_calls`). When her birthday is and how many have
 * signed, never who or what. The card's own lower case, as the birthday
 * email's. The button opens Ada's details on My Family Tree, where the card
 * waits to be signed; the small print's link turns these emails off, signed
 * out.
 */
export function cardLastCallEmail(input: {
  firstName: string;
  /** Her birthday, `YYYY-MM-DD`. */
  opensOn: string;
  /** Days from the member's today: 7 a week before, less for a card started late. */
  daysAway: number;
  signatures: number;
  /** `myFamilyFocusHref(personId)` on the site's origin. */
  url: string;
  /** `cardEmailsPageHref(token)` on the site's origin. */
  unsubscribe: string;
}): { subject: string; html: string } {
  const first = oneLine(input.firstName);
  const subject = first
    ? `last chance to sign ${possessive(first)} birthday card!`
    : "last chance to sign a birthday card!";
  const title = escapeHtml(subject);
  const whose = first ? `${escapeHtml(possessive(first))} birthday` : "their birthday";
  const day = escapeHtml(cardDay(input.opensOn));
  const when = whenFrom(input.daysAway, day);
  const signed =
    input.signatures === 0
      ? "nobody has signed yet."
      : input.signatures === 1
        ? "1 person has signed."
        : `${input.signatures} people have signed.`;

  const html = renderEmail({
    title,
    preheader: `${whose} is ${when}. ${signed}`,
    heading: title,
    bodyHtml: `${whose} is ${when}. ${signed}`,
    cta: { label: "sign the card", url: input.url },
    footnoteHtml: `One email for each birthday card you haven&rsquo;t signed, a week before.
                  <a href="${escapeHtml(input.unsubscribe)}" style="color:#737373;">Unsubscribe</a>.`,
  });

  return { subject, html };
}

/** "in a week, on 27 november", "tomorrow, 27 november", "on 27 november". */
function whenFrom(daysAway: number, day: string): string {
  if (daysAway === 0) return `today, ${day}`;
  if (daysAway === 1) return `tomorrow, ${day}`;
  if (daysAway === 7) return `in a week, on ${day}`;
  if (daysAway > 1 && daysAway < 7) return `in ${daysAway} days, on ${day}`;
  return `on ${day}`;
}
