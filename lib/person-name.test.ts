import { describe, expect, it } from "vitest";

import {
  nodeDisplayName,
  personDisplayName,
  personHasDied,
  preferredCopiesFirst,
} from "@/lib/person-name";

describe("nodeDisplayName", () => {
  it("leaves a name that fits alone", () => {
    const p = { first_name: "Zahir", last_name: "Kanji" };
    expect(nodeDisplayName(p)).toBe(personDisplayName(p));
  });

  it("condenses the surname to an initial when the name is too long", () => {
    expect(
      nodeDisplayName({ first_name: "Shahsultan", last_name: "Rattansi" }),
    ).toBe("Shahsultan R.");
  });

  it("uses the preferred name it would have shown anyway", () => {
    expect(
      nodeDisplayName({
        first_name: "Muhammad",
        preferred_name: "Mo",
        last_name: "Nurmohamed",
      }),
    ).toBe("Mo Nurmohamed");
  });

  it("leaves a long single name to the card to truncate", () => {
    expect(nodeDisplayName({ first_name: "Bartholomewicious" })).toBe(
      "Bartholomewicious",
    );
  });
});

describe("preferredCopiesFirst", () => {
  it("spots a preferred name that repeats the first name", () => {
    expect(preferredCopiesFirst("Selena", "Selena")).toBe(true);
    expect(preferredCopiesFirst(" selena ", "Selena")).toBe(true);
  });

  it("leaves a real preferred name alone", () => {
    expect(preferredCopiesFirst("Mo", "Muhammad")).toBe(false);
  });

  it("treats an empty preferred name as nothing to follow", () => {
    expect(preferredCopiesFirst("", "")).toBe(false);
    expect(preferredCopiesFirst(null, "Selena")).toBe(false);
  });
});

describe("personHasDied", () => {
  it("reads the flag or a date of death, as the claim checks do", () => {
    expect(personHasDied({ is_deceased: true, date_of_death: null })).toBe(true);
    expect(
      personHasDied({ is_deceased: false, date_of_death: "1990-05-01" }),
    ).toBe(true);
    expect(
      personHasDied({ is_deceased: true, date_of_death: "1990-05-01" }),
    ).toBe(true);
  });

  it("takes neither for living", () => {
    expect(personHasDied({ is_deceased: false, date_of_death: null })).toBe(false);
    expect(personHasDied({})).toBe(false);
  });
});
