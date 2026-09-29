import "server-only";

import { countryName, isCountryPlace } from "@/lib/country-names";
import {
  choosePlaces,
  isCountryRow,
  shapePlaceQuery,
  type PlaceSearch,
} from "@/lib/place-search";
import { createClient } from "@/lib/supabase/server";

export { countryName };

export type PlaceHit = {
  id: number;
  name: string;
  admin1_code: string | null;
  country_code: string | null;
  /** A whole country rather than a town in it (Step 79). */
  is_country: boolean;
};

/**
 * Human label for a place: "City, ST, Country" — the admin1 segment is only
 * shown when GeoNames stored it as a letter code (US-style), since numeric
 * admin1 codes aren't meaningful without the admin1 gazetteer we don't import.
 * A whole country is just its name (Step 79).
 */
export function formatPlaceLabel(place: PlaceHit): string {
  const country = countryName(place.country_code);
  if (place.is_country) return country || place.name;
  const parts = [place.name];
  if (place.admin1_code && /^[A-Za-z]{2,3}$/.test(place.admin1_code)) {
    parts.push(place.admin1_code.toUpperCase());
  }
  if (country) parts.push(country);
  return parts.join(", ");
}

/**
 * How many name matches each search pulls, most populous first, for
 * lib/place-search.ts to rank. With 60, smaller namesakes never got ranked
 * (Ely, NV for "Ely"), nor a place in a hinted region behind 60 bigger ones.
 * The database sorts every match whatever the limit, so 200 costs only the
 * rows sent to the server (Step 66.4).
 */
const CANDIDATES = 200;

/**
 * Fuzzy place search for the autocomplete: trigram-indexed `search_name
 * ILIKE`, shaped and ranked by lib/place-search.ts (the part before a comma
 * is searched, what follows prefers a region; Step 66). Two letters only
 * match a whole name, which the index serves (Step 66.5). The countries the
 * search names are ranked in with the places (Step 79).
 */
export async function searchPlaces(query: string, limit = 8): Promise<PlaceHit[]> {
  const q = shapePlaceQuery(query);
  if (!q) return [];

  const supabase = await createClient();
  const candidates = async ({ name, exact }: PlaceSearch) => {
    const { data, error } = await supabase
      .from("places")
      .select("id, name, ascii_name, admin1_code, country_code, population, search_name")
      .ilike("search_name", exact ? name : `%${name}%`)
      .order("population", { ascending: false, nullsFirst: false })
      .limit(CANDIDATES);
    return error || !data ? [] : data;
  };

  // The fallback goes out alongside the search as typed, so it costs no
  // extra round trip; it's only used when the search as typed finds nothing.
  const [found, rescued] = await Promise.all([
    candidates(q),
    q.fallback ? candidates(q.fallback) : null,
  ]);

  return choosePlaces(q, found, rescued).slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name,
    admin1_code: p.admin1_code,
    country_code: p.country_code,
    is_country: isCountryRow(p),
  }));
}

/** Load places by id (for rendering already-selected values). */
export async function getPlacesByIds(ids: number[]): Promise<Map<number, PlaceHit>> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, name, admin1_code, country_code, feature_code")
    .in("id", unique);

  return new Map(
    (data ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        admin1_code: p.admin1_code,
        country_code: p.country_code,
        is_country: isCountryPlace(p),
      },
    ]),
  );
}
