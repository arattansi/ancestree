/**
 * The addresses signing in moves people between, built one way (Step 30.8):
 * the sign-in email's link, an invite's own page, and /join's pending state.
 */

/**
 * /join for someone signed in who isn't a member yet. The page works out
 * what's waiting for their address (`lib/first-timer.ts`); `status` only
 * says why they're there.
 */
export const PENDING_HREF = "/join?status=pending";

/** An invite's own page, where it's accepted. */
export function inviteHref(token: string): string {
  return `/join/${encodeURIComponent(token)}`;
}

/**
 * What a sign-in email's link is built on: `/auth/callback`, carrying where
 * the sign-in lands (`next`, already checked by `safeNext`) and, from a bare
 * invite link's form, the invite it redeems. The magic-link template adds
 * the one-time token after it with `&` (`{{ .RedirectTo }}&token_hash=…`),
 * so it always carries a query.
 */
export function signInCallbackUrl(
  siteUrl: string,
  { next, invite }: { next: string; invite?: string | null },
): string {
  const url = new URL("/auth/callback", siteUrl);
  url.searchParams.set("next", next);
  if (invite) url.searchParams.set("invite", invite);
  return url.toString();
}
