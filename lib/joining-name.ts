/**
 * The name someone joins by (Step 30.7): the first and last name on the
 * request or invite that brought them, or the one they typed beside their
 * email on a bare invite link. It's kept on their auth account
 * (`user_metadata`), because the request row goes when the invite is
 * redeemed: a bare link's new profile is named after it, and onboarding
 * searches the tree for it as it opens. Pure, so the sign-in form, the
 * sign-in code and onboarding all read it one way.
 */

import { MAX_NAME_LENGTH } from "@/lib/request-forms";

/** As an account keeps it, and as onboarding and `AddPersonFlow` take it. */
export type JoiningName = { first_name: string; last_name: string };

/**
 * Whether the sign-in form asks for a name beside the email: only when the
 * link will redeem an invite, since that makes a new member, whose profile
 * needs a name and whose onboarding needs one to search by. A plain sign-in
 * is someone coming back. `MagicLinkForm` shows the fields, and
 * `requestMagicLink` insists on them, by this one rule.
 */
export function signInAsksName(inviteToken: string | null | undefined): boolean {
  return Boolean(inviteToken?.trim());
}

/**
 * The name off an account's metadata — or off a request row, whose columns
 * are named the same — or `null` when it holds no whole name: both halves,
 * each within the request forms' limit. Anything else is ignored rather than
 * trusted, since a member can rewrite their own metadata.
 */
export function readJoiningName(value: unknown): JoiningName | null {
  if (!value || typeof value !== "object") return null;
  const { first_name, last_name } = value as Record<string, unknown>;
  if (typeof first_name !== "string" || typeof last_name !== "string") {
    return null;
  }
  const first = first_name.trim().replace(/\s+/g, " ");
  const last = last_name.trim().replace(/\s+/g, " ");
  if (!first || !last) return null;
  if (first.length > MAX_NAME_LENGTH || last.length > MAX_NAME_LENGTH) {
    return null;
  }
  return { first_name: first, last_name: last };
}

/** "First Last", the display name a new profile takes (`redeemInvite`). */
export function joiningDisplayName(
  name: JoiningName | null,
): string | undefined {
  return name ? `${name.first_name} ${name.last_name}` : undefined;
}
