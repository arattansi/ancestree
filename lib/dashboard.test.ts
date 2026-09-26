import { describe, expect, it } from "vitest";

import {
  ACTIVITY_GROUPS,
  ACTIVITY_KINDS,
  addDays,
  againstWeekBefore,
  axisLabelOnPhone,
  countAxis,
  dayWithYear,
  headlineTiles,
  lastActiveLabel,
  percentOf,
  readDashboard,
  shortDay,
  weekRange,
  weekStart,
  weeksSinceFirstActivity,
  type DashboardWeek,
} from "@/lib/dashboard";

/** What `engagement_dashboard()` answers, as it came back from a rehearsal (names made up). */
const ANSWER = {
  today: "2026-09-26",
  members: 9,
  members_new: 6,
  active_7: 9,
  active_prev_7: 2,
  active_30: 9,
  entries: 101,
  entries_new: 73,
  weeks: [
    { end: "2026-09-26", active: 9, joined: 6, entries: 73 },
    { end: "2026-09-19", active: 2, joined: 0, entries: 0 },
    { end: "2026-09-12", active: 3, joined: 0, entries: 6 },
    { end: "2026-09-05", active: 3, joined: 3, entries: 22 },
    { end: "2026-08-29", active: 0, joined: 0, entries: 0 },
  ],
  progress: { own_entry: 8, added_relative: 5, invited: 1, came_back: 5 },
  activity: {
    entries: { last_7: 73, prev_7: 0, total: 101 },
    invites: { last_7: 4, prev_7: 1, total: 8 },
  },
  trees: [
    {
      id: "t1",
      name: "The Example Family",
      founded: "2026-08-30",
      members: 8,
      active_7: 8,
      entries: 68,
      added_7: 40,
      last_active: "2026-09-26",
    },
    {
      id: "t2",
      name: "Another Family",
      founded: "2026-09-23",
      members: 1,
      active_7: 1,
      entries: 33,
      added_7: 33,
      last_active: null,
    },
  ],
};

describe("readDashboard (Step 56)", () => {
  it("reads the headline counts", () => {
    const d = readDashboard(ANSWER);
    expect(d).toMatchObject({
      today: "2026-09-26",
      members: 9,
      membersNew: 6,
      active7: 9,
      activePrev7: 2,
      active30: 9,
      entries: 101,
      entriesNew: 73,
      progress: { ownEntry: 8, addedRelative: 5, invited: 1, cameBack: 5 },
    });
  });

  it("puts the weeks oldest first", () => {
    const d = readDashboard(ANSWER);
    expect(d?.weeks.map((w) => w.end)).toEqual([
      "2026-08-29",
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
      "2026-09-26",
    ]);
    expect(d?.weeks.at(-1)).toEqual({
      end: "2026-09-26",
      active: 9,
      joined: 6,
      entries: 73,
    });
  });

  it("reads a kind nothing has happened to as zeros", () => {
    const d = readDashboard(ANSWER);
    expect(d?.activity.entries).toEqual({ last7: 73, prev7: 0, total: 101 });
    expect(d?.activity.comments).toEqual({ last7: 0, prev7: 0, total: 0 });
    expect(Object.keys(d?.activity ?? {})).toEqual([...ACTIVITY_KINDS]);
  });

  it("reads each tree, with no last day when none is known", () => {
    const d = readDashboard(ANSWER);
    expect(d?.trees).toEqual([
      {
        id: "t1",
        name: "The Example Family",
        founded: "2026-08-30",
        members: 8,
        active7: 8,
        entries: 68,
        added7: 40,
        lastActive: "2026-09-26",
      },
      {
        id: "t2",
        name: "Another Family",
        founded: "2026-09-23",
        members: 1,
        active7: 1,
        entries: 33,
        added7: 33,
        lastActive: null,
      },
    ]);
  });

  it("is null for anything that isn't the dashboard", () => {
    expect(readDashboard(null)).toBeNull();
    expect(readDashboard("NOT_A_REVIEWER")).toBeNull();
    expect(readDashboard([])).toBeNull();
    expect(readDashboard({ members: 9 })).toBeNull();
    expect(readDashboard({ today: "yesterday" })).toBeNull();
  });

  it("reads a count that isn't one as nought, and drops rows it can't place", () => {
    const d = readDashboard({
      today: "2026-09-26",
      members: "9",
      active_7: -1,
      entries: 2.5,
      weeks: [{ end: "soon", active: 3 }, { end: "2026-09-26", active: null }],
      trees: [{ id: 7, name: "No id" }, { id: "t", name: "No founding day" }],
    });
    expect(d).toMatchObject({ members: 0, active7: 0, entries: 0, trees: [] });
    expect(d?.weeks).toEqual([
      { end: "2026-09-26", active: 0, joined: 0, entries: 0 },
    ]);
  });
});

describe("weeksSinceFirstActivity (Step 56)", () => {
  const week = (end: string, active = 0, joined = 0, entries = 0): DashboardWeek => ({
    end,
    active,
    joined,
    entries,
  });

  it("starts at the first week anything happened", () => {
    const weeks = [
      week("2026-08-22"),
      week("2026-08-29"),
      week("2026-09-05", 0, 0, 4),
      week("2026-09-12"),
      week("2026-09-19", 2),
    ];
    expect(weeksSinceFirstActivity(weeks).map((w) => w.end)).toEqual([
      "2026-09-05",
      "2026-09-12",
      "2026-09-19",
    ]);
  });

  it("keeps the newest week when nothing has happened", () => {
    expect(
      weeksSinceFirstActivity([week("2026-09-19"), week("2026-09-26")]),
    ).toEqual([week("2026-09-26")]);
  });
});

describe("countAxis (Step 56)", () => {
  it("steps in whole, round counts, about three above nought", () => {
    expect(countAxis([])).toEqual({ top: 1, ticks: [0, 1] });
    expect(countAxis([0, 0])).toEqual({ top: 1, ticks: [0, 1] });
    expect(countAxis([2])).toEqual({ top: 2, ticks: [0, 1, 2] });
    expect(countAxis([3, 2])).toEqual({ top: 3, ticks: [0, 1, 2, 3] });
    expect(countAxis([4])).toEqual({ top: 4, ticks: [0, 2, 4] });
    expect(countAxis([9, 2])).toEqual({ top: 10, ticks: [0, 5, 10] });
    expect(countAxis([11])).toEqual({ top: 15, ticks: [0, 5, 10, 15] });
    expect(countAxis([73])).toEqual({ top: 75, ticks: [0, 25, 50, 75] });
    expect(countAxis([101])).toEqual({ top: 150, ticks: [0, 50, 100, 150] });
  });

  it("puts the top at or above the tallest bar", () => {
    for (let tallest = 1; tallest <= 500; tallest += 1) {
      const { top, ticks } = countAxis([tallest]);
      expect(top).toBeGreaterThanOrEqual(tallest);
      expect(ticks.at(-1)).toBe(top);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(5);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });

  it("labels every column on a phone up to six, then every other from the newest", () => {
    expect([0, 1, 2, 3, 4, 5].every((i) => axisLabelOnPhone(i, 6))).toBe(true);
    const shown = Array.from({ length: 12 }, (_, i) => i).filter((i) =>
      axisLabelOnPhone(i, 12),
    );
    expect(shown).toEqual([1, 3, 5, 7, 9, 11]);
  });
});

describe("days (Step 56)", () => {
  it("steps across months and years", () => {
    expect(addDays("2026-09-26", -6)).toBe("2026-09-20");
    expect(addDays("2026-09-05", -6)).toBe("2026-08-30");
    expect(addDays("2027-01-02", -6)).toBe("2026-12-27");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("names a day and a week by its days", () => {
    expect(shortDay("2026-09-05")).toBe("5 Sep");
    expect(dayWithYear("2026-08-30")).toBe("30 Aug 2026");
    expect(weekStart("2026-09-26")).toBe("20 Sep");
    expect(weekRange("2026-09-26")).toBe("20–26 Sep");
    expect(weekRange("2026-09-05")).toBe("30 Aug – 5 Sep");
  });

  it("says when a tree's members were last on", () => {
    expect(lastActiveLabel("2026-09-26", "2026-09-26")).toBe("Today");
    expect(lastActiveLabel("2026-09-25", "2026-09-26")).toBe("Yesterday");
    expect(lastActiveLabel("2026-09-21", "2026-09-26")).toBe("21 Sep");
    expect(lastActiveLabel(null, "2026-09-26")).toBe("Not yet");
  });
});

describe("wording (Step 56)", () => {
  it("compares a week with the week before", () => {
    expect(againstWeekBefore(9, 2)).toBe("Up 7 on the week before");
    expect(againstWeekBefore(2, 3)).toBe("Down 1 on the week before");
    expect(againstWeekBefore(4, 4)).toBe("Same as the week before");
  });

  it("fills a bar by share, and not past full", () => {
    expect(percentOf(8, 9)).toBe(89);
    expect(percentOf(0, 9)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(12, 9)).toBe(100);
  });

  it("leads with members, who's active, and entries", () => {
    const d = readDashboard(ANSWER);
    if (!d) throw new Error("no dashboard");
    expect(headlineTiles(d)).toEqual([
      { label: "Members", value: 9, note: "6 new in the last 7 days" },
      {
        label: "Active in the last 7 days",
        value: 9,
        note: "Up 7 on the week before",
      },
      { label: "Active in the last 30 days", value: 9, note: "Of 9 members" },
      { label: "Entries", value: 101, note: "73 new in the last 7 days" },
    ]);
    expect(headlineTiles({ ...d, members: 1, membersNew: 0 })[0].note).toBe(
      "None new in the last 7 days",
    );
    expect(headlineTiles({ ...d, members: 1 })[2].note).toBe("Of 1 member");
  });

  it("gives every kind of activity one row", () => {
    const kinds = ACTIVITY_GROUPS.flatMap((g) => g.rows.map((r) => r.kind));
    expect([...kinds].sort()).toEqual([...ACTIVITY_KINDS].sort());
  });
});
