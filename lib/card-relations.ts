/**
 * How someone signing a birthday card through its link says they know the
 * person (Step 217.3): family, and how, or a friend. The same words the
 * database keeps (`card_signatures.relation`, `invite_requests.relation`).
 */

/** How a signer is family, as the link's form asks it: "you’re her …". */
export const CARD_FAMILY_RELATIONS = [
  "mother",
  "father",
  "sister",
  "brother",
  "daughter",
  "son",
  "wife",
  "husband",
  "partner",
  "grandmother",
  "grandfather",
  "granddaughter",
  "grandson",
  "aunt",
  "uncle",
  "niece",
  "nephew",
  "cousin",
  "in_law",
  "other_family",
] as const;
export type CardFamilyRelation = (typeof CARD_FAMILY_RELATIONS)[number];
export type CardRelation = CardFamilyRelation | "friend";

/** A relation's word in the form's list. */
export function relationLabel(relation: CardFamilyRelation): string {
  if (relation === "in_law") return "in-law";
  if (relation === "other_family") return "other family";
  return relation;
}

/** A relation the database keeps, or null. */
export function asCardRelation(value: unknown): CardRelation | null {
  if (value === "friend") return "friend";
  return (CARD_FAMILY_RELATIONS as readonly unknown[]).includes(value)
    ? (value as CardFamilyRelation)
    : null;
}
