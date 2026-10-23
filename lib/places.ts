import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCountryPlace } from "@/lib/country-names";
import type { Database } from "@/lib/database.types";
import {
  findPlaces,
  PLACE_CANDIDATES,
  PLACE_COLUMNS,
  placePattern,
  type PlaceHit,
} from "@/lib/place-lookup";
import { createClient } from "@/lib/supabase/server";

export { formatPlaceLabel, type PlaceHit } from "@/lib/place-lookup";

/**
 * The place picker's search (`findPlaces`, lib/place-lookup.ts), read as the
 * signed-in member, or with the client given: the phone's scribe (Step
 * 148.2) searches with its member's bearer client (`db`).
 */
export async function searchPlaces(
  query: string,
  limit = 8,
  db?: SupabaseClient<Database>,
): Promise<PlaceHit[]> {
  // Made once, and only for a search that goes out.
  let client: Promise<SupabaseClient<Database>> | undefined;
  return findPlaces(
    query,
    async (search) => {
      const supabase = await (client ??= db ? Promise.resolve(db) : createClient());
      const { data, error } = await supabase
        .from("places")
        .select(PLACE_COLUMNS)
        .ilike("search_name", placePattern(search))
        .order("population", { ascending: false, nullsFirst: false })
        .limit(PLACE_CANDIDATES);
      return error || !data ? [] : data;
    },
    limit,
  );
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
