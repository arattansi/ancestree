import { escapeHtml } from "@/lib/email";
import { oneLine, renderEmail } from "@/lib/emails/shared";

/**
 * "your birthday card is here" (Step 217): on someone's birthday, from 8 in
 * their morning, once, when anyone signed it (`announce_birthday_cards`).
 * The card's own lower case, as the card says it; how many signed, never
 * who or what. The button opens My Family Tree, where the card waits at the
 * foot of their tree.
 */
export function birthdayCardEmail(input: {
  firstName: string;
  signatures: number;
  /** My Family Tree on the site's origin. */
  url: string;
}): { subject: string; html: string } {
  const name = escapeHtml(oneLine(input.firstName) || "you");
  const count =
    input.signatures === 1 ? "1 person signed it" : `${input.signatures} people signed it`;

  const html = renderEmail({
    title: "your birthday card is here",
    preheader: `happy birthday, ${name}. ${count}.`,
    heading: `happy birthday, ${name}.`,
    bodyHtml: `your birthday card is here: ${count}. it’s tied up and waiting on your tree.`,
    cta: { label: "open your card", url: input.url },
    footnoteHtml:
      "Your family signed it on ancestree. Only you, whoever signed it and those who collected it can open it.",
  });

  return { subject: "your birthday card is here", html };
}
