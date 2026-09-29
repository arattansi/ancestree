import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { formatPlaceLabel, getPlacesByIds } from "@/lib/places";

/**
 * What a page shows of an entry besides its fields (Step 77.4, audit R3):
 * its photo's address and the names of its places, read one way for the
 * canvas, the edit and suggest pages and the account page.
 */

type DbClient = SupabaseClient<Database>;

/** How long a photo's signed address works; a page is drawn well within it. */
export const PHOTO_URL_TTL_S = 60 * 60;

/**
 * Signed addresses for stored photos, by path. A path storage won't sign
 * for this client (a file gone, a photo out of sight) is left out.
 */
export async function signedPhotoUrls(
  db: DbClient,
  paths: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  const { data } = await db.storage
    .from("photos")
    .createSignedUrls(unique, PHOTO_URL_TTL_S);
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

/** One stored photo's signed address, or `null`. */
export async function signedPhotoUrl(
  db: DbClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage
    .from("photos")
    .createSignedUrl(path, PHOTO_URL_TTL_S);
  return data?.signedUrl ?? null;
}

/**
 * How a form names an entry's places of birth and death: the GeoNames
 * place's own label, or the words stored when there's no place.
 */
export async function placeLabels(row: {
  place_id_birth: number | null;
  place_id_death: number | null;
  city_of_birth: string | null;
  place_of_death: string | null;
}): Promise<{ birth: string | null; death: string | null }> {
  const places = await getPlacesByIds(
    [row.place_id_birth, row.place_id_death].filter(
      (n): n is number => typeof n === "number",
    ),
  );
  const birth =
    row.place_id_birth != null ? places.get(row.place_id_birth) : undefined;
  const death =
    row.place_id_death != null ? places.get(row.place_id_death) : undefined;
  return {
    birth: birth ? formatPlaceLabel(birth) : row.city_of_birth,
    death: death ? formatPlaceLabel(death) : row.place_of_death,
  };
}
