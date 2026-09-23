/**
 * What account settings says about the ask the email's button named
 * (`relayHref`, Step 30.5) once it's no longer waiting. Sending or
 * dismissing it from its card refreshes that same address, so an ask the
 * member has just answered comes back here too (Step 41.1): when it's
 * theirs, the line says what they did with it rather than "already
 * answered". One still pending that isn't on the card has lapsed (Step
 * 41.5), and says so. Pure; `opened-relay.server.ts` reads the ask back.
 */

import { RELAY_ANSWERED, RELAY_LAPSE_DAYS, relayLapsed } from "@/lib/invite-relays";

/** The ask as its member reads it back, with the name of its tree. */
export type OpenedRelay = {
  status: string;
  firstName: string;
  lastName: string;
  /** The tree they were invited to; null when there's none, or it's gone. */
  treeName: string | null;
  /** When it was filed, to tell a lapsed ask (Step 41.5). */
  createdAt: string;
};

/**
 * The line for an ask no longer waiting: what the member did with it, that
 * it lapsed unanswered, or, for anything else — not theirs to read (signed
 * in as someone else) or gone — that it's been answered or lapsed.
 */
export function openedRelayNote(
  relay: OpenedRelay | null,
  now: Date = new Date(),
): string {
  if (!relay) return RELAY_ANSWERED;
  const name = `${relay.firstName} ${relay.lastName}`.trim();
  if (relay.status === "invited") {
    return relay.treeName
      ? `You’ve invited ${name} to ${relay.treeName}.`
      : `You’ve invited ${name}.`;
  }
  if (relay.status === "dismissed") {
    return `You’ve dismissed ${name}’s request. They aren’t told.`;
  }
  if (relay.status === "pending" && relayLapsed(relay.createdAt, now)) {
    return `${name}’s request lapsed after ${RELAY_LAPSE_DAYS} days without an answer.`;
  }
  return RELAY_ANSWERED;
}
