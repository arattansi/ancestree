import { describe, expect, it } from "vitest";

import { CHANGELOG, changelogId, changelogUpdated } from "./changelog";

describe("CHANGELOG", () => {
  it("dates every entry as a real YYYY-MM-DD day", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(
        entry.date,
      );
    }
  });

  it("runs newest first", () => {
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("gives every entry its own anchor, a title and something it says", () => {
    const ids = CHANGELOG.map(changelogId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of CHANGELOG) {
      expect(entry.title.trim()).not.toBe("");
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it("anchors on the date and title", () => {
    expect(
      changelogId({ date: "2026-10-18", title: "a changelog", items: ["x"], steps: [] }),
    ).toBe("2026-10-18-a-changelog");
    expect(
      changelogId({ date: "2026-10-02", title: "why, what + how", items: ["x"], steps: [] }),
    ).toBe("2026-10-02-why-what-how");
  });

  it("is updated as of its newest entry", () => {
    expect(changelogUpdated()).toBe(CHANGELOG[0].date);
  });
});
