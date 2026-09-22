import "server-only";

import { parseTerritories, type Territory } from "@/lib/native-land";

const ENDPOINT = "https://native-land.ca/api/index.php";

/** Long enough for a slow answer, short enough that a card isn't left waiting. */
const TIMEOUT_MS = 6_000;

/**
 * The territories Native Land Digital maps at a point, or null when NLD
 * can't be asked (no `NATIVE_LAND_API_KEY`) or doesn't answer. Asked afresh
 * every time and never cached: NLD's terms forbid storing its data without
 * its permission. See `lib/native-land.ts`.
 */
export async function territoriesAt(
  latitude: number,
  longitude: number,
): Promise<Territory[] | null> {
  const key = process.env.NATIVE_LAND_API_KEY;
  if (!key) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("maps", "territories");
  url.searchParams.set("position", `${latitude},${longitude}`);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // The status only: the URL carries the key.
      console.warn(`Native Land lookup failed: HTTP ${res.status}`);
      return null;
    }
    return parseTerritories(await res.json());
  } catch {
    return null;
  }
}
