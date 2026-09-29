import { describe, expect, it } from "vitest";

import {
  asDatePrecision,
  asDayMonth,
  dateProblem,
  formatDayMonth,
  formatPartialDate,
  isBeforeAtSharedPrecision,
  joinDateParts,
  marriageDateProblems,
  splitDateParts,
  toPartialIso,
  toStoredDate,
} from "./partial-date";

describe("asDatePrecision", () => {
  it("keeps a known precision", () => {
    expect(asDatePrecision("year")).toBe("year");
    expect(asDatePrecision("month")).toBe("month");
    expect(asDatePrecision("day")).toBe("day");
  });

  it("reads anything else as a whole date", () => {
    expect(asDatePrecision(null)).toBe("day");
    expect(asDatePrecision(undefined)).toBe("day");
    expect(asDatePrecision("decade")).toBe("day");
  });
});

describe("formatPartialDate", () => {
  it("shows as much of the date as is known", () => {
    expect(formatPartialDate("1950-05-03", "day")).toBe("3 May 1950");
    expect(formatPartialDate("1950-05-01", "month")).toBe("May 1950");
    expect(formatPartialDate("1950-01-01", "year")).toBe("1950");
  });

  it("treats a missing precision as a whole date", () => {
    expect(formatPartialDate("1925-09-04")).toBe("4 September 1925");
    expect(formatPartialDate("1925-09-04", null)).toBe("4 September 1925");
  });

  it("shows nothing for no date or a malformed one", () => {
    expect(formatPartialDate(null, "year")).toBeNull();
    expect(formatPartialDate("", "day")).toBeNull();
    expect(formatPartialDate("1950-13-01", "day")).toBeNull();
    expect(formatPartialDate("May 1950", "month")).toBeNull();
  });

  it("shows a day and month with no year, and prefers a date that has one", () => {
    expect(formatPartialDate(null, "day", { month: 3, day: 5 })).toBe("5 March");
    expect(formatPartialDate(null, "day", { month: 2, day: 29 })).toBe(
      "29 February",
    );
    expect(formatPartialDate("1950-05-03", "day", { month: 3, day: 5 })).toBe(
      "3 May 1950",
    );
    expect(formatPartialDate(null, "day", null)).toBeNull();
  });

  it("puts c. before a rough date, whatever of it is known (Step 81)", () => {
    expect(formatPartialDate("1950-01-01", "year", null, true)).toBe("c. 1950");
    expect(formatPartialDate("1950-05-01", "month", null, true)).toBe(
      "c. May 1950",
    );
    expect(formatPartialDate("1950-05-03", "day", null, true)).toBe(
      "c. 3 May 1950",
    );
    expect(formatPartialDate("1950-01-01", "year", null, false)).toBe("1950");
  });

  it("has no c. without a year to be rough about", () => {
    expect(formatPartialDate(null, "day", { month: 3, day: 5 }, true)).toBe(
      "5 March",
    );
    expect(formatPartialDate(null, "year", null, true)).toBeNull();
  });
});

describe("asDayMonth / formatDayMonth", () => {
  it("needs both columns", () => {
    expect(asDayMonth(3, 5)).toEqual({ month: 3, day: 5 });
    expect(asDayMonth(3, null)).toBeNull();
    expect(asDayMonth(null, 5)).toBeNull();
    expect(asDayMonth(undefined, undefined)).toBeNull();
  });

  it("spells the month out", () => {
    expect(formatDayMonth({ month: 12, day: 25 })).toBe("25 December");
    expect(formatDayMonth({ month: 13, day: 1 })).toBeNull();
    expect(formatDayMonth(null)).toBeNull();
  });
});

describe("splitDateParts / joinDateParts", () => {
  it("round-trips whole, partial and half-typed dates", () => {
    for (const value of ["", "1950", "1950-05", "1950-05-03", "-05", "1950--3"]) {
      expect(joinDateParts(splitDateParts(value))).toBe(value);
    }
  });

  it("names each part", () => {
    expect(splitDateParts("1950--3")).toEqual({ year: "1950", month: "", day: "3" });
    expect(splitDateParts("-05")).toEqual({ year: "", month: "05", day: "" });
    expect(splitDateParts(null)).toEqual({ year: "", month: "", day: "" });
  });
});

describe("dateProblem", () => {
  const partial = { allowPartial: true, maxYear: 2026 };
  const whole = { allowPartial: false, maxYear: 2026 };

  it("accepts an empty date, a year, a month and year, and a whole date", () => {
    expect(dateProblem("", partial)).toBeNull();
    expect(dateProblem("1950", partial)).toBeNull();
    expect(dateProblem("1950-05", partial)).toBeNull();
    expect(dateProblem("1950-05-03", partial)).toBeNull();
    expect(dateProblem("1950-5-3", partial)).toBeNull();
  });

  it("knows leap years", () => {
    expect(dateProblem("2000-02-29", partial)).toBeNull();
    expect(dateProblem("1950-02-29", partial)).toBe("That day isn't in that month.");
    expect(dateProblem("1950-04-31", partial)).toBe("That day isn't in that month.");
  });

  it("says what's missing or wrong", () => {
    expect(dateProblem("-05-03", partial)).toBe("Add the year.");
    expect(dateProblem("195", partial)).toBe("Use a 4-digit year.");
    expect(dateProblem("0999", partial)).toBe("Use a year between 1000 and 2026.");
    expect(dateProblem("2027", partial)).toBe("Use a year between 1000 and 2026.");
    expect(dateProblem("1950--3", partial)).toBe("Pick the month, or clear the day.");
    expect(dateProblem("1950-13", partial)).toBe("Pick a month.");
    expect(dateProblem("1950-00", partial)).toBe("Pick a month.");
    expect(dateProblem("1950-05-00", partial)).toBe("That day isn't in that month.");
  });

  it("wants the whole date where partial ones aren't allowed", () => {
    expect(dateProblem("1950", whole)).toBe("Enter the whole date, or clear it.");
    expect(dateProblem("1950-05", whole)).toBe("Enter the whole date, or clear it.");
    expect(dateProblem("1950-05-03", whole)).toBeNull();
    expect(dateProblem("", whole)).toBeNull();
  });

  it("takes a day and month without the year where that's allowed", () => {
    const birthday = { ...partial, allowNoYear: true };
    const anniversary = { ...whole, allowNoYear: true };
    for (const opts of [birthday, anniversary]) {
      expect(dateProblem("-03-05", opts)).toBeNull();
      expect(dateProblem("-3-5", opts)).toBeNull();
      // Any year's 29 February, since the year isn't known.
      expect(dateProblem("-02-29", opts)).toBeNull();
      expect(dateProblem("-02-30", opts)).toBe("That day isn't in that month.");
      expect(dateProblem("-04-31", opts)).toBe("That day isn't in that month.");
      expect(dateProblem("--5", opts)).toBe("Pick the month, or clear the day.");
      expect(dateProblem("-13-01", opts)).toBe("Pick a month.");
    }
    // A month alone: "5 March", or "March 1950" where a month and year will do.
    expect(dateProblem("-03", birthday)).toBe("Add the day, or the year.");
    expect(dateProblem("-03", anniversary)).toBe("Add the day.");
    // Everything with a year is checked as before.
    expect(dateProblem("1950", birthday)).toBeNull();
    expect(dateProblem("1950", anniversary)).toBe(
      "Enter the whole date, or clear it.",
    );
  });

  it("still wants the year for any other date", () => {
    expect(dateProblem("-03-05", partial)).toBe("Add the year.");
    expect(dateProblem("-03-05", whole)).toBe("Add the year.");
  });
});

describe("toStoredDate / toPartialIso", () => {
  it("stores a partial date on the first day of its period", () => {
    expect(toStoredDate("1931")).toEqual({
      date: "1931-01-01",
      precision: "year",
      withoutYear: null,
    });
    expect(toStoredDate("1931-3")).toEqual({
      date: "1931-03-01",
      precision: "month",
      withoutYear: null,
    });
    expect(toStoredDate("1931-03-9")).toEqual({
      date: "1931-03-09",
      precision: "day",
      withoutYear: null,
    });
    expect(toStoredDate("")).toEqual({
      date: null,
      precision: "day",
      withoutYear: null,
    });
  });

  it("stores a day and month with no year apart, with no date", () => {
    expect(toStoredDate("-03-5")).toEqual({
      date: null,
      precision: "day",
      withoutYear: { month: 3, day: 5 },
    });
    // Half-typed, it's nothing yet.
    expect(toStoredDate("-03").withoutYear).toBeNull();
    expect(toStoredDate("--5").withoutYear).toBeNull();
  });

  it("opens a stored date back up at the precision it was saved with", () => {
    for (const value of ["1931", "1931-03", "1931-03-09"]) {
      const { date, precision } = toStoredDate(value);
      expect(toPartialIso(date, precision)).toBe(value);
    }
    expect(toPartialIso(null, "year")).toBe("");
    // An unrecognised precision is a whole date, as the column's default is.
    expect(toPartialIso("1931-03-09", "fortnight")).toBe("1931-03-09");
  });

  it("opens a day and month with no year back up", () => {
    const { date, precision, withoutYear } = toStoredDate("-3-5");
    expect(toPartialIso(date, precision, withoutYear)).toBe("-03-05");
    expect(toStoredDate("-03-05").withoutYear).toEqual(withoutYear);
    expect(toPartialIso(null, "day", null)).toBe("");
  });
});

describe("isBeforeAtSharedPrecision", () => {
  it("compares only as finely as the coarser date is known", () => {
    expect(isBeforeAtSharedPrecision("1990", "1990-05-03")).toBe(false);
    expect(isBeforeAtSharedPrecision("1989-12-31", "1990")).toBe(true);
    expect(isBeforeAtSharedPrecision("1990-04-30", "1990-05")).toBe(true);
    expect(isBeforeAtSharedPrecision("1990-05-01", "1990-05")).toBe(false);
    expect(isBeforeAtSharedPrecision("1990-05-02", "1990-05-03")).toBe(true);
    expect(isBeforeAtSharedPrecision("1990-05-03", "1990-05-03")).toBe(false);
  });

  it("never blames a date it can't read", () => {
    expect(isBeforeAtSharedPrecision("19", "1990")).toBe(false);
    expect(isBeforeAtSharedPrecision("1950--3", "1990")).toBe(false);
    expect(isBeforeAtSharedPrecision("", "1990")).toBe(false);
  });

  it("can't put a date with no year before or after another", () => {
    expect(isBeforeAtSharedPrecision("1950", "-03-05")).toBe(false);
    expect(isBeforeAtSharedPrecision("-03-05", "1990")).toBe(false);
  });
});

describe("marriageDateProblems", () => {
  it("wants whole dates", () => {
    expect(
      marriageDateProblems({ marriageDate: "1965", isDivorced: false }),
    ).toEqual({ marriage: "Enter the whole date, or clear it.", divorce: null });
  });

  it("takes a wedding's day and month without the year, but not a divorce's", () => {
    expect(
      marriageDateProblems({ marriageDate: "-06-02", isDivorced: false }),
    ).toEqual({ marriage: null, divorce: null });
    expect(
      marriageDateProblems({
        marriageDate: "-06-02",
        isDivorced: true,
        divorceDate: "-01-05",
      }),
    ).toEqual({ marriage: null, divorce: "Add the year." });
    // Nothing to compare a divorce with.
    expect(
      marriageDateProblems({
        marriageDate: "-06-02",
        isDivorced: true,
        divorceDate: "1960-01-05",
      }),
    ).toEqual({ marriage: null, divorce: null });
  });

  it("only checks a divorce date when they divorced", () => {
    expect(
      marriageDateProblems({
        marriageDate: "1965-03-12",
        isDivorced: false,
        divorceDate: "19",
      }),
    ).toEqual({ marriage: null, divorce: null });
  });

  it("refuses a divorce before the marriage", () => {
    expect(
      marriageDateProblems({
        marriageDate: "1965-03-12",
        isDivorced: true,
        divorceDate: "1964-01-5",
      }).divorce,
    ).toBe("The divorce date can't be before the marriage date.");
  });

  it("leaves empty dates alone", () => {
    expect(marriageDateProblems({ isDivorced: true })).toEqual({
      marriage: null,
      divorce: null,
    });
  });
});
