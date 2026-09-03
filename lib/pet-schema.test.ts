import { describe, expect, it } from "vitest";

import {
  emptyPetValues,
  formatPetBirthday,
  petSchema,
  toPetPayload,
} from "@/lib/pet-schema";

const base = { ...emptyPetValues, name: "Biscuit" };

describe("petSchema birth details", () => {
  it("accepts a companion with no birthday or birthplace", () => {
    expect(petSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a full birthday and a free-text birthplace", () => {
    const result = petSchema.safeParse({
      ...base,
      birth_date: "2018-03-14",
      birthplace: "The shelter on Elm Street",
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

  it("stores a trimmed birthplace or null", () => {
    expect(toPetPayload({ ...base, birthplace: "  Nairobi  " }).birthplace).toBe(
      "Nairobi",
    );
    expect(toPetPayload(base).birthplace).toBeNull();
  });
});

describe("formatPetBirthday", () => {
  it("formats an ISO date and passes through null", () => {
    expect(formatPetBirthday(null)).toBeNull();
    expect(formatPetBirthday("2018-03-14")).toContain("2018");
  });
});
