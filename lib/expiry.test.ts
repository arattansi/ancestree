import { describe, expect, it } from "vitest";

import { expiresAfter, isExpired } from "@/lib/expiry";

describe("expiry (Step 77.4)", () => {
  const now = new Date("2026-09-29T12:00:00.000Z");

  it("counts the moment itself as lapsed, as the database does", () => {
    expect(isExpired("2026-09-29T12:00:00.000Z", now)).toBe(true);
    expect(isExpired("2026-09-29T11:59:59.999Z", now)).toBe(true);
    expect(isExpired("2026-09-29T12:00:00.001Z", now)).toBe(false);
    expect(isExpired(new Date("2026-09-30T00:00:00Z"), now)).toBe(false);
  });

  it("never lapses without a date", () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(undefined, now)).toBe(false);
  });

  it("dates a lapse whole days on", () => {
    expect(expiresAfter(14, now)).toBe("2026-10-13T12:00:00.000Z");
    expect(isExpired(expiresAfter(14, now), now)).toBe(false);
  });
});
