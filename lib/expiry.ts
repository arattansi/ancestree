/**
 * When something that lapses has lapsed (Step 77.4, audit R4): invites,
 * share links, a relay's ask. One boundary everywhere, the database's — a
 * row counts as live only while `expires_at > now()` — so the page never
 * offers what the database has already refused.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether something that lapses at `expiresAt` has lapsed by `now`: at the
 * moment itself, it has. No date is no expiry.
 */
export function isExpired(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return at.getTime() <= now.getTime();
}

/** When something made `now` lapses, `days` later, as the database stores it. */
export function expiresAfter(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}
