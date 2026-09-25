/**
 * The family link (Step 52): one open invite a Root drops into a family
 * group chat. Whoever opens it joins as a Leaf, up to its cap; rotating it
 * gives a fresh link and a fresh count, and the old one stops working. See
 * supabase/migrations/20260925150000_family_link.sql.
 */

/**
 * How many may join through one link before it must be rotated.
 * `private.family_link_max_uses()` and the `invites_family_link_cap` check
 * must agree.
 */
export const FAMILY_LINK_MAX_USES = 20;

/** Every cap a Root may pick, smallest first. */
export const FAMILY_LINK_CAPS: readonly number[] = Array.from(
  { length: FAMILY_LINK_MAX_USES },
  (_, i) => i + 1,
);

/** A cap from a form or a client, or `null` when it isn't one. */
export function parseFamilyLinkCap(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return n >= 1 && n <= FAMILY_LINK_MAX_USES ? n : null;
}

/** Nobody else can join through it until it's rotated or its cap raised. */
export function isFamilyLinkFull(link: { useCount: number; maxUses: number }): boolean {
  return link.useCount >= link.maxUses;
}

/** "3 of 20 joined", as the link's card and the Roots' notices count. */
export function familyLinkCount(link: { useCount: number; maxUses: number }): string {
  return `${link.useCount} of ${link.maxUses} joined`;
}

/** The message a Root sends with the link, ready for a group chat. */
export function familyLinkMessage(url: string, treeName: string): string {
  return `Join ${treeName} on ancestree: ${url}`;
}

/** Opens WhatsApp (the app, or WhatsApp Web) with the message ready to send. */
export function whatsappShareHref(url: string, treeName: string): string {
  return `https://wa.me/?text=${encodeURIComponent(familyLinkMessage(url, treeName))}`;
}
