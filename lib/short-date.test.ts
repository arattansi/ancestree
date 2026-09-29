import { describe, expect, it } from "vitest";

import { shortDate } from "@/lib/short-date";

describe("shortDate (Step 77.4)", () => {
  it("spells the day out the same in every browser", () => {
    expect(shortDate("2026-09-23T10:00:00Z")).toBe("23 Sep 2026");
    expect(shortDate(new Date("2026-01-05T00:00:00Z"))).toBe("5 Jan 2026");
  });

  it("reads the day in UTC, as the server draws it", () => {
    // Evening in Vancouver, already the next day in UTC.
    expect(shortDate("2026-09-23T23:30:00-07:00")).toBe("24 Sep 2026");
  });

  it("says nothing for a date it can't read", () => {
    expect(shortDate("not a date")).toBe("");
  });
});
