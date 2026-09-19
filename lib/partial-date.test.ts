import { describe, expect, it } from "vitest";

import { asDatePrecision, formatPartialDate } from "./partial-date";

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
