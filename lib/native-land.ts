/**
 * Ancestral lands (Step 27): the Indigenous territories a place of birth or
 * death sits on, as Native Land Digital (native-land.ca) maps them.
 *
 * NLD's Data Sovereignty Treaty, agreed to when its API key was issued,
 * shapes everything here: non-commercial use only; NLD credited as the
 * source, with Indigenous communities acknowledged as the stewards of the
 * data; and nothing stored or passed on without NLD's permission. So the
 * names are asked for live whenever a card or form shows them
 * (`native-land.server.ts`, behind `app/api/ancestral-lands`) and never
 * saved. Only where NLD maps nothing, or can't be asked, does a family say
 * whose land it is in its own words (`people.ancestral_lands_birth` /
 * `_death`, `pets.ancestral_lands_birth`); where NLD maps the place, its
 * names are what's shown (Step 27.8).
 */

export const NATIVE_LAND_URL = "https://native-land.ca";

/** One territory, as NLD names it, with its page on native-land.ca. */
export type Territory = { name: string; url: string | null };

/**
 * What `/api/ancestral-lands` answers. `available` is false when NLD couldn't
 * be asked (no API key) or didn't answer, so a caller shows nothing rather
 * than claiming there are no territories at the place.
 */
export type AncestralLandsAnswer = {
  territories: Territory[];
  available: boolean;
};

export const LANDS_UNAVAILABLE: AncestralLandsAnswer = {
  territories: [],
  available: false,
};

type PlacePoint = {
  latitude: number | null;
  longitude: number | null;
  feature_class: string | null;
};

/**
 * A place worth asking about: a GeoNames populated place (feature class `P`)
 * with coordinates. A country or region (`A`) has only a centroid, which
 * would name whoever's land lies in the middle of it, and a place added by
 * hand (`requestNewPlace`) has no coordinates at all.
 */
export function canLookUpPlace(
  place: PlacePoint,
): place is PlacePoint & { latitude: number; longitude: number } {
  return (
    place.feature_class === "P" &&
    typeof place.latitude === "number" &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Links go only to NLD's own site: an API answer is data, not a place to send people. */
function territoryUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    const nld =
      url.hostname === "native-land.ca" ||
      url.hostname.endsWith(".native-land.ca");
    return url.protocol === "https:" && nld ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The territories in NLD's answer to `maps=territories&position=lat,lng`: an
 * array of GeoJSON features whose `properties` carry `Name`, `Slug` and
 * `description` (the territory's page on native-land.ca). One entry per name,
 * sorted by name. Null when the answer isn't a list of features, e.g. the
 * `{ error }` NLD sends about a missing or bad key.
 */
export function parseTerritories(json: unknown): Territory[] | null {
  const features = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.features)
      ? json.features
      : null;
  if (!features) return null;

  const byName = new Map<string, Territory>();
  for (const feature of features) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue;
    const raw = feature.properties.Name;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) continue;
    const key = name.toLocaleLowerCase("en");
    if (byName.has(key)) continue;
    byName.set(key, { name, url: territoryUrl(feature.properties.description) });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

const LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/**
 * The names as an English list, split so each name can be drawn as a link:
 * `[A] ", " [B] ", and " [C]`.
 */
export function landsListParts(
  names: readonly string[],
): { type: "name" | "literal"; value: string }[] {
  return LIST.formatToParts(names).map((part) => ({
    type: part.type === "element" ? "name" : "literal",
    value: part.value,
  }));
}
