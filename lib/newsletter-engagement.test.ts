import { describe, expect, it } from "vitest";

import {
  clickedShare,
  openedShare,
  readNewsletterEngagement,
  sectionTotals,
} from "@/lib/newsletter-engagement";

describe("readNewsletterEngagement", () => {
  it("reads what newsletter_engagement() answers", () => {
    expect(
      readNewsletterEngagement({
        counted_from: "2026-11-01",
        issues: [
          {
            day: "2026-11-08",
            sent: 24,
            clicked: 9,
            by_section: { cards: 5, open: 4 },
            counting: 6,
            opened: 4,
          },
          { day: "2026-11-01", sent: 22, clicked: 0, by_section: {} },
        ],
      }),
    ).toEqual({
      countedFrom: "2026-11-01",
      issues: [
        {
          day: "2026-11-08",
          sent: 24,
          clicked: 9,
          bySection: { cards: 5, open: 4 },
          counting: 6,
          opened: 4,
        },
        // An answer from before opens were counted has none.
        { day: "2026-11-01", sent: 22, clicked: 0, bySection: {}, counting: 0, opened: 0 },
      ],
    });
  });

  it("answers nothing counted for an empty week, and null for what isn't an answer", () => {
    expect(readNewsletterEngagement({ counted_from: null, issues: [] })).toEqual({
      countedFrom: null,
      issues: [],
    });
    expect(readNewsletterEngagement(null)).toBeNull();
    expect(readNewsletterEngagement({})).toBeNull();
    expect(readNewsletterEngagement("x")).toBeNull();
  });

  it("drops an issue without a real day, a block it doesn't know and counts that aren't", () => {
    const read = readNewsletterEngagement({
      counted_from: "soon",
      issues: [
        { day: "nope", sent: 3, clicked: 1, by_section: {} },
        { day: "2026-11-08", sent: -4, clicked: "2", by_section: { sidebar: 3, story: 2.5, news: 1 } },
      ],
    });
    expect(read).toEqual({
      countedFrom: null,
      issues: [
        { day: "2026-11-08", sent: 0, clicked: 0, bySection: { news: 1 }, counting: 0, opened: 0 },
      ],
    });
  });
});

describe("clickedShare", () => {
  it("is the share of those sent, rounded", () => {
    expect(clickedShare({ sent: 24, clicked: 9 })).toBe("38%");
    expect(clickedShare({ sent: 3, clicked: 0 })).toBe("0%");
  });

  it("is a dash before any were sent, and never over 100%", () => {
    expect(clickedShare({ sent: 0, clicked: 0 })).toBe("–");
    expect(clickedShare({ sent: 2, clicked: 5 })).toBe("100%");
  });
});

describe("openedShare", () => {
  it("is the share of the copies counting that were opened, rounded", () => {
    expect(openedShare({ counting: 5, opened: 3 })).toBe("60%");
    expect(openedShare({ counting: 3, opened: 0 })).toBe("0%");
  });

  it("is a dash with none counting, and never over 100%", () => {
    expect(openedShare({ counting: 0, opened: 0 })).toBe("–");
    expect(openedShare({ counting: 2, opened: 9 })).toBe("100%");
  });
});

describe("sectionTotals", () => {
  it("adds each block over the issues, the most first, leaving out any nobody opened", () => {
    expect(
      sectionTotals([
        { day: "2026-11-08", sent: 24, clicked: 9, bySection: { cards: 5, open: 4 }, counting: 0, opened: 0 },
        { day: "2026-11-01", sent: 22, clicked: 6, bySection: { open: 3, story: 3 }, counting: 0, opened: 0 },
      ]),
    ).toEqual([
      { section: "open", label: "Open my family tree", members: 7 },
      { section: "cards", label: "Birthday cards", members: 5 },
      { section: "story", label: "Stories", members: 3 },
    ]);
  });

  it("is empty with nothing opened", () => {
    expect(sectionTotals([])).toEqual([]);
  });
});
