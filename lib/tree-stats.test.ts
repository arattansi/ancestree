import { describe, expect, it } from "vitest";

import { countriesRepresented, yearsDocumented } from "@/lib/tree-stats";

describe("countriesRepresented", () => {
  it("counts each birth country once, however it's written", () => {
    expect(
      countriesRepresented([
        { country_of_birth: "Canada" },
        { country_of_birth: "canada " },
        { country_of_birth: "Côte d’Ivoire" },
        { country_of_birth: "Cote d'Ivoire" },
        { country_of_birth: "United  Kingdom" },
        { country_of_birth: "united kingdom" },
      ]),
    ).toBe(3);
  });

  it("leaves out entries with no birth country", () => {
    expect(
      countriesRepresented([
        { country_of_birth: "" },
        { country_of_birth: null },
        { country_of_birth: "  " },
        { country_of_birth: "Tanzania" },
      ]),
    ).toBe(1);
    expect(countriesRepresented([])).toBe(0);
  });
});

describe("yearsDocumented", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("goes back to the earliest birth year", () => {
    expect(
      yearsDocumented(
        [
          { date_of_birth: "1952-01-01" },
          { date_of_birth: "1898-06-15" },
          { date_of_birth: null },
          { date_of_birth: "1990-03-03" },
        ],
        now,
      ),
    ).toBe(128);
  });

  it("is 0 with no birth dates, or only this year's", () => {
    expect(yearsDocumented([{ date_of_birth: null }], now)).toBe(0);
    expect(yearsDocumented([], now)).toBe(0);
    expect(yearsDocumented([{ date_of_birth: "2026-01-01" }], now)).toBe(0);
  });
});
