/**
 * Asking a relative who's on ancestree (Step 30.5): what request access
 * offers someone it couldn't find on a tree. They type a relative's
 * address; if it belongs to a member, that member is emailed an invite
 * already filled in with the newcomer's name and email
 * (`lib/invite-relays.server.ts`), which one tap on their account page
 * sends. Whether the address belongs to anyone is never said: the screen
 * answers every ask the same way, and an ask past a cap is dropped without
 * a word.
 */

import { isEmailAddress } from "@/lib/request-forms";

/** At most this many asks in each span. */
export type RelayCaps = {
  /**
   * From one address: a newcomer who knows a few relatives' addresses, not
   * someone working through a list. The address is typed rather than
   * proven, so this alone can't protect a member; the next cap does.
   */
  perRequester: { perDay: number };
  /**
   * To one member, however many addresses ask: never a flood. A family
   * rarely needs more than one in a week.
   */
  perRecipient: { perDay: number; perWeek: number };
  /** Every ask on the site, well inside the mail provider's daily quota. */
  overall: { perHour: number; perDay: number };
};

export const RELAY_CAPS: RelayCaps = {
  perRequester: { perDay: 3 },
  perRecipient: { perDay: 2, perWeek: 5 },
  overall: { perHour: 10, perDay: 30 },
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** How far back each count looks, for the queries that feed it. */
export const RELAY_SPAN_MS = { hour: HOUR_MS, day: DAY_MS, week: WEEK_MS } as const;

/** When asks were filed (`created_at`), the one being judged included. */
export type RelayArrivals = {
  /** From the address asking. */
  fromRequester: readonly string[];
  /** To the member it would go to. */
  toRecipient: readonly string[];
  /** Every ask on the site. */
  overall: readonly string[];
};

function countWithin(arrivals: readonly string[], now: Date, spanMs: number): number {
  let count = 0;
  for (const at of arrivals) {
    const age = now.getTime() - Date.parse(at);
    if (Number.isNaN(age)) continue;
    // Clocks differ a little between here and the database, so a row can
    // look a moment younger than now: it still counts.
    if (age < spanMs) count += 1;
  }
  return count;
}

/**
 * Whether an ask stays within every cap, counting it with the ones filed
 * before it. Counted from rows rather than a tally kept in memory, since
 * each ask may be served by a different server — and after it's filed, so
 * two asks at once can't both slip under a cap: each counts the other.
 */
export function relayWithinCaps(
  arrivals: RelayArrivals,
  now: Date,
  caps: RelayCaps = RELAY_CAPS,
): boolean {
  return (
    countWithin(arrivals.fromRequester, now, DAY_MS) <= caps.perRequester.perDay &&
    countWithin(arrivals.toRecipient, now, DAY_MS) <= caps.perRecipient.perDay &&
    countWithin(arrivals.toRecipient, now, WEEK_MS) <= caps.perRecipient.perWeek &&
    countWithin(arrivals.overall, now, HOUR_MS) <= caps.overall.perHour &&
    countWithin(arrivals.overall, now, DAY_MS) <= caps.overall.perDay
  );
}

/** The relative's address as typed: trimmed and lower-cased, as the newcomer's is. */
export function readRelativeEmail(formData: FormData): string {
  return String(formData.get("relativeEmail") ?? "").trim().toLowerCase();
}

/**
 * What's wrong with the relative's address, in the words the form shows;
 * `null` when nothing is. Only the typing is judged: whether it belongs to
 * a member is never said.
 */
export function relativeEmailProblem(
  relativeEmail: string,
  ownEmail: string,
): string | null {
  if (!isEmailAddress(relativeEmail)) return "Enter your relative’s email address.";
  if (relativeEmail === ownEmail.trim().toLowerCase()) {
    return "That’s your own address. Enter your relative’s.";
  }
  return null;
}

/** What the form says before anything is sent: whose details go where. */
export const RELAY_NOTE =
  "If someone in your family is already on ancestree, we’ll pass your name and email on to them, so they can invite you. For their privacy, we won’t say whether they’re on ancestree.";

/** The answer to every ask, whoever the address belongs to. */
export function relayAnswer(ownEmail: string): string {
  return `If they’re on ancestree, we’ve passed your request on. If they know you, their invite will come to ${ownEmail}.`;
}

/** Said before the waitlist's button: a new tree is no way into the family's own. */
export const NEW_TREE_STARTS_EMPTY =
  "A new tree starts empty. If your family is already on ancestree, ask them to invite you instead.";

/**
 * The member's way in, from the email: their account's settings, where the
 * invite waits filled in. Only the ask's id is in the address; what the
 * newcomer typed is loaded there, for that member alone.
 */
export function relayHref(relayId: string): string {
  return `/account?${new URLSearchParams({ view: "settings", relay: relayId })}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ask `relayHref` named, read back from the address; anything else is dropped. */
export function readRelayParam(raw: unknown): string | null {
  return typeof raw === "string" && UUID.test(raw) ? raw.toLowerCase() : null;
}

/** When the ask a member opens, or answers, isn't waiting any more. */
export const RELAY_ANSWERED = "That request has already been answered.";
