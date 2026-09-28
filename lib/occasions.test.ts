import { describe, expect, it } from "vitest";

import {
  groupOccasions,
  localDay,
  occasionDay,
  occasionTitle,
  ordinal,
  upcomingOccasions,
  type OccasionEdge,
  type OccasionPerson,
} from "@/lib/occasions";

const person = (
  id: string,
  born: string | null,
  extra: Partial<OccasionPerson> = {},
): OccasionPerson => ({
  id,
  date_of_birth: born,
  date_of_birth_precision: "day",
  date_of_death: null,
  is_deceased: false,
  ...extra,
});

const marriage = (
  a: string,
  b: string,
  date: string | null,
  extra: Partial<OccasionEdge> = {},
): OccasionEdge => ({
  from_person: a,
  to_person: b,
  type: "spouse",
  marriage_date: date,
  is_divorced: false,
  ...extra,
});

const TODAY = "2026-09-26";

describe("upcomingOccasions", () => {
  it("finds the next birthday, today included, with the age they turn", () => {
    const list = upcomingOccasions(
      [
        person("today", "1990-09-26"),
        person("soon", "1992-10-03"),
        person("gone-by", "1950-09-25"),
      ],
      [],
      TODAY,
    );
    expect(list.map((o) => [o.people[0], o.date, o.daysAway, o.years])).toEqual(
      [
        ["today", "2026-09-26", 0, 36],
        ["soon", "2026-10-03", 7, 34],
        // Yesterday's comes round next year.
        ["gone-by", "2027-09-25", 364, 77],
      ],
    );
  });

  it("keeps only whole birth dates, and only the living", () => {
    const list = upcomingOccasions(
      [
        person("month", "1990-10-01", { date_of_birth_precision: "month" }),
        person("year", "1990-01-01", { date_of_birth_precision: "year" }),
        person("none", null),
        person("marked", "1930-10-01", { is_deceased: true }),
        person("dated", "1930-10-02", { date_of_death: "2001-05-05" }),
        person("whole", "1990-10-04"),
      ],
      [],
      TODAY,
    );
    expect(list.map((o) => o.people[0])).toEqual(["whole"]);
  });

  it("finds birthdays kept without the year, with no age", () => {
    const list = upcomingOccasions(
      [
        person("no-year", null, { birth_month: 10, birth_day: 1 }),
        person("leap", null, { birth_month: 2, birth_day: 29 }),
        person("today", null, { birth_month: 9, birth_day: 26 }),
        person("half", null, { birth_month: 10, birth_day: null }),
        person("bad", null, { birth_month: 4, birth_day: 31 }),
        person("gone", null, {
          birth_month: 10,
          birth_day: 2,
          is_deceased: true,
        }),
      ],
      [],
      TODAY,
    );
    expect(list.map((o) => [o.people[0], o.date, o.daysAway, o.years])).toEqual(
      [
        // Born on this day in an unknown year: still their birthday.
        ["today", "2026-09-26", 0, null],
        ["no-year", "2026-10-01", 5, null],
        // 2027 has no 29 February.
        ["leap", "2027-02-28", 155, null],
      ],
    );
  });

  it("keeps a 29 February birthday on the 28th in a year without one", () => {
    const leapling = [person("leap", "2000-02-29")];
    expect(upcomingOccasions(leapling, [], TODAY)[0]).toMatchObject({
      date: "2027-02-28",
      years: 27,
    });
    // In a leap year it's the day itself.
    expect(upcomingOccasions(leapling, [], "2027-09-26")[0]).toMatchObject({
      date: "2028-02-29",
      years: 28,
    });
    // On the 28th of a common year, it's today.
    expect(upcomingOccasions(leapling, [], "2027-02-28")[0]).toMatchObject({
      date: "2027-02-28",
      daysAway: 0,
    });
  });

  it("crosses the new year", () => {
    const list = upcomingOccasions(
      [person("jan", "1980-01-02")],
      [],
      "2026-12-30",
    );
    expect(list[0]).toMatchObject({ date: "2027-01-02", daysAway: 3, years: 47 });
  });

  it("skips the day itself and dates still to come", () => {
    const list = upcomingOccasions(
      [person("newborn", TODAY), person("typo", "2031-10-01")],
      [marriage("a", "b", TODAY)],
      TODAY,
    );
    expect(list).toEqual([]);
  });

  it("finds anniversaries of couples still married, both living", () => {
    const people = [
      person("a", null),
      person("b", null),
      person("c", null),
      person("d", null),
      person("e", null),
      person("f", null, { is_deceased: true }),
    ];
    const list = upcomingOccasions(
      people,
      [
        marriage("a", "b", "2001-10-10"),
        marriage("c", "d", "1999-10-11", { is_divorced: true }),
        marriage("e", "f", "1970-10-12"),
        // Not a marriage, whatever its date says.
        { ...marriage("a", "c", "2000-10-13"), type: "parent" },
        // A marriage with no date.
        marriage("b", "e", null),
      ],
      TODAY,
    );
    expect(list).toEqual([
      {
        kind: "anniversary",
        people: ["a", "b"],
        date: "2026-10-10",
        daysAway: 14,
        years: 25,
      },
    ]);
  });

  it("finds anniversaries kept without the year, with no count of years", () => {
    const list = upcomingOccasions(
      [person("a", null), person("b", null), person("c", null), person("d", null)],
      [
        marriage("a", "b", null, { marriage_month: 9, marriage_day: 26 }),
        marriage("c", "d", null, {
          marriage_month: 10,
          marriage_day: 1,
          is_divorced: true,
        }),
      ],
      TODAY,
    );
    expect(list).toEqual([
      {
        kind: "anniversary",
        people: ["a", "b"],
        date: "2026-09-26",
        daysAway: 0,
        years: null,
      },
    ]);
  });

  it("leaves out a marriage to someone not in the list", () => {
    // The canvas passes only who it draws: a filtered-out partner takes the
    // anniversary with them.
    const list = upcomingOccasions(
      [person("a", null)],
      [marriage("a", "b", "2001-10-10")],
      TODAY,
    );
    expect(list).toEqual([]);
  });

  it("counts a marriage stored both ways once", () => {
    const list = upcomingOccasions(
      [person("a", null), person("b", null)],
      [marriage("a", "b", "2001-10-10"), marriage("b", "a", "2001-10-10")],
      TODAY,
    );
    expect(list).toHaveLength(1);
  });

  it("puts a day's birthdays before its anniversaries, then by name", () => {
    const names: Record<string, string> = { z: "Zara", y: "Yusuf", a: "Amir" };
    const list = upcomingOccasions(
      [person("z", "1990-10-01"), person("y", null), person("a", "1991-10-01")],
      [marriage("y", "z", "2010-10-01")],
      TODAY,
      { nameOf: (id) => names[id] },
    );
    expect(list.map((o) => [o.kind, o.people.join("+")])).toEqual([
      ["birthday", "a"],
      ["birthday", "z"],
      ["anniversary", "y+z"],
    ]);
  });

  it("looks only as far ahead as it's asked", () => {
    const list = upcomingOccasions(
      [person("a", "1990-10-02"), person("b", "1990-10-04")],
      [],
      TODAY,
      { within: 7 },
    );
    expect(list.map((o) => o.people[0])).toEqual(["a"]);
  });

  it("finds nothing for a day it can't read", () => {
    expect(upcomingOccasions([person("a", "1990-10-02")], [], "")).toEqual([]);
  });
});

describe("groupOccasions", () => {
  it("heads the card Today, Tomorrow, This week, then by month", () => {
    const list = upcomingOccasions(
      [
        person("today", "1990-09-26"),
        person("tomorrow", "1990-09-27"),
        person("week", "1990-10-02"),
        person("week-end", "1990-10-03"),
        person("october", "1990-10-20"),
        person("next-sept", "1990-09-01"),
      ],
      [],
      TODAY,
    );
    const groups = groupOccasions(list, TODAY);
    expect(
      groups.map((g) => [g.label, g.items.map((o) => o.people[0])]),
    ).toEqual([
      ["Today", ["today"]],
      ["Tomorrow", ["tomorrow"]],
      ["This week", ["week"]],
      ["October", ["week-end", "october"]],
      // A year off, so it says which September.
      ["September 2027", ["next-sept"]],
    ]);
  });
});

describe("wording", () => {
  it("names the day from fixed lists", () => {
    expect(occasionDay("2026-10-03")).toBe("Sat 3 Oct");
    expect(occasionDay("2027-02-28")).toBe("Sun 28 Feb");
  });

  it("says what the occasion is", () => {
    const base = { people: ["a"], date: TODAY, daysAway: 0 };
    expect(occasionTitle({ ...base, kind: "birthday", years: 34 })).toBe(
      "Turns 34",
    );
    expect(occasionTitle({ ...base, kind: "anniversary", years: 25 })).toBe(
      "25th anniversary",
    );
    expect(occasionTitle({ ...base, kind: "birthday", years: null })).toBe(
      "Birthday",
    );
    expect(occasionTitle({ ...base, kind: "anniversary", years: null })).toBe(
      "Anniversary",
    );
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(
      [
        "1st",
        "2nd",
        "3rd",
        "4th",
        "11th",
        "12th",
        "13th",
        "21st",
        "22nd",
        "23rd",
        "101st",
        "111th",
      ],
    );
  });

  it("reads today in the viewer's own time zone", () => {
    // A late evening, local time: still that day, whatever UTC says.
    expect(localDay(new Date(2026, 8, 26, 23, 59))).toBe("2026-09-26");
    expect(localDay(new Date(2027, 0, 1, 0, 0))).toBe("2027-01-01");
  });
});
