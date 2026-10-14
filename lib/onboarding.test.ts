import { describe, expect, it } from "vitest";

import {
  churnBand,
  daysAway,
  daysBetween,
  nextStep,
  pickOnboardingEmail,
  type OnboardingKind,
  type OnboardingSignals,
} from "@/lib/onboarding";

/** 15:00 UTC on a day, as the cron job calls. */
const at = (day: string) => new Date(`${day}T15:00:00Z`);
const sent = (step: OnboardingKind, day: string) => ({
  step,
  sent_at: `${day}T15:00:05Z`,
});

/** Started 1 Oct, active today (20 Oct), every step still to take. */
function member(over: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    started_at: "2026-10-01T15:00:00Z",
    last_active: "2026-10-20",
    claimable: 3,
    people_added: 5,
    invited: false,
    shared: false,
    sends: [],
    ...over,
  };
}

const TODAY = at("2026-10-20");
const pick = (s: OnboardingSignals, opts: { newsletterDay?: boolean; test?: boolean } = {}) =>
  pickOnboardingEmail(s, { now: TODAY, newsletterDay: false, ...opts });

describe("days and bands", () => {
  it("counts whole UTC days", () => {
    expect(daysBetween("2026-10-01", "2026-10-20")).toBe(19);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
  });

  it("counts days away from the last active day, or the start if never", () => {
    expect(daysAway(member({ last_active: "2026-10-17" }), "2026-10-20")).toBe(3);
    expect(daysAway(member({ last_active: null }), "2026-10-20")).toBe(19);
  });

  it("bands by days away", () => {
    expect([0, 2, 3, 6, 7, 20, 21, 45].map(churnBand)).toEqual([
      "engaged",
      "engaged",
      "cooling",
      "cooling",
      "at_risk",
      "at_risk",
      "lapsed",
      "lapsed",
    ]);
  });
});

describe("the next step", () => {
  it("asks to invite the people they added first", () => {
    expect(nextStep(member(), "2026-10-20")).toEqual({
      step: "claim",
      reminder: false,
      waiting: false,
    });
  });

  it("reminds once about claiming, a week after the first", () => {
    const first = member({ sends: [sent("claim", "2026-10-15")] });
    expect(nextStep(first, "2026-10-20")).toEqual({
      step: "claim",
      reminder: true,
      waiting: true,
    });
    expect(nextStep(first, "2026-10-22")).toEqual({
      step: "claim",
      reminder: true,
      waiting: false,
    });
    const twice = member({
      sends: [sent("claim", "2026-10-05"), sent("claim", "2026-10-12")],
    });
    expect(nextStep(twice, "2026-10-20")?.step).toBe("invite");
  });

  it("moves past claiming once nobody is left to invite", () => {
    expect(nextStep(member({ claimable: 0 }), "2026-10-20")?.step).toBe("invite");
  });

  it("asks to invite family until they've made any invite", () => {
    const s = member({ claimable: 0, invited: true });
    expect(nextStep(s, "2026-10-20")?.step).toBe("story");
    expect(
      nextStep(member({ claimable: 0, sends: [sent("invite", "2026-10-02")] }), "2026-10-20")
        ?.step,
    ).toBe("story");
  });

  it("asks for close family under three added", () => {
    const s = member({ claimable: 0, invited: true, people_added: 2 });
    expect(nextStep(s, "2026-10-20")?.step).toBe("family");
    expect(nextStep({ ...s, people_added: 3 }, "2026-10-20")?.step).toBe("story");
  });

  it("asks for a story or photos last, and is done after", () => {
    const s = member({ claimable: 0, invited: true });
    expect(nextStep(s, "2026-10-20")?.step).toBe("story");
    expect(nextStep({ ...s, shared: true }, "2026-10-20")).toBeNull();
    expect(nextStep({ ...s, sends: [sent("story", "2026-10-10")] }, "2026-10-20")).toBeNull();
  });

  it("asks about claiming again for people added since", () => {
    const s = member({
      invited: true,
      shared: true,
      sends: [sent("claim", "2026-10-03")],
    });
    expect(nextStep(s, "2026-10-20")).toEqual({
      step: "claim",
      reminder: true,
      waiting: false,
    });
  });
});

describe("today's email", () => {
  it("sends an engaged member their next step", () => {
    expect(pick(member())).toEqual({
      kind: "claim",
      step: "claim",
      reminder: false,
      band: "engaged",
    });
  });

  it("waits a day after the drip starts", () => {
    expect(pick(member({ started_at: "2026-10-20T09:00:00Z" }))).toMatchObject({
      kind: null,
      hold: "too soon",
    });
    expect(pick(member({ started_at: "2026-10-19T23:00:00Z" })).kind).toBe("claim");
  });

  it("ends 60 days in", () => {
    expect(pick(member({ started_at: "2026-08-21T15:00:00Z" }))).toMatchObject({
      kind: null,
      hold: "over",
    });
    expect(pick(member({ started_at: "2026-08-22T15:00:00Z" })).kind).toBe("claim");
  });

  it("never goes on the newsletter's day", () => {
    expect(pick(member(), { newsletterDay: true })).toMatchObject({
      kind: null,
      hold: "newsletter day",
    });
  });

  it("never goes twice in a day", () => {
    expect(pick(member({ sends: [sent("invite", "2026-10-20")] }))).toMatchObject({
      kind: null,
      hold: "sent today",
    });
  });

  it("stops once every step is taken", () => {
    expect(
      pick(member({ claimable: 0, invited: true, shared: true })),
    ).toMatchObject({ kind: null, hold: "done" });
  });

  it("writes to an engaged member at most once a week", () => {
    const s = (day: string) =>
      member({ claimable: 0, sends: [sent("claim", day)] });
    expect(pick(s("2026-10-14"))).toMatchObject({ kind: null, hold: "not yet" });
    expect(pick(s("2026-10-13"))).toMatchObject({ kind: "invite", band: "engaged" });
  });

  it("writes to a cooling member every three days", () => {
    const s = (day: string) =>
      member({ last_active: "2026-10-16", claimable: 0, sends: [sent("claim", day)] });
    expect(pick(s("2026-10-18"))).toMatchObject({ kind: null, hold: "not yet", band: "cooling" });
    expect(pick(s("2026-10-17"))).toMatchObject({ kind: "invite", band: "cooling" });
  });

  it("holds the claim reminder until its week is up, sending nothing else", () => {
    const s = member({ last_active: "2026-10-16", sends: [sent("claim", "2026-10-15")] });
    expect(pick(s)).toMatchObject({ kind: null, hold: "waiting" });
    expect(
      pickOnboardingEmail(s, { now: at("2026-10-22"), newsletterDay: false }),
    ).toMatchObject({ kind: "claim", reminder: true });
  });

  it("wins back an at-risk member once an absence, with their next step", () => {
    const away = member({ last_active: "2026-10-10", sends: [sent("claim", "2026-10-09")] });
    expect(pick(away)).toEqual({
      kind: "winback",
      step: "claim",
      reminder: true,
      band: "at_risk",
    });
    const wonBack = { ...away, sends: [...away.sends, sent("winback", "2026-10-17")] };
    expect(pick(wonBack)).toMatchObject({ kind: null, hold: "away" });
  });

  it("wins them back again after they come and go", () => {
    const s = member({
      last_active: "2026-10-12",
      sends: [sent("winback", "2026-10-08")],
    });
    expect(pick(s)).toMatchObject({ kind: "winback", band: "at_risk" });
  });

  it("keeps the gap before a win-back", () => {
    const s = member({ last_active: "2026-10-10", sends: [sent("claim", "2026-10-19")] });
    expect(pick(s)).toMatchObject({ kind: null, hold: "not yet" });
  });

  it("sends a lapsed member one last email at 30 days away, then nothing", () => {
    const s = (lastActive: string, sends = [sent("winback", "2026-10-01")]) =>
      member({ started_at: "2026-09-01T15:00:00Z", last_active: lastActive, sends });
    expect(pick(s("2026-09-25"))).toMatchObject({ kind: null, hold: "away", band: "lapsed" });
    expect(pick(s("2026-09-20"))).toMatchObject({ kind: "last", band: "lapsed" });
    expect(
      pick(s("2026-09-20", [sent("winback", "2026-10-01"), sent("last", "2026-10-19")])),
    ).toMatchObject({ kind: null, hold: "away" });
  });

  it("sends a member away a month when the drip starts the last email", () => {
    const s = member({ started_at: "2026-10-14T15:00:00Z", last_active: "2026-09-10" });
    expect(pick(s)).toMatchObject({ kind: "last", step: "claim", band: "lapsed" });
  });

  it("has no win-back once every step is taken", () => {
    const s = member({ last_active: "2026-10-10", claimable: 0, invited: true, shared: true });
    expect(pick(s)).toMatchObject({ kind: null, hold: "done" });
  });

  describe("a test send", () => {
    it("ignores the timing", () => {
      const s = member({ started_at: "2026-10-20T09:00:00Z", sends: [sent("claim", "2026-10-20")] });
      expect(pick(s, { test: true, newsletterDay: true })).toMatchObject({
        kind: "claim",
        reminder: true,
      });
    });

    it("picks the email their band calls for", () => {
      expect(pick(member({ last_active: "2026-10-10" }), { test: true }).kind).toBe("winback");
      expect(pick(member({ last_active: "2026-09-10" }), { test: true }).kind).toBe("last");
    });
  });
});
