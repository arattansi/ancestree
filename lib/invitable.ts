/**
 * Who's still to be invited (Step 143): the living entries nobody is
 * behind yet, as `private.can_invite_to_claim_on` lets a Root hand them
 * over — the owner never moved away from whoever made it, no claim stuck,
 * it is no member's own, and they haven't died. The Root console lists
 * them, each with an email box and a link, and the weekly newsletter names
 * the reader's own relatives among them.
 *
 * A placeholder child (Step 98.2) is left out: a child under 18 comes in
 * through their parent. A basic card (Step 80) says nothing of who made it
 * or whether they're living, so it's for the caller to ask the database.
 * Pure; `invitable.server.ts` reads the tree.
 */

import { personDisplayName, personHasDied } from "@/lib/person-name";

/** What the rule reads off a full card. */
export type CandidateCard = {
  id: string;
  first_name: string | null;
  preferred_name: string | null;
  last_name: string;
  is_deceased: boolean;
  date_of_death: string | null;
  owner_user_id: string;
  created_by: string;
  placeholder_number?: number | null;
};

/**
 * Whether someone could still be invited to claim `card`: living, no
 * placeholder, and nobody behind it — `claimed` holds the entries with a
 * settled claim, `ownEntries` every member's own.
 */
export function isInvitable(
  card: CandidateCard,
  claimed: ReadonlySet<string>,
  ownEntries: ReadonlySet<string>,
): boolean {
  return (
    !personHasDied(card) &&
    card.placeholder_number == null &&
    card.owner_user_id === card.created_by &&
    !claimed.has(card.id) &&
    !ownEntries.has(card.id)
  );
}

/** Surname, then first name, as a list of family reads. */
export function byFamilyName(
  a: Pick<CandidateCard, "first_name" | "preferred_name" | "last_name">,
  b: Pick<CandidateCard, "first_name" | "preferred_name" | "last_name">,
): number {
  return (
    a.last_name.localeCompare(b.last_name) ||
    personDisplayName(a).localeCompare(personDisplayName(b))
  );
}
