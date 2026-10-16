/**
 * A plain invite that names someone already on the tree (Step 162): typed
 * by first and last name, exactly as one living entry nobody is behind has
 * them, the inviter is asked "Is this Leila Haddad, b. 1961?" before it
 * goes. Yes sends an invite to claim that entry instead, so they arrive as
 * it rather than beside it; no sends the plain one. Pure;
 * `invite-matches.server.ts` reads the tree and asks the database which
 * entries the inviter may hand over.
 */

import { personDisplayName, personHasDied } from "@/lib/person-name";

/** An entry a plain invite's name may be, as its card shows it. */
export type MatchCard = {
  id: string;
  first_name: string | null;
  preferred_name: string | null;
  last_name: string;
  maiden_name?: string | null;
  is_deceased: boolean;
  date_of_death: string | null;
  date_of_birth: string | null;
  placeholder_number?: number | null;
  /** A card the browser draws blurred: no name to match. */
  blurred?: boolean;
};

/** The entry an invite's name matched, for the question. */
export type InviteMatch = {
  id: string;
  name: string;
  /** The year they were born, when the card shows it. */
  bornYear: number | null;
};

/** The inviter's answer about one row's match, sent back with the row. */
export type MatchAnswer = {
  entryId: string;
  /** Yes: invite them to claim it. No: the plain invite. */
  isThem: boolean;
};

/** A name as two names are compared: case, accents' forms and spacing aside. */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * The living entries, no placeholder, whose first name (or the name they
 * go by) and last name (or maiden name) are exactly `firstName` and
 * `lastName`.
 */
export function entriesNamed(
  cards: readonly MatchCard[],
  firstName: string,
  lastName: string,
): MatchCard[] {
  const first = nameKey(firstName);
  const last = nameKey(lastName);
  if (!first || !last) return [];
  return cards.filter(
    (c) =>
      !c.blurred &&
      c.placeholder_number == null &&
      !personHasDied(c) &&
      (nameKey(c.first_name) === first || nameKey(c.preferred_name) === first) &&
      (nameKey(c.last_name) === last || nameKey(c.maiden_name) === last),
  );
}

/** A card as the question names it. */
export function inviteMatchOf(card: MatchCard): InviteMatch {
  return {
    id: card.id,
    name: personDisplayName(card),
    bornYear: card.date_of_birth ? Number(card.date_of_birth.slice(0, 4)) : null,
  };
}

/** "Is this Leila Haddad, b. 1961?" */
export function matchQuestion(match: InviteMatch): string {
  return `Is this ${match.name}${match.bornYear ? `, b. ${match.bornYear}` : ""}?`;
}

/**
 * Whether a row's name still needs asking about: it matched `match`, and
 * the inviter hasn't answered about that entry. A yes is never asked
 * again, whatever the name matches now: claiming checks the entry itself.
 */
export function needsAsking(
  match: InviteMatch | null,
  answer: MatchAnswer | null | undefined,
): boolean {
  if (answer?.isThem) return false;
  return !!match && answer?.entryId !== match.id;
}
