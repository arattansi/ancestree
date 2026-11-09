import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The key an emailed invite's link carries beside its token (`?k=`, audit
 * H3). The token alone isn't proof of the inbox: whoever sent the invite can
 * read it (the Root console's "copy link", `invites_select`). The key is
 * worked out here from the token and a secret only the server holds, and
 * kept nowhere, so the one place it can be read is the email itself. A link
 * with it signs its address in on one tap (`signInWithInvite`); one without
 * asks for a code sent to that address.
 *
 * Keyed on the service-role key, under a label of its own: nothing new to
 * set up, and rotating that key only sends outstanding links to the code.
 */
const LABEL = "ancestree:invite-mail-key:v1:";

/** The query parameter the key travels in. */
export const INVITE_KEY_PARAM = "k";

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

/** The key for an invite's token: 128 bits, safe in a URL. */
export function inviteKey(token: string): string {
  return createHmac("sha256", secret())
    .update(LABEL + token)
    .digest("base64url")
    .slice(0, 22);
}

/** Whether `key` is the one this invite's email carried. */
export function isInviteKey(token: string, key: string | null | undefined): boolean {
  if (!token || !key) return false;
  const given = Buffer.from(key);
  const real = Buffer.from(inviteKey(token));
  return given.length === real.length && timingSafeEqual(given, real);
}
