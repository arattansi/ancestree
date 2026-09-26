import { describe, expect, it } from "vitest";

import { NotedToday, utcDay } from "@/lib/active-days";

describe("utcDay (Step 56)", () => {
  it("is the UTC day, whatever the server's own zone", () => {
    expect(utcDay(new Date("2026-09-25T23:30:00-04:00"))).toBe("2026-09-26");
    expect(utcDay(new Date("2026-09-26T00:00:00Z"))).toBe("2026-09-26");
    expect(utcDay(new Date("2026-09-25T23:59:59Z"))).toBe("2026-09-25");
  });
});

describe("NotedToday (Step 56)", () => {
  it("notes a member once a day", () => {
    const noted = new NotedToday();
    expect(noted.claim("a", "2026-09-26")).toBe(true);
    expect(noted.claim("a", "2026-09-26")).toBe(false);
    expect(noted.claim("b", "2026-09-26")).toBe(true);
  });

  it("starts afresh the next day", () => {
    const noted = new NotedToday();
    noted.claim("a", "2026-09-26");
    expect(noted.claim("a", "2026-09-27")).toBe(true);
    expect(noted.claim("a", "2026-09-27")).toBe(false);
  });

  it("asks again about someone let go: signed in, not a member yet", () => {
    const noted = new NotedToday();
    noted.claim("a", "2026-09-26");
    noted.release("a");
    expect(noted.claim("a", "2026-09-26")).toBe(true);
  });
});
