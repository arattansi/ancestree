/**
 * Where the privacy agreement is asked for (Step 30.4). Agreeing belongs to
 * joining a tree: asking to join, accepting an emailed invite, or the
 * sign-in form a bare invite link shows. A plain sign-in is a member coming
 * back, or someone without an invite who is about to hear they need one, so
 * it no longer asks; members were ticking the box at every sign-in.
 */

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
