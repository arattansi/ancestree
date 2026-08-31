import { describe, expect, it } from "vitest";

import {
  formatHistoricalPlace,
  resolveHistoricalName,
  type HistoricalNameRow,
} from "@/lib/historical-names";

const rows: HistoricalNameRow[] = [
  { place_id: null, country_code: "TZ", name: "German East Africa", start_date: "1891-01-01", end_date: "1919-06-28" },
  { place_id: null, country_code: "TZ", name: "Tanganyika (British mandate)", start_date: "1919-06-28", end_date: "1961-12-09" },
  { place_id: 148730, country_code: null, name: "Sultanate of Zanzibar", start_date: "1856-10-19", end_date: "1964-01-12" },
  { place_id: null, country_code: "KE", name: "Kenya Colony", start_date: "1920-07-23", end_date: "1963-12-12" },
];

describe("resolveHistoricalName", () => {
  it("returns null without an event date", () => {
    expect(
      resolveHistoricalName(rows, { placeId: 1, countryCode: "TZ", eventDate: null }),
    ).toBeNull();
  });

  it("matches a country-scoped row for the year", () => {
    expect(
      resolveHistoricalName(rows, { placeId: 999, countryCode: "TZ", eventDate: "1930-04-02" }),
    ).toBe("Tanganyika (British mandate)");
  });

  it("prefers a place-scoped row over a country-scoped one", () => {
    const mixed = [
      ...rows,
      { place_id: null, country_code: "TZ", name: "Tanganyika", start_date: "1961-12-09", end_date: "1964-04-26" },
    ];
    expect(
      resolveHistoricalName(mixed, { placeId: 148730, countryCode: "TZ", eventDate: "1960-01-01" }),
    ).toBe("Sultanate of Zanzibar");
  });

  it("returns null when no row covers the date (modern era)", () => {
    expect(
      resolveHistoricalName(rows, { placeId: 1, countryCode: "KE", eventDate: "2001-01-01" }),
    ).toBeNull();
  });

  it("treats end_date as exclusive", () => {
    expect(
      resolveHistoricalName(rows, { placeId: 1, countryCode: "KE", eventDate: "1963-12-12" }),
    ).toBeNull();
  });
});

describe("formatHistoricalPlace", () => {
  it("annotates the period name with the modern country", () => {
    expect(
      formatHistoricalPlace({ city: "Nairobi", modernCountry: "Kenya", historical: "Kenya Colony" }),
    ).toBe("Nairobi, Kenya Colony · now Kenya");
  });

  it("falls back to the plain label when there is no period name", () => {
    expect(
      formatHistoricalPlace({ city: "Nairobi", modernCountry: "Kenya", historical: null }),
    ).toBe("Nairobi, Kenya");
  });

  it("does not add a redundant label when the period name equals the modern country", () => {
    expect(
      formatHistoricalPlace({ city: "Toronto", modernCountry: "Canada", historical: "Canada" }),
    ).toBe("Toronto, Canada");
  });
});
