/**
 * The family link (Step 52): one open invite a Root drops into a family
 * group chat. Whoever opens it joins as a Leaf, up to its cap; rotating it
 * gives a fresh link and a fresh count, and the old one stops working. See
 * supabase/migrations/20260925150000_family_link.sql.
 */

import { ageFromBirth } from "@/lib/minors";
import { whatsappHref } from "@/lib/share-text";
import { isDefaultTreeName } from "@/lib/tree-names";

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

/**
 * The message a Root sends with the link, ready for a group chat (Step
 * 212): what it is and what joining lets them do, in the Root's own voice.
 * A tree still on a default name is "our family tree", as an invite's
 * `treeInSentence` would have it.
 */
export function familyLinkMessage(url: string, treeName: string): string {
  const name = treeName.trim();
  return isDefaultTreeName(name)
    ? `Join our family tree on ancestree and add your side of the family: ${url}`
    : `Join ${name}, our family tree on ancestree, and add your side of the family: ${url}`;
}

/**
 * The message sent with someone's own link the moment they're added (Step
 * 214): a claim link, for a chat rather than an email, in the voice of
 * whoever added them. A tree still on a default name is "our family tree",
 * as `familyLinkMessage` has it.
 */
export function addedYouMessage(url: string, treeName: string): string {
  const name = treeName.trim();
  const tree = isDefaultTreeName(name) ? "our family tree" : name;
  return `I added you to ${tree} on ancestree. Tap to claim your entry and add your side of the family: ${url}`;
}

/**
 * Whether someone just added is offered their own link (Step 214): only
 * the living, and not a child known to be under 18 (Step 98). Who may
 * make the link is the database's to say (`makeClaimLink`).
 */
export function offersTheirLink(person: {
  is_deceased: boolean;
  date_of_birth?: string | null;
}): boolean {
  return !person.is_deceased && ageFromBirth(person.date_of_birth) !== "minor";
}

/**
 * Which invites say someone has invited family, as a PostgREST `or`
 * filter on `invites` (Step 212): every one but a family link nobody has
 * joined through, which the founder's invite step makes without being
 * asked. Whoever joins through it counts through `invited_by_user_id`,
 * as `onboarding_due` reads it. A claim link counts once it's made, sent
 * or not (Aalim, Step 214): it's made only when someone asks for it.
 */
export const COUNTS_AS_INVITED = "max_uses.is.null,use_count.gt.0";

/** Opens WhatsApp (the app, or WhatsApp Web) with the message ready to send. */
export function whatsappShareHref(url: string, treeName: string): string {
  return whatsappHref(familyLinkMessage(url, treeName));
}
