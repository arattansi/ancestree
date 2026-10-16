/**
 * An invite's link once it has expired (Step 163, audit W4): whoever holds
 * it may have a fresh one sent to the address it was for, at most once a
 * day, and whoever sent it is told. Pure; the database says which
 * (`lapsed_invite_preview`, `renew_invite`) and
 * `lib/invite-renewal.server.ts` sends it.
 */

import { treeInSentence } from "@/lib/tree-names";

/**
 * What an expired link's page offers (`lapsed_invite_preview.state`):
 * `open` a fresh link; `sent` one went today; `joined` the address is on the
 * tree already; `closed` nothing — whoever sent it has left the tree, or the
 * entry it names is spoken for, gone or has died.
 */
export type LapsedState = "open" | "sent" | "joined" | "closed";

export function lapsedState(state: string | null | undefined): LapsedState {
  return state === "open" || state === "sent" || state === "joined" ? state : "closed";
}

/**
 * How many are on the tree already, for its join page: a count, never
 * names, as anyone with the link may open it. Nothing when it's only
 * whoever sent it.
 */
export function relativesOnTree(members: number | null | undefined): string | null {
  if (!members || members < 2) return null;
  return `${members} relatives are on it already.`;
}

/**
 * The inviter's notice once a fresh link has gone (`invite_renewed`): who
 * it went to, by the name on its record, else the address the inviter
 * typed.
 */
export function inviteRenewedNotice(input: {
  name: string | null;
  email: string;
  treeName: string;
}): string {
  const who = input.name?.replace(/\s+/g, " ").trim() || input.email;
  return `${who}’s invite to ${treeInSentence(input.treeName)} had expired, so we emailed them a fresh link.`;
}
