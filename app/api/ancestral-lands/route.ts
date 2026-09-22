import { type NextRequest, NextResponse } from "next/server";

import { getProfile } from "@/lib/auth";
import {
  canLookUpPlace,
  LANDS_UNAVAILABLE,
  type AncestralLandsAnswer,
} from "@/lib/native-land";
import { territoriesAt } from "@/lib/native-land.server";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /api/ancestral-lands?place=<places.id>`: the territories Native Land
 * Digital maps at a place of birth or death (Step 27). Members only; a share
 * link shows just what the family wrote.
 *
 * A route handler rather than a server action because the client sends
 * server actions one at a time, so a slow answer from NLD would hold up every
 * other action on the panel or form. Nothing is cached on either leg: NLD's
 * terms forbid storing its data (`lib/native-land.ts`).
 */
export async function GET(request: NextRequest) {
  if (!(await getProfile())) {
    return NextResponse.json({ error: "Sign in to see this." }, { status: 401 });
  }

  const placeId = Number(request.nextUrl.searchParams.get("place"));
  if (!Number.isSafeInteger(placeId) || placeId <= 0) {
    return NextResponse.json({ error: "Which place?" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: place } = await supabase
    .from("places")
    .select("latitude, longitude, feature_class")
    .eq("id", placeId)
    .maybeSingle();

  // Nothing NLD could be asked about (no coordinates, or a whole region):
  // say so, rather than "no territories here".
  if (!place || !canLookUpPlace(place)) return answer(LANDS_UNAVAILABLE);

  const territories = await territoriesAt(place.latitude, place.longitude);
  return answer(
    territories ? { territories, available: true } : LANDS_UNAVAILABLE,
  );
}

function answer(body: AncestralLandsAnswer) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
