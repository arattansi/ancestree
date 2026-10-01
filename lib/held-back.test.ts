import { describe, expect, it } from "vitest";

import { groupsToShow, heldBackRows } from "@/lib/held-back";

describe("heldBackRows", () => {
  it("lists each held-back group that has anything, in order", () => {
    expect(
      heldBackRows({
        first_name: "Sam",
        last_name: "Doe",
        date_of_birth: "2014-03-05",
        date_of_birth_precision: "day",
        city_of_birth: "Toronto",
        country_of_birth: "Canada",
        place_id_birth: 6167865,
        sex: "female",
      }),
    ).toEqual([
      { group: "name", label: "Name", value: "Sam Doe" },
      { group: "birth", label: "Date of birth", value: "5 March 2014" },
      { group: "birthplace", label: "Place of birth", value: "Toronto, Canada" },
      { group: "sex", label: "Sex", value: "Female" },
    ]);
  });

  it("says a year, a rough date or a day with no year as the sheet does", () => {
    const born = (d: Parameters<typeof heldBackRows>[0]) =>
      heldBackRows(d).find((r) => r.group === "birth")?.value;
    expect(
      born({ date_of_birth: "2012-01-01", date_of_birth_precision: "year" }),
    ).toBe("2012");
    expect(
      born({
        date_of_birth: "2012-01-01",
        date_of_birth_precision: "year",
        date_of_birth_circa: true,
      }),
    ).toBe("c. 2012");
    expect(born({ birth_month: 7, birth_day: 4 })).toBe("4 July");
  });

  it("names the preferred, middle and maiden names too", () => {
    expect(
      heldBackRows({
        first_name: "Samira",
        preferred_name: "Sam",
        middle_name: "J",
        last_name: "Doe",
        maiden_name: "Roe",
      })[0]?.value,
    ).toBe("Samira (Sam) J Doe (née Roe)");
  });

  it("is empty when nothing is held back", () => {
    expect(heldBackRows(null)).toEqual([]);
    expect(heldBackRows({})).toEqual([]);
  });
});

describe("groupsToShow", () => {
  it("always shows the name, in a fixed order", () => {
    expect(groupsToShow(["sex", "birth"])).toEqual(["name", "birth", "sex"]);
    expect(groupsToShow([])).toEqual(["name"]);
  });
});
