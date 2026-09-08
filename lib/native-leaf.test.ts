import { describe, expect, it } from "vitest";

import { leafLabel, nativeLeaf } from "@/lib/native-leaf";

describe("nativeLeaf", () => {
  it("reads the country", () => {
    expect(nativeLeaf({ country_of_birth: "Canada" })).toMatchObject({
      species: "Sugar maple",
      shape: "maple",
    });
  });

  it("reads a city when the country is missing", () => {
    expect(nativeLeaf({ city_of_birth: "Zanzibar" }).species).toBe(
      "Clove tree",
    );
  });

  it("knows the name the country had at the time", () => {
    expect(
      nativeLeaf({
        city_of_birth: "Moshi",
        country_of_birth: "Tanganyika (British mandate)",
      }).species,
    ).toBe("Baobab");
  });

  it("matches whole words only", () => {
    // "Romania" ends in "oman"; "Chile" hides inside nothing here, but the
    // substring traps are what this rule exists for.
    expect(nativeLeaf({ country_of_birth: "Romania" }).region).toBe(
      "Central Europe",
    );
  });

  it("prefers the more specific place", () => {
    expect(nativeLeaf({ country_of_birth: "South Africa" }).region).toBe(
      "South Africa",
    );
    expect(nativeLeaf({ country_of_birth: "New Zealand" }).region).toBe(
      "New Zealand",
    );
  });

  it("folds accents", () => {
    expect(nativeLeaf({ city_of_birth: "São Paulo" }).species).toBe(
      "Brazilwood",
    );
  });

  it("reads a place written with a typographic apostrophe", () => {
    // "Côte d’Ivoire" tokenises to [cote, d, ivoire]; the table matches on
    // "ivoire" alone so the punctuation never has to be guessed at.
    expect(
      nativeLeaf({
        city_of_birth: "Abidjan",
        country_of_birth: "Côte d’Ivoire",
      }).species,
    ).toBe("Shea tree");
  });

  it("falls back to a plain leaf", () => {
    expect(nativeLeaf({})).toMatchObject({ shape: "ovate", species: null });
    expect(nativeLeaf({ country_of_birth: "Atlantis" }).species).toBe(null);
  });
});

describe("leafLabel", () => {
  it("names the tree and the place", () => {
    expect(leafLabel(nativeLeaf({ country_of_birth: "Canada" }))).toBe(
      "Sugar maple · Canada",
    );
  });

  it("says nothing about a plain leaf", () => {
    expect(leafLabel(nativeLeaf({}))).toBe(null);
  });
});
