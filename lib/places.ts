import "server-only";

import { countryName } from "@/lib/country-names";
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
 * Fuzzy place search for the autocomplete. Trigram-indexed `search_name ILIKE`,
 * ranked by how closely the whole string matches, then population.
 */
export async function searchPlaces(query: string, limit = 8): Promise<PlaceHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("places")
    .select("id, name, ascii_name, admin1_code, country_code, population, search_name")
    .ilike("search_name", `%${q}%`)
    .order("population", { ascending: false, nullsFirst: false })
    .limit(60);

  if (error || !data) return [];

  const scored = data.map((p) => {
    const hay = (p.search_name ?? p.ascii_name ?? p.name).toLowerCase();
    // prefix match > word-boundary match > substring
    let score = 0;
    if (hay === q) score = 3;
    else if (hay.startsWith(q)) score = 2;
    else if (hay.includes(` ${q}`)) score = 1;
    return { p, score, pop: p.population ?? 0 };
  });
  scored.sort((a, b) => b.score - a.score || b.pop - a.pop);

  return scored.slice(0, limit).map(({ p }) => ({
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
