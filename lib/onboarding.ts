/**
 * Getting started emails (Step 151): a drip that keeps new members going
 * and brings their family in, answering to how each one is using
 * ancestree (Aalim, 2026-10-13: "responsive to how a new user is using it,
 * based on churn risk").
 *
 * Churn risk is read from the days since they were last active
 * (`private.active_days`), and sets how often they hear from us:
 *   - engaged, 0–2 days away: at most one email a week;
 *   - cooling, 3–6 days: at most one every three days;
 *   - at risk, 7–20 days: one win-back an absence, telling what changed in
 *     their family since they left, with their next step;
 *   - lapsed, 21 days or more: one last email at 30 days away, then
 *     nothing until they come back.
 * What they hear is the first step they haven't taken:
 *   1. claim: invite the living people they added, whom nobody is behind
 *      yet, to claim their entries (one reminder, a week on);
 *   2. invite: invite family (a Root, the family link);
 *   3. family: fill in close family, under three added;
 *   4. story: a story or album photos.
 * Never on the newsletter's day, never twice in a day, never before the
 * day after it starts, and it ends 60 days in or once every step is
 * taken.
 *
 * Pure: `lib/onboarding.server.ts` reads each member's signals
 * (`onboarding_due`) and sends what this picks.
 */

/** The steps, in the order they're asked. */
export const ONBOARDING_STEPS = ["claim", "invite", "family", "story"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** An email of the drip: a step, or the win-back, or the last one. */
export type OnboardingKind = OnboardingStep | "winback" | "last";

export const ONBOARDING_KINDS: readonly OnboardingKind[] = [
  ...ONBOARDING_STEPS,
  "winback",
  "last",
];

export function isOnboardingKind(raw: unknown): raw is OnboardingKind {
  return typeof raw === "string" && (ONBOARDING_KINDS as readonly string[]).includes(raw);
}

export type ChurnBand = "engaged" | "cooling" | "at_risk" | "lapsed";

/** How long the drip runs from its start. */
export const DRIP_DAYS = 60;
/** Days away at which each band begins. */
export const COOLING_DAYS = 3;
export const AT_RISK_DAYS = 7;
export const LAPSED_DAYS = 21;
/** Days away at which a lapsed member gets the last email. */
export const LAST_EMAIL_DAYS = 30;
/** The fewest days between two emails, by band. */
export const ENGAGED_GAP_DAYS = 7;
export const GAP_DAYS = 3;
/** The claim email goes at most twice: the second a week after the first. */
export const CLAIM_SENDS = 2;
export const CLAIM_REMINDER_DAYS = 7;
/** Fewer added than this, and close family is still to fill in. */
export const CLOSE_FAMILY = 3;

/** An email of the drip already sent. */
export type OnboardingSend = { step: OnboardingKind; sent_at: string };

/** What a member has done, as `onboarding_due` reads it. */
export type OnboardingSignals = {
  /** When the drip first saw them: an ISO timestamp. */
  started_at: string;
  /** The last UTC day they used ancestree, `YYYY-MM-DD`. */
  last_active: string | null;
  /** Living entries they made that nobody is behind, with no live invite. */
  claimable: number;
  /** Entries they made, their own not counted. */
  people_added: number;
  /** They've made an invite of any kind. */
  invited: boolean;
  /** They've written a story or put up an album photo. */
  shared: boolean;
  /** Oldest first. */
  sends: readonly OnboardingSend[];
};

/** Why nothing goes today. */
export type OnboardingHold =
  /** The drip started today: the first email waits a day. */
  | "too soon"
  /** Its 60 days are up. */
  | "over"
  /** The newsletter goes today. */
  | "newsletter day"
  /** One went today already. */
  | "sent today"
  /** Every step is taken. */
  | "done"
  /** The claim reminder isn't due yet. */
  | "waiting"
  /** Too soon after the last one, for how active they are. */
  | "not yet"
  /** Away, and this absence's email has gone (or isn't due yet). */
  | "away";

export type OnboardingPick =
  | {
      kind: OnboardingKind;
      /** The step its button asks for: the email itself, or the win-back's. */
      step: OnboardingStep;
      /** The claim email's second time. */
      reminder: boolean;
      band: ChurnBand;
    }
  | { kind: null; band: ChurnBand | null; hold: OnboardingHold };

/** `YYYY-MM-DD` in UTC: the job runs on the server's clock. */
export function utcDay(at: Date | string): string {
  return (typeof at === "string" ? new Date(at) : at).toISOString().slice(0, 10);
}

/** Whole days from one `YYYY-MM-DD` to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Days since they were last active, or since the drip started if never. */
export function daysAway(s: Pick<OnboardingSignals, "last_active" | "started_at">, today: string): number {
  return Math.max(0, daysBetween(s.last_active ?? utcDay(s.started_at), today));
}

export function churnBand(away: number): ChurnBand {
  if (away >= LAPSED_DAYS) return "lapsed";
  if (away >= AT_RISK_DAYS) return "at_risk";
  if (away >= COOLING_DAYS) return "cooling";
  return "engaged";
}

/**
 * The first step they haven't taken, or null once every one is: `waiting`
 * when it's the claim reminder and a week hasn't passed since the first.
 */
export function nextStep(
  s: OnboardingSignals,
  today: string,
): { step: OnboardingStep; reminder: boolean; waiting: boolean } | null {
  const sent = (k: OnboardingKind) => s.sends.filter((x) => x.step === k);
  const claims = sent("claim");
  if (s.claimable > 0 && claims.length < CLAIM_SENDS) {
    const last = claims.at(-1);
    return {
      step: "claim",
      reminder: !!last,
      waiting: !!last && daysBetween(utcDay(last.sent_at), today) < CLAIM_REMINDER_DAYS,
    };
  }
  if (!s.invited && !sent("invite").length) {
    return { step: "invite", reminder: false, waiting: false };
  }
  if (s.people_added < CLOSE_FAMILY && !sent("family").length) {
    return { step: "family", reminder: false, waiting: false };
  }
  if (!s.shared && !sent("story").length) {
    return { step: "story", reminder: false, waiting: false };
  }
  return null;
}

/**
 * Today's email for one member, or why there's none. `test` (a test send
 * or a preview) skips the timing and picks what their band and next step
 * call for now.
 */
export function pickOnboardingEmail(
  s: OnboardingSignals,
  { now, newsletterDay, test = false }: { now: Date; newsletterDay: boolean; test?: boolean },
): OnboardingPick {
  const today = utcDay(now);
  const away = daysAway(s, today);
  const band = churnBand(away);
  const next = nextStep(s, today);
  const hold = (h: OnboardingHold): OnboardingPick => ({ kind: null, band, hold: h });

  if (test) {
    if (!next) return hold("done");
    const kind: OnboardingKind =
      band === "at_risk" ? "winback" : band === "lapsed" ? "last" : next.step;
    return { kind, step: next.step, reminder: next.reminder, band };
  }

  const sinceStart = daysBetween(utcDay(s.started_at), today);
  if (sinceStart < 1) return hold("too soon");
  if (sinceStart >= DRIP_DAYS) return hold("over");
  if (newsletterDay) return hold("newsletter day");
  const days = s.sends.map((x) => utcDay(x.sent_at));
  if (days.includes(today)) return hold("sent today");
  if (!next) return hold("done");

  const lastSent = days.at(-1);
  const gap = lastSent ? daysBetween(lastSent, today) : Infinity;
  // Sent since they were last here: this absence's.
  const thisAbsence = (kinds: readonly OnboardingKind[]) =>
    s.sends.some(
      (x) =>
        kinds.includes(x.step) &&
        (s.last_active === null || utcDay(x.sent_at) > s.last_active),
    );
  const step = { step: next.step, reminder: next.reminder, band };

  switch (band) {
    case "engaged":
    case "cooling":
      if (gap < (band === "engaged" ? ENGAGED_GAP_DAYS : GAP_DAYS)) return hold("not yet");
      if (next.waiting) return hold("waiting");
      return { kind: next.step, ...step };
    case "at_risk":
      if (thisAbsence(["winback", "last"])) return hold("away");
      if (gap < GAP_DAYS) return hold("not yet");
      return { kind: "winback", ...step };
    case "lapsed":
      if (away < LAST_EMAIL_DAYS || thisAbsence(["last"])) return hold("away");
      if (gap < GAP_DAYS) return hold("not yet");
      return { kind: "last", ...step };
  }
}
