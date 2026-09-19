import { describe, expect, it } from "vitest";

import {
  asDatePrecision,
  dateProblem,
  formatPartialDate,
  isBeforeAtSharedPrecision,
  joinDateParts,
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
});

describe("toStoredDate / toPartialIso", () => {
  it("stores a partial date on the first day of its period", () => {
    expect(toStoredDate("1931")).toEqual({ date: "1931-01-01", precision: "year" });
    expect(toStoredDate("1931-3")).toEqual({ date: "1931-03-01", precision: "month" });
    expect(toStoredDate("1931-03-9")).toEqual({ date: "1931-03-09", precision: "day" });
    expect(toStoredDate("")).toEqual({ date: null, precision: "day" });
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
});
