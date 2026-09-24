/**
 * Asking a relative who's on ancestree (Step 30.5): what request access
 * offers someone it couldn't find on a tree. They type a relative's
 * address; if it belongs to a member who lets relatives ask (Step 41.5),
 * that member is emailed an invite already filled in with the newcomer's
 * name and email (`lib/invite-relays.server.ts`), which one tap on their
 * account page sends. Whether the address belongs to anyone is never said:
 * the screen answers every ask the same way, and an ask past a cap is
 * dropped without a word. An ask the member leaves unanswered lapses after
 * 30 days.
 */

import { isEmailAddress } from "@/lib/request-forms";

/** At most this many asks in each span. */
export type RelayCaps = {
  /**
   * From one address: a newcomer who knows a few relatives' addresses, not
   * someone working through a list. Every ask counts, whoever the address
   * belongs to (Step 41.5). The address is typed rather than proven, so
   * this alone can't protect a member; the next cap does.
   */
  perRequester: { perDay: number };
  /**
   * To one member, however many addresses ask: never a flood. A family
   * rarely needs more than one in a week.
   */
  perRecipient: { perDay: number; perWeek: number };
  /**
   * Every ask on the site, whoever the address belongs to (Step 41.5):
   * well inside the mail provider's daily quota, and a bound on how often
   * any address is looked up.
   */
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

/**
 * How long a note of an ask is kept (`invite_relay_asks`, Step 41.5): as
 * far back as the caps that count notes look, and no further. Older notes
 * are deleted as new asks come in.
 */
export const RELAY_NOTE_KEPT_MS = DAY_MS;

/** How long an ask waits for the member's answer before it lapses (Step 41.5). */
export const RELAY_LAPSE_DAYS = 30;
const LAPSE_MS = RELAY_LAPSE_DAYS * DAY_MS;

/**
 * When asks were noted (`invite_relay_asks`, `created_at`), the one being
 * judged included: every ask, whoever the address belongs to.
 */
export type AskArrivals = {
  /** From the address asking. */
  fromRequester: readonly string[];
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
 * Whether an ask stays within the caps on the address asking and on the
 * whole site, counting it with the asks noted before it (Step 41.5). It's
 * judged before anyone's address is looked up, so it can't depend on whose
 * the address is, and an ask past a cap looks nobody up. Counted from rows
 * rather than a tally kept in memory, since each ask may be served by a
 * different server, and after the ask is noted, so two asks at once can't
 * both slip under a cap: each counts the other.
 */
export function askWithinCaps(
  arrivals: AskArrivals,
  now: Date,
  caps: RelayCaps = RELAY_CAPS,
): boolean {
  return (
    countWithin(arrivals.fromRequester, now, DAY_MS) <= caps.perRequester.perDay &&
    countWithin(arrivals.overall, now, HOUR_MS) <= caps.overall.perHour &&
    countWithin(arrivals.overall, now, DAY_MS) <= caps.overall.perDay
  );
}

/**
 * Whether an ask filed for a member (`invite_relays`) stays within their
 * caps, counting it with the asks filed for them before it (`created_at`),
 * so however many addresses ask, a member is never flooded. Counted after
 * filing, for the same reason as above.
 */
export function memberWithinCaps(
  toRecipient: readonly string[],
  now: Date,
  caps: RelayCaps = RELAY_CAPS,
): boolean {
  return (
    countWithin(toRecipient, now, DAY_MS) <= caps.perRecipient.perDay &&
    countWithin(toRecipient, now, WEEK_MS) <= caps.perRecipient.perWeek
  );
}

/** When an ask filed at `createdAt` lapses if the member hasn't answered it (Step 41.5). */
export function relayLapsesAt(createdAt: string): Date {
  return new Date(Date.parse(createdAt) + LAPSE_MS);
}

/**
 * Whether an ask has lapsed: left pending for 30 days, it leaves the
 * member's card, can't be answered, and is deleted as new asks come in.
 * One whose date can't be read counts as lapsed, so it can't wait for ever.
 */
export function relayLapsed(createdAt: string, now: Date): boolean {
  const at = relayLapsesAt(createdAt).getTime();
  return Number.isNaN(at) || now.getTime() >= at;
}

/**
 * The `created_at` an ask must come after to be still waiting at `now`:
 * queries keep pending asks after it (`gt`), and the clean-up deletes the
 * pending ones at or before it (`lte`), in step with `relayLapsed`.
 */
export function relayLapseCutoff(now: Date): string {
  return new Date(now.getTime() - LAPSE_MS).toISOString();
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
  "We’ll pass your name and email on so they can invite you. For their privacy, we won’t say whether they’re here.";

/** The answer to every ask, whoever the address belongs to. */
export function relayAnswer(ownEmail: string): string {
  return `If they’re on ancestree, we’ve passed it on. Their invite will come to ${ownEmail}.`;
}

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

/**
 * When the ask a member opens, or answers, isn't waiting any more: it was
 * answered, or it lapsed (Step 41.5).
 */
export const RELAY_ANSWERED = `That request has already been answered, or it lapsed after ${RELAY_LAPSE_DAYS} days.`;

/**
 * The box on a member's account settings that lets asks reach them
 * (`profiles.relatives_can_ask`, Step 41.5), in its own words, which the
 * email and the privacy notice use to point to it.
 */
export const RELATIVES_CAN_ASK_LABEL = "Relatives can ask me to invite them";
