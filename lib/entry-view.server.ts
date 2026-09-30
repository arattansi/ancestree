import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { cardPhotoEdge, parseCrop } from "@/lib/image-crop";
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

type PhotoRow = { photo_path: string | null; photo_crop: unknown };

/**
 * Card-sized signed addresses (Step 87.5, audit C3): a storage transform
 * that fits each photo in a `cardPhotoEdge` square, a few KB instead of
 * the whole upload behind a 40px avatar. Storage signs a transform one
 * photo at a time, so these go out together. Returns each row's address,
 * or `null` where storage wouldn't sign one (the caller falls back to the
 * full-size address).
 */
export async function signedCardPhotoUrls(
  db: DbClient,
  rows: readonly PhotoRow[],
): Promise<(row: PhotoRow) => string | null> {
  const keyOf = (path: string, edge: number) => `${edge}:${path}`;
  const wanted = new Map<string, { path: string; edge: number }>();
  for (const row of rows) {
    if (!row.photo_path) continue;
    const edge = cardPhotoEdge(parseCrop(row.photo_crop));
    wanted.set(keyOf(row.photo_path, edge), { path: row.photo_path, edge });
  }
  const urls = new Map<string, string>();
  await Promise.all(
    [...wanted].map(async ([key, { path, edge }]) => {
      const { data } = await db.storage
        .from("photos")
        .createSignedUrl(path, PHOTO_URL_TTL_S, {
          transform: { width: edge, height: edge, resize: "contain" },
        });
      if (data?.signedUrl) urls.set(key, data.signedUrl);
    }),
  );
  return (row) =>
    row.photo_path
      ? (urls.get(
          keyOf(row.photo_path, cardPhotoEdge(parseCrop(row.photo_crop))),
        ) ?? null)
      : null;
}

/** A row's two photo addresses, from `signedPhotoUrls` and
 *  `signedCardPhotoUrls`; the card falls back to the full size. */
export function photoUrlsOf(
  row: PhotoRow,
  urlByPath: ReadonlyMap<string, string>,
  cardUrlOf: (row: PhotoRow) => string | null,
): { photo_url: string | null; photo_card_url: string | null } {
  const full = row.photo_path ? (urlByPath.get(row.photo_path) ?? null) : null;
  return { photo_url: full, photo_card_url: full && (cardUrlOf(row) ?? full) };
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
