"use server";

import { requireAdmin, requireProfile } from "@/lib/auth";
import { ALPHA2, countryName } from "@/lib/country-names";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPlaceLabel, searchPlaces, type PlaceHit } from "@/lib/places";

export type PlaceOption = PlaceHit & { label: string };

/** Debounced autocomplete search — any signed-in member. */
export async function searchPlacesAction(query: string): Promise<PlaceOption[]> {
  await requireProfile();
  const hits = await searchPlaces(query);
  return hits.map((h) => ({ ...h, label: formatPlaceLabel(h) }));
}

/** IDs at/above this base were added by an admin, not imported from GeoNames. */
const USER_PLACE_ID_BASE = 10_000_000_000;

/**
 * Admin-only escape hatch: add a place that isn't in GeoNames (a small village,
 * a renamed town) rather than reopening free-text entry for everyone.
 */
export async function requestNewPlace(input: {
  name: string;
  countryCode: string;
  admin1?: string | null;
}): Promise<{ place?: PlaceOption; error?: string }> {
  await requireAdmin();

  const name = input.name.trim();
  const cc = input.countryCode.trim().toUpperCase();
  if (name.length < 2) return { error: "Enter the place name." };
  if (!/^[A-Z]{2}$/.test(cc)) return { error: "Pick a country." };

  const admin = createAdminClient();

  const { data: top } = await admin
    .from("places")
    .select("id")
    .gte("id", USER_PLACE_ID_BASE)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = (top?.id ?? USER_PLACE_ID_BASE - 1) + 1;

  const { data, error } = await admin
    .from("places")
    .insert({
      id,
      name,
      ascii_name: name.normalize("NFD").replace(/[̀-ͯ]/g, ""),
      country_code: cc,
      admin1_code: input.admin1?.trim() || null,
      feature_class: "P",
      feature_code: "PPLX",
      population: null,
    })
    .select("id, name, admin1_code, country_code")
    .single();

  if (error || !data) return { error: "Couldn't add that place. Try again." };

  const hit = data as PlaceHit;
  return { place: { ...hit, label: formatPlaceLabel(hit) } };
}

/** Country <select> options for the "add a place" form. */
export async function listCountryOptions(): Promise<
  { code: string; name: string }[]
> {
  return ALPHA2.map((code) => ({ code, name: countryName(code) || code })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}
