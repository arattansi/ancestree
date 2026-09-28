import "server-only";

import { countryName } from "@/lib/country-names";
import { choosePlaces, shapePlaceQuery } from "@/lib/place-search";
import { createClient } from "@/lib/supabase/server";

export { countryName };

export type PlaceHit = {
  id: number;
  name: string;
  admin1_code: string | null;
  country_code: string | null;
};

/**
 * Human label for a place: "City, ST, Country" — the admin1 segment is only
 * shown when GeoNames stored it as a letter code (US-style), since numeric
 * admin1 codes aren't meaningful without the admin1 gazetteer we don't import.
 */
export function formatPlaceLabel(place: PlaceHit): string {
  const parts = [place.name];
  if (place.admin1_code && /^[A-Za-z]{2,3}$/.test(place.admin1_code)) {
    parts.push(place.admin1_code.toUpperCase());
  }
  const country = countryName(place.country_code);
  if (country) parts.push(country);
  return parts.join(", ");
}

/** The legacy free-text pair still written alongside the FK (see Step 4.5b). */
export function placeLegacyText(place: PlaceHit): {
  city: string;
  country: string;
} {
  return { city: place.name, country: countryName(place.country_code) || (place.country_code ?? "") };
}

/**
 * Fuzzy place search for the autocomplete: trigram-indexed `search_name
 * ILIKE`, shaped and ranked by lib/place-search.ts (the part before a comma
 * is searched, what follows prefers a region; Step 66).
 */
export async function searchPlaces(query: string, limit = 8): Promise<PlaceHit[]> {
  const q = shapePlaceQuery(query);
  if (!q) return [];

  const supabase = await createClient();
  const candidates = async (name: string) => {
    const { data, error } = await supabase
      .from("places")
      .select("id, name, ascii_name, admin1_code, country_code, population, search_name")
      .ilike("search_name", `%${name}%`)
      .order("population", { ascending: false, nullsFirst: false })
      .limit(60);
    return error || !data ? [] : data;
  };

  // The fallback goes out alongside the search as typed, so it costs no
  // extra round trip; it's only used when the search as typed finds nothing.
  const [found, rescued] = await Promise.all([
    candidates(q.name),
    q.fallback ? candidates(q.fallback.name) : null,
  ]);

  return choosePlaces(q, found, rescued).slice(0, limit).map((p) => ({
    id: p.id,
    name: p.name,
    admin1_code: p.admin1_code,
    country_code: p.country_code,
  }));
}

/** Load places by id (for rendering already-selected values). */
export async function getPlacesByIds(ids: number[]): Promise<Map<number, PlaceHit>> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("places")
    .select("id, name, admin1_code, country_code")
    .in("id", unique);

  return new Map((data ?? []).map((p) => [p.id, p as PlaceHit]));
}
