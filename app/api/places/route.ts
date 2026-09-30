import { type NextRequest, NextResponse } from "next/server";

import type { PlaceOption } from "@/app/actions/places";
import { getProfile } from "@/lib/auth";
import { formatPlaceLabel, searchPlaces } from "@/lib/places";

/** Longer than any place's name and region: nothing to search for. */
const QUERY_MAX = 200;

/**
 * `GET /api/places?q=<typed>`: the place picker's search as it's typed
 * (Step 66), for anyone signed in. A route handler rather than a server
 * action since Step 87.6 (audit S6): the client sends actions one at a
 * time, so each keystroke's search waited for the one before it, and for
 * any save, and none could be called off once the typing moved on.
 */
export async function GET(request: NextRequest) {
  if (!(await getProfile())) {
    return NextResponse.json({ error: "Sign in to see this." }, { status: 401 });
  }
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const hits = q.length > QUERY_MAX ? [] : await searchPlaces(q);
  const places: PlaceOption[] = hits.map((h) => ({ ...h, label: formatPlaceLabel(h) }));
  return NextResponse.json(
    { places },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
