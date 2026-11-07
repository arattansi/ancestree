/**
 * A link of an email, tagged for Google Analytics (Steps 196, 225): the
 * address the reader opens carries which campaign it was in (`utm_campaign`),
 * which email or block (`utm_content`) and which link or issue (`utm_term`),
 * never whom it went to. Everyone gets the same tags. Pure, for the getting
 * started emails (`lib/emails/onboarding.ts`) and the weekly newsletter
 * (`lib/newsletter-clicks.ts`).
 */
export function taggedUrl(
  url: string,
  campaign: string,
  content: string,
  term: string,
): string {
  const tagged = new URL(url);
  tagged.searchParams.set("utm_source", "ancestree");
  tagged.searchParams.set("utm_medium", "email");
  tagged.searchParams.set("utm_campaign", campaign);
  tagged.searchParams.set("utm_content", content);
  tagged.searchParams.set("utm_term", term);
  return tagged.toString();
}
