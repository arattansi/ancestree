/**
 * An invite emailed to someone joins that address and no other (Step 51).
 * `redeem_invite` refuses any account whose verified address isn't the
 * invite's `invited_email`, whoever holds the link: a forwarded email, a
 * shared device, a Root opening one they sent. A bare link names nobody and
 * still joins whoever opens it. Pure, so the page's check and the refusal's
 * reading are tested.
 */

/** What `redeem_invite` raises for an account at another address. */
const ANOTHER_ADDRESS = "INVITE_FOR_ANOTHER_ADDRESS";

/** Whether a database error is that refusal. */
export function isAnotherAddressRefusal(message: string | null | undefined): boolean {
  return message?.includes(ANOTHER_ADDRESS) ?? false;
}

/**
 * Whether an invite sent to `sentTo` is someone else's for an account
 * signed in as `signedInAs`: its verified address (`verifiedEmail`), or
 * `null` when it has none, which no emailed invite accepts. A bare link
 * (`sentTo` null) is anyone's.
 */
export function sentToAnotherAddress(
  sentTo: string | null,
  signedInAs: string | null,
): boolean {
  if (!sentTo) return false;
  return signedInAs !== sentTo.trim().toLowerCase();
}
