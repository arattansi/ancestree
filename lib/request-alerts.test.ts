import { describe, expect, it } from "vitest";

import {
  ACCESS_REQUEST_ALERT_CAP,
  WAITLIST_ALERT_CAP,
  alertBudget,
  alertRecipients,
  askedAfresh,
} from "@/lib/request-alerts";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const cap = { perHour: 3, perDay: 5 };

describe("alertBudget", () => {
  it("emails about the first request", () => {
    expect(alertBudget([minutesAgo(0)], NOW, cap)).toEqual({ send: true, lastFor: null });
  });

  it("emails up to the hourly cap, and says so on the last one", () => {
    expect(alertBudget([minutesAgo(0), minutesAgo(10)], NOW, cap)).toEqual({
      send: true,
      lastFor: null,
    });
    expect(alertBudget([minutesAgo(0), minutesAgo(10), minutesAgo(50)], NOW, cap)).toEqual({
      send: true,
      lastFor: "hour",
    });
  });

  it("stays quiet past the hourly cap, though the request still counts", () => {
    expect(
      alertBudget([minutesAgo(0), minutesAgo(1), minutesAgo(2), minutesAgo(3)], NOW, cap),
    ).toEqual({ send: false, lastFor: null });
  });

  it("forgets requests older than an hour for the hourly cap", () => {
    expect(
      alertBudget([minutesAgo(0), minutesAgo(61), minutesAgo(62), minutesAgo(63)], NOW, cap),
    ).toEqual({ send: true, lastFor: null });
  });

  it("caps the day too, for a drip that stays under the hourly cap", () => {
    const hours = (n: number) => minutesAgo(n * 60 + 5);
    expect(alertBudget([minutesAgo(0), hours(2), hours(4), hours(6), hours(8)], NOW, cap)).toEqual({
      send: true,
      lastFor: "day",
    });
    expect(
      alertBudget([minutesAgo(0), hours(2), hours(4), hours(6), hours(8), hours(10)], NOW, cap),
    ).toEqual({ send: false, lastFor: null });
  });

  it("forgets requests older than a day", () => {
    const old = [25, 26, 27, 28, 29, 30].map((h) => minutesAgo(h * 60));
    expect(alertBudget([minutesAgo(0), ...old], NOW, cap)).toEqual({
      send: true,
      lastFor: null,
    });
  });

  it("counts a row that looks a moment younger than now, as clocks differ", () => {
    const ahead = new Date(NOW.getTime() + 2_000).toISOString();
    expect(alertBudget([ahead, minutesAgo(5), minutesAgo(9)], NOW, cap)).toEqual({
      send: true,
      lastFor: "hour",
    });
  });

  it("skips a timestamp it can't read", () => {
    expect(alertBudget(["not a date", minutesAgo(0)], NOW, cap)).toEqual({
      send: true,
      lastFor: null,
    });
  });

  it("emails when it sees no rows at all, rather than stay quiet by mistake", () => {
    expect(alertBudget([], NOW, cap)).toEqual({ send: true, lastFor: null });
  });

  it("holds the caps the forms use", () => {
    const arrivals = (n: number) => Array.from({ length: n }, (_, i) => minutesAgo(i));
    expect(alertBudget(arrivals(5), NOW, ACCESS_REQUEST_ALERT_CAP)).toEqual({
      send: true,
      lastFor: "hour",
    });
    expect(alertBudget(arrivals(6), NOW, ACCESS_REQUEST_ALERT_CAP).send).toBe(false);
    expect(alertBudget(arrivals(10), NOW, WAITLIST_ALERT_CAP)).toEqual({
      send: true,
      lastFor: "hour",
    });
    expect(alertBudget(arrivals(11), NOW, WAITLIST_ALERT_CAP).send).toBe(false);
  });
});

describe("alertRecipients", () => {
  it("emails each address once, whatever its case", () => {
    expect(
      alertRecipients(["Root@Example.com", "root@example.com ", "other@example.com"]),
    ).toEqual(["root@example.com", "other@example.com"]);
  });

  it("drops blanks and anything that isn't an address", () => {
    expect(alertRecipients([null, undefined, "", "   ", "no-at-sign"])).toEqual([]);
  });
});

describe("askedAfresh", () => {
  it("is a new ask only when nothing was pending before", () => {
    expect(askedAfresh("none", "pending")).toBe(true);
  });

  it("isn't a second press, an approval or a founded tree", () => {
    expect(askedAfresh("pending", "pending")).toBe(false);
    expect(askedAfresh("approved", "approved")).toBe(false);
    expect(askedAfresh("founded", "founded")).toBe(false);
    expect(askedAfresh("none", "approved")).toBe(false);
  });

  it("stays quiet when where it stood before is unknown", () => {
    expect(askedAfresh(null, "pending")).toBe(false);
    expect(askedAfresh(undefined, "pending")).toBe(false);
  });
});
