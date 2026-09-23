/**
 * Where the privacy agreement is asked for (Step 30.4). Agreeing belongs to
 * joining a tree: asking to join, accepting an emailed invite, or the
 * sign-in form a bare invite link shows — and, since Step 30.6, joining the
 * waitlist to start one, whose founder invite then skips the box on the
 * join page as a request's does. A plain sign-in is a member coming back,
 * or someone without an invite who is about to hear they need one, so it no
 * longer asks; members were ticking the box at every sign-in.
 */

/** What a form says when it's sent without the box ticked. */
export const CONSENT_NEEDED = "Please accept the privacy notice to continue.";

/**
 * Whether asking for a sign-in link needs the agreement: only when the link
 * will redeem an invite, which is someone joining. `MagicLinkForm` shows the
 * checkbox, and `requestMagicLink` insists on it, by this one rule.
 */
export function signInNeedsConsent(
  inviteToken: string | null | undefined,
): boolean {
  return Boolean(inviteToken?.trim());
}

/**
 * Whether a form came with the box ticked: `consent` is "on" from the
 * checkbox's hidden input, or "true" from a form that already had the
 * agreement.
 */
export function consentGiven(formData: FormData): boolean {
  const consent = formData.get("consent");
  return consent === "on" || consent === "true";
}
