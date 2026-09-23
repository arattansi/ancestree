import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { Database } from "@/lib/database.types";
import {
  canLookUpPlace,
  LANDS_UNAVAILABLE,
  type AncestralLandsAnswer,
} from "@/lib/native-land";
import { territoriesAt } from "@/lib/native-land.server";

/**
 * What a card is told about a place of birth or death (Step 27): the
 * territories Native Land Digital maps there, asked afresh. Both ways of
 * asking end here: `app/api/ancestral-lands` for members and visitors, and
 * `app/shared/[token]/ancestral-lands` for a share link (27.9). Nothing NLD
 * could be asked about (no coordinates, or a whole region) is unavailable,
 * rather than "no territories here".
 */
export async function landsAtPlace(
  db: SupabaseClient<Database>,
  placeId: number,
): Promise<AncestralLandsAnswer> {
  const { data: place } = await db
    .from("places")
    .select("latitude, longitude, feature_class")
    .eq("id", placeId)
    .maybeSingle();
  if (!place || !canLookUpPlace(place)) return LANDS_UNAVAILABLE;

  const territories = await territoriesAt(place.latitude, place.longitude);
  return territories ? { territories, available: true } : LANDS_UNAVAILABLE;
}

/** Never cached on the way to the browser: NLD's terms forbid storing its data. */
export function landsResponse(body: AncestralLandsAnswer) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
