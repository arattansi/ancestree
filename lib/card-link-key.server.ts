import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * A birthday card link's token (Step 229): worked out here from the link's
 * id and a secret only the server holds, so a manager's sheet can show the
 * same address again while the link is on. The database still keeps only
 * the token's sha256 and checks a visitor's token by it alone
 * (`private.card_link_by_token`), so the rows by themselves open nothing.
 *
 * Keyed on the service-role key, under a label of its own, as an emailed
 * invite's key is (`invite-key.server.ts`): nothing new to set up, and
 * whoever holds that key can read every card anyway. Rotating it only means
 * a link already on can't be shown again: `shownAgain` sees its hash no
 * longer matches, and the sheet offers to make a new one. So does a link
 * made before Step 229, from random bytes.
 */
const LABEL = "ancestree:card-link:v1:";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;

function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return key;
}

/** A link's token: 144 bits as URL-safe base64, the shape `/c/<token>` takes. */
export function cardLinkToken(linkId: string): string {
  return createHmac("sha256", secret())
    .update(LABEL + linkId)
    .digest("base64url")
    .slice(0, 24);
}

/** What the database keeps of a token: its sha256, as lower-case hex. */
export function cardLinkHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A new link for `make_card_link` / `make_card_personal_link`: its id, token and hash. */
export function newCardLink(): { id: string; token: string; hash: string } {
  const id = randomUUID();
  const token = cardLinkToken(id);
  return { id, token, hash: cardLinkHash(token) };
}

/**
 * The token of a live link the database answered (`card_public_link`,
 * `card_personal_link`: `{id, hash}`), when this server made it under the
 * key it holds now; null for anything else, so the sheet makes a new one.
 */
export function shownAgain(row: unknown): { id: string; token: string } | null {
  if (!row || typeof row !== "object") return null;
  const { id, hash } = row as Record<string, unknown>;
  if (typeof id !== "string" || !UUID.test(id) || typeof hash !== "string" || !HASH.test(hash)) {
    return null;
  }
  const token = cardLinkToken(id);
  const real = Buffer.from(cardLinkHash(token));
  const kept = Buffer.from(hash);
  return real.length === kept.length && timingSafeEqual(real, kept) ? { id, token } : null;
}
