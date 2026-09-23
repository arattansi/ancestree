import { describe, expect, it } from "vitest";

import {
  NEW_TREE_STARTS_EMPTY,
  RELATIVES_CAN_ASK_LABEL,
  RELAY_ANSWERED,
  RELAY_CAPS,
  RELAY_LAPSE_DAYS,
  RELAY_NOTE,
  RELAY_NOTE_KEPT_MS,
  RELAY_SPAN_MS,
  askWithinCaps,
  memberWithinCaps,
  readRelativeEmail,
  readRelayParam,
  relativeEmailProblem,
  relayAnswer,
  relayHref,
  relayLapseCutoff,
  relayLapsed,
  relayLapsesAt,
  type AskArrivals,
} from "@/lib/invite-relays";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => minutesAgo(h * 60);
const daysAgo = (d: number) => hoursAgo(d * 24);
/** `n` asks, `step` minutes apart, the first just now. */
const asks = (n: number, step = 1) => Array.from({ length: n }, (_, i) => minutesAgo(i * step));

/** One ask just noted, with nothing before it, unless a count says otherwise. */
function arrivals(over: Partial<AskArrivals> = {}): AskArrivals {
  return {
    fromRequester: [minutesAgo(0)],
    overall: [minutesAgo(0)],
    ...over,
  };
}

describe("askWithinCaps (Steps 30.5, 41.5)", () => {
  it("passes on the first ask", () => {
    expect(askWithinCaps(arrivals(), NOW)).toBe(true);
  });

  it("lets one address ask three relatives a day, and drops the fourth", () => {
    expect(RELAY_CAPS.perRequester.perDay).toBe(3);
    expect(askWithinCaps(arrivals({ fromRequester: asks(3, 60) }), NOW)).toBe(true);
    expect(askWithinCaps(arrivals({ fromRequester: asks(4, 60) }), NOW)).toBe(false);
  });

  it("forgets an address's asks after a day", () => {
    const old = [daysAgo(1.1), daysAgo(1.5), daysAgo(2)];
    expect(askWithinCaps(arrivals({ fromRequester: [minutesAgo(0), ...old] }), NOW)).toBe(true);
  });

  it("caps the whole site at ten an hour and thirty a day", () => {
    expect(RELAY_CAPS.overall).toEqual({ perHour: 10, perDay: 30 });
    expect(askWithinCaps(arrivals({ overall: asks(10, 5) }), NOW)).toBe(true);
    expect(askWithinCaps(arrivals({ overall: asks(11, 5) }), NOW)).toBe(false);
    // Thirty spread over the day stay under the hourly cap, but not the daily one.
    expect(askWithinCaps(arrivals({ overall: asks(30, 45) }), NOW)).toBe(true);
    expect(askWithinCaps(arrivals({ overall: asks(31, 45) }), NOW)).toBe(false);
  });

  it("counts an ask that looks a moment younger than now, as clocks differ", () => {
    const ahead = new Date(NOW.getTime() + 2_000).toISOString();
    expect(
      askWithinCaps(arrivals({ fromRequester: [ahead, minutesAgo(5), minutesAgo(9), minutesAgo(0)] }), NOW),
    ).toBe(false);
  });

  it("skips a timestamp it can't read", () => {
    expect(
      askWithinCaps(arrivals({ fromRequester: ["not a date", "", minutesAgo(0)] }), NOW),
    ).toBe(true);
  });

  it("judges by the caps it's given", () => {
    const tight = {
      perRequester: { perDay: 1 },
      perRecipient: { perDay: 1, perWeek: 1 },
      overall: { perHour: 1, perDay: 1 },
    };
    expect(askWithinCaps(arrivals(), NOW, tight)).toBe(true);
    expect(askWithinCaps(arrivals({ overall: asks(2) }), NOW, tight)).toBe(false);
  });

  it("keeps a note only as long as a cap counts it", () => {
    // The longest span a note-counting cap looks back is a day.
    expect(RELAY_NOTE_KEPT_MS).toBe(RELAY_SPAN_MS.day);
  });
});

describe("memberWithinCaps (Steps 30.5, 41.5)", () => {
  it("passes on the first ask to a member", () => {
    expect(memberWithinCaps([minutesAgo(0)], NOW)).toBe(true);
  });

  it("never floods a member: two a day, however many addresses ask", () => {
    expect(RELAY_CAPS.perRecipient.perDay).toBe(2);
    expect(memberWithinCaps(asks(2, 30), NOW)).toBe(true);
    expect(memberWithinCaps(asks(3, 30), NOW)).toBe(false);
  });

  it("and five a week, for a drip that stays under the daily cap", () => {
    expect(RELAY_CAPS.perRecipient.perWeek).toBe(5);
    const week = (n: number) => [minutesAgo(0), ...Array.from({ length: n - 1 }, (_, i) => daysAgo(i + 1.2))];
    expect(memberWithinCaps(week(5), NOW)).toBe(true);
    expect(memberWithinCaps(week(6), NOW)).toBe(false);
  });

  it("forgets a member's asks after a week", () => {
    const old = [daysAgo(7.1), daysAgo(8), daysAgo(9), daysAgo(10), daysAgo(11)];
    expect(memberWithinCaps([minutesAgo(0), ...old], NOW)).toBe(true);
  });

  it("counts an ask that looks a moment younger than now, as clocks differ", () => {
    const ahead = new Date(NOW.getTime() + 2_000).toISOString();
    expect(memberWithinCaps([ahead, minutesAgo(5), minutesAgo(9)], NOW)).toBe(false);
  });

  it("skips a timestamp it can't read", () => {
    expect(memberWithinCaps(["not a date", "", minutesAgo(0)], NOW)).toBe(true);
  });
});

describe("an ask lapsing (Step 41.5)", () => {
  it("waits thirty days for the member's answer", () => {
    expect(RELAY_LAPSE_DAYS).toBe(30);
    expect(relayLapsesAt(daysAgo(0)).toISOString()).toBe("2026-10-23T12:00:00.000Z");
  });

  it("is still waiting until then, and lapsed from then on", () => {
    expect(relayLapsed(daysAgo(29.9), NOW)).toBe(false);
    expect(relayLapsed(daysAgo(30), NOW)).toBe(true);
    expect(relayLapsed(daysAgo(45), NOW)).toBe(true);
  });

  it("counts an ask whose date can't be read as lapsed, so it can't wait for ever", () => {
    expect(relayLapsed("not a date", NOW)).toBe(true);
  });

  it("gives queries the same line: waiting after the cutoff, lapsed at or before it", () => {
    const cutoff = relayLapseCutoff(NOW);
    expect(cutoff).toBe(daysAgo(30));
    // Just after the cutoff is waiting; the cutoff itself has lapsed.
    const justAfter = new Date(Date.parse(cutoff) + 1).toISOString();
    expect(relayLapsed(justAfter, NOW)).toBe(false);
    expect(relayLapsed(cutoff, NOW)).toBe(true);
  });
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("readRelativeEmail", () => {
  it("trims and lower-cases the address, as the newcomer's is", () => {
    expect(readRelativeEmail(form({ relativeEmail: "  Amina@Example.COM " }))).toBe(
      "amina@example.com",
    );
  });

  it("reads a missing field as empty", () => {
    expect(readRelativeEmail(new FormData())).toBe("");
  });
});

describe("relativeEmailProblem", () => {
  it("takes a plain address", () => {
    expect(relativeEmailProblem("amina@example.com", "zahra@example.com")).toBeNull();
  });

  it("asks for an address when there isn't one", () => {
    expect(relativeEmailProblem("", "zahra@example.com")).toBe(
      "Enter your relative’s email address.",
    );
    expect(relativeEmailProblem("amina", "zahra@example.com")).toBe(
      "Enter your relative’s email address.",
    );
    expect(relativeEmailProblem("amina@example", "zahra@example.com")).toBe(
      "Enter your relative’s email address.",
    );
  });

  it("refuses an address longer than any can be", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(relativeEmailProblem(long, "zahra@example.com")).toBe(
      "Enter your relative’s email address.",
    );
  });

  it("refuses their own address, however it's written", () => {
    expect(relativeEmailProblem("zahra@example.com", " Zahra@Example.com ")).toBe(
      "That’s your own address. Enter your relative’s.",
    );
  });
});

describe("what the newcomer is told", () => {
  it("says up front that their name and email are passed on", () => {
    expect(RELAY_NOTE).toContain("we’ll pass your name and email on to them");
    expect(RELAY_NOTE).toContain("we won’t say whether they’re on ancestree");
  });

  it("answers every ask the same way, never saying whether it reached anyone", () => {
    const answer = relayAnswer("zahra@example.com");
    expect(answer).toBe(
      "If they’re on ancestree, we’ve passed your request on. If they know you, their invite will come to zahra@example.com.",
    );
    // It depends on nothing but their own address.
    expect(relayAnswer("zahra@example.com")).toBe(answer);
  });

  it("says a new tree starts empty before offering the waitlist", () => {
    expect(NEW_TREE_STARTS_EMPTY).toMatch(/^A new tree starts empty\./);
    expect(NEW_TREE_STARTS_EMPTY).toContain("ask them to invite you instead");
  });
});

describe("relayHref / readRelayParam", () => {
  const ID = "6f1c2b3a-0000-4000-8000-000000000305";

  it("opens the account's settings on the ask, and carries nothing the newcomer typed", () => {
    expect(relayHref(ID)).toBe(`/account?view=settings&relay=${ID}`);
  });

  it("reads the ask's id back from the address", () => {
    expect(readRelayParam(ID)).toBe(ID);
    expect(readRelayParam(ID.toUpperCase())).toBe(ID);
  });

  it("drops anything that isn't one id", () => {
    expect(readRelayParam(undefined)).toBeNull();
    expect(readRelayParam("")).toBeNull();
    expect(readRelayParam("not-an-id")).toBeNull();
    expect(readRelayParam([ID, ID])).toBeNull();
    expect(readRelayParam(`${ID}&view=admin`)).toBeNull();
  });
});

describe("what the member is told (Step 41.5)", () => {
  it("says an ask that's gone was answered or lapsed", () => {
    expect(RELAY_ANSWERED).toBe(
      "That request has already been answered, or it lapsed after 30 days.",
    );
  });

  it("names the box that lets asks reach them in its own words", () => {
    expect(RELATIVES_CAN_ASK_LABEL).toBe("Relatives can ask me to invite them");
  });
});
