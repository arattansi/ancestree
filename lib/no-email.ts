/**
 * A member with no email (Step 202): family who use WeChat, not email, join
 * from a claim link or the family link with their name alone, and get back
 * in through a sign-in link a Root sends them. Their account still needs an
 * address to hold a session, so it gets one at a domain with no mail
 * server. Nothing is ever sent to it, and it's never shown. Since Step 213
 * it's how everyone joins from those links: the email comes after.
 */
export const NO_EMAIL_DOMAIN = "no-email.ancestree.space";

/** The address of a new account with no email, from a fresh uuid. */
export function noEmailAddress(id: string): string {
  return `${id}@${NO_EMAIL_DOMAIN}`;
}

/** Whether an address is one of those, not a real inbox. */
export function isNoEmailAddress(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${NO_EMAIL_DOMAIN}`);
}

/** The address as given when it reaches someone, else `null`. */
export function reachableEmail(email: string | null | undefined): string | null {
  const address = email?.trim();
  return address && !isNoEmailAddress(address) ? address : null;
}

/** An account's address as a screen shows it: "No email" for theirs. */
export function shownEmail(email: string | null | undefined): string {
  return isNoEmailAddress(email) ? "No email" : (email ?? "");
}

/**
 * Where an account keeps that it was asked to add an email (Step 213):
 * its auth metadata, as the time they closed the ask.
 */
export const EMAIL_ASKED_KEY = "email_asked_at";

/**
 * Whether My Family Tree asks an account to add an email so they can sign
 * back in (Step 213): one with no email, which hasn't closed the ask. Once
 * closed, it's for Account → Your Email.
 */
export function asksForEmail(
  email: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return isNoEmailAddress(email) && !metadata?.[EMAIL_ASKED_KEY];
}

/** An invite as `noEmailMayJoin` judges it. */
export type NoEmailInvite = {
  status: string;
  expires_at: string | null;
  archived_at: string | null;
  invited_email: string | null;
  founds_tree: boolean;
  person_id: string | null;
  max_uses: number | null;
  use_count: number;
};

/**
 * Whether someone with no email may take an invite (Step 202): a live claim
 * link or family link. Neither is bound to an address, and each joins a
 * tree, as a Leaf, rather than founding one, whose founder is a Root. A
 * full family link takes nobody.
 */
export function noEmailMayJoin(
  invite: NoEmailInvite | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!invite || invite.status !== "active" || invite.archived_at) return false;
  if (invite.expires_at && new Date(invite.expires_at) <= now) return false;
  if (invite.invited_email || invite.founds_tree) return false;
  if (invite.max_uses !== null) return invite.use_count < invite.max_uses;
  return invite.person_id !== null;
}
