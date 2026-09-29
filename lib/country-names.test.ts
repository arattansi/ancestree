import { describe, expect, it } from "vitest";

import {
  ALPHA2,
  COUNTRY_PLACE_ID_BASE,
  countryPlaceId,
  isCountryPlace,
  isCountryPlaceId,
} from "./country-names";

describe("countryPlaceId (Step 79)", () => {
  it("is the base plus the two letters' character codes", () => {
    expect(countryPlaceId("TZ")).toBe(9_000_008_490);
    expect(countryPlaceId("ke")).toBe(9_000_007_569);
  });

  it("gives every country its own id, between GeoNames' and a Root's", () => {
    const ids = ALPHA2.map(countryPlaceId);
    expect(new Set(ids).size).toBe(ALPHA2.length);
    for (const id of ids) {
      expect(id).toBeGreaterThan(COUNTRY_PLACE_ID_BASE);
      // A Root's added places start at 10,000,000,000 (app/actions/places.ts).
      expect(id).toBeLessThan(10_000_000_000);
      expect(isCountryPlaceId(id)).toBe(true);
    }
  });

  it("knows no GeoNames or hand-added place for a country", () => {
    expect(isCountryPlaceId(184745)).toBe(false); // Nairobi
    expect(isCountryPlaceId(12022702)).toBe(false);
    expect(isCountryPlaceId(10_000_000_000)).toBe(false); // Shishang
  });
});

describe("isCountryPlace", () => {
  it("knows a country's row from a town's", () => {
    expect(isCountryPlace({ feature_code: "PCL" })).toBe(true);
    expect(isCountryPlace({ feature_code: "PCLI" })).toBe(true);
    expect(isCountryPlace({ feature_code: "PPLA" })).toBe(false);
    expect(isCountryPlace({ feature_code: "PPLX" })).toBe(false);
    expect(isCountryPlace({ feature_code: null })).toBe(false);
  });
});
