import { describe, expect, it } from "vitest";

import { normalizeSpouseDates, toStoredSpouseDates } from "@/lib/spouse-dates";

describe("spouse dates (Step 77.4)", () => {
  it("stores a form's dates padded to ISO", () => {
    expect(
      toStoredSpouseDates({
        marriage_date: "1965-03-5",
        is_divorced: true,
        divorce_date: "1980-1-02",
      }),
    ).toEqual({
      marriage_date: "1965-03-05",
      marriage_month: null,
      marriage_day: null,
      is_divorced: true,
      divorce_date: "1980-01-02",
    });
  });

  it("keeps a wedding day with no year as its day and month", () => {
    expect(toStoredSpouseDates({ marriage_date: "-06-12" })).toEqual({
      marriage_date: null,
      marriage_month: 6,
      marriage_day: 12,
      is_divorced: false,
      divorce_date: null,
    });
  });

  it("drops a divorce date once they didn't divorce", () => {
    expect(
      toStoredSpouseDates({ is_divorced: false, divorce_date: "1980-01-02" })
        .divorce_date,
    ).toBeNull();
    expect(toStoredSpouseDates(undefined)).toEqual({
      marriage_date: null,
      marriage_month: null,
      marriage_day: null,
      is_divorced: false,
      divorce_date: null,
    });
  });

  it("reads what an action is sent the same way, however it came", () => {
    expect(
      normalizeSpouseDates({
        marriage_date: " 1965-03-05 ",
        marriage_month: 6,
        marriage_day: 12,
        is_divorced: false,
        divorce_date: "1980-01-02",
      }),
    ).toEqual({
      marriage_date: "1965-03-05",
      marriage_month: null,
      marriage_day: null,
      is_divorced: false,
      divorce_date: null,
    });
    expect(
      normalizeSpouseDates({ marriage_date: "", marriage_month: 6, marriage_day: 12, is_divorced: true, divorce_date: " " }),
    ).toEqual({
      marriage_date: null,
      marriage_month: 6,
      marriage_day: 12,
      is_divorced: true,
      divorce_date: null,
    });
  });
});
