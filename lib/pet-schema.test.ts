import { describe, expect, it } from "vitest";

import {
  emptyPetValues,
  formatPetBirthday,
  petBirthplace,
  petSchema,
  toPetPayload,
} from "@/lib/pet-schema";

const base = { ...emptyPetValues, name: "Biscuit" };

describe("petSchema birth details", () => {
  it("accepts a companion with no birthday or birthplace", () => {
    expect(petSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a full birthday and a GeoNames birthplace", () => {
    const result = petSchema.safeParse({
      ...base,
      birth_date: "2018-03-14",
      place_id_birth: 5128581,
      city_of_birth: "New York City",
      country_of_birth: "United States",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a birthday whose year contradicts year_born", () => {
    const result = petSchema.safeParse({
      ...base,
      year_born: "2018",
      birth_date: "2019-03-14",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a birthday before 1900", () => {
    const result = petSchema.safeParse({ ...base, birth_date: "1804-01-01" });
    expect(result.success).toBe(false);
  });
});

describe("toPetPayload", () => {
  it("derives year_born from an exact birthday", () => {
    const payload = toPetPayload({ ...base, birth_date: "2018-03-14" });
    expect(payload.birth_date).toBe("2018-03-14");
    expect(payload.year_born).toBe(2018);
  });

  it("keeps the bare year when no exact date is given", () => {
    const payload = toPetPayload({ ...base, year_born: "2014" });
    expect(payload.birth_date).toBeNull();
    expect(payload.year_born).toBe(2014);
  });

  it("carries the place FK and denormalised text, or nulls", () => {
    const withPlace = toPetPayload({
      ...base,
      place_id_birth: 184745,
      city_of_birth: "Nairobi",
      country_of_birth: "Kenya",
    });
    expect(withPlace.place_id_birth).toBe(184745);
    expect(withPlace.city_of_birth).toBe("Nairobi");
    expect(withPlace.country_of_birth).toBe("Kenya");

    const blank = toPetPayload(base);
    expect(blank.place_id_birth).toBeNull();
    expect(blank.city_of_birth).toBeNull();
    expect(blank.country_of_birth).toBeNull();
  });
});

describe("petBirthplace", () => {
  it("joins the denormalised pair the way a person entry does", () => {
    expect(
      petBirthplace({ city_of_birth: "Nairobi", country_of_birth: "Kenya" }),
    ).toBe("Nairobi, Kenya");
    expect(
      petBirthplace({ city_of_birth: null, country_of_birth: null }),
    ).toBeNull();
  });
});

describe("formatPetBirthday", () => {
  it("formats an ISO date and passes through null", () => {
    expect(formatPetBirthday(null)).toBeNull();
    expect(formatPetBirthday("2018-03-14")).toContain("2018");
  });
});
