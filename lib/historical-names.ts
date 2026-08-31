/**
 * Period-aware place names (Step 4.5d). Pure resolver — the DB rows are loaded
 * elsewhere (small, curated table) and passed in.
 */

export type HistoricalNameRow = {
  place_id: number | null;
  country_code: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

export type HistoricalNameQuery = {
  placeId: number | null;
  countryCode: string | null;
  /** ISO date (YYYY-MM-DD) of the birth/death event, or null if unknown. */
  eventDate: string | null;
};

/**
 * The political name in use at `eventDate` for the given place, or `null` when
 * the date is unknown or no curated row covers it. A place-scoped row (matched
 * on `place_id`) wins over a country-scoped one; among equals, the later
 * `start_date` wins.
 */
export function resolveHistoricalName(
  rows: readonly HistoricalNameRow[],
  query: HistoricalNameQuery,
): string | null {
  const { eventDate, placeId, countryCode } = query;
  if (!eventDate) return null;

  const covers = (r: HistoricalNameRow) =>
    (!r.start_date || r.start_date <= eventDate) &&
    (!r.end_date || eventDate < r.end_date);

  const scoped = (r: HistoricalNameRow) =>
    r.place_id != null
      ? r.place_id === placeId
      : r.country_code != null && r.country_code === countryCode;

  const matches = rows.filter((r) => scoped(r) && covers(r));
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const specificity = (a.place_id != null ? 1 : 0) - (b.place_id != null ? 1 : 0);
    if (specificity !== 0) return -specificity;
    return (b.start_date ?? "").localeCompare(a.start_date ?? "");
  });

  return matches[0].name;
}

/** "Nairobi, Kenya Colony · now Kenya" — or the plain label when no period name. */
export function formatHistoricalPlace(input: {
  city: string | null;
  modernCountry: string | null;
  historical: string | null;
}): string | null {
  const { city, modernCountry, historical } = input;
  const plain = [city, modernCountry].filter(Boolean).join(", ") || null;
  if (!historical || historical === modernCountry) return plain;
  const lead = [city, historical].filter(Boolean).join(", ");
  return modernCountry ? `${lead} · now ${modernCountry}` : lead;
}
