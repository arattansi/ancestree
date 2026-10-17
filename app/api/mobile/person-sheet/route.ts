import { type NextRequest, NextResponse } from "next/server";

import { sheetPersonParam, sheetSectionsParam } from "@/lib/person-sheet";
import { loadPersonSheet } from "@/lib/person-sheet.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * `GET /api/mobile/person-sheet?person=<id>&want=trees,reports,album,stories`
 * (Step 179.5): what the phone's full details of someone show beyond their
 * card, the same reads the web's sheet takes from `/api/person-sheet`, made
 * as the member through their bearer token, so RLS answers the phone as it
 * answers the web.
 */
export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) {
    return NextResponse.json({ error: "Sign in again." }, { status: 401, headers: NO_STORE });
  }

  const params = request.nextUrl.searchParams;
  const personId = sheetPersonParam(params.get("person"));
  const sections = sheetSectionsParam(params.get("want"));
  if (!personId || !sections) {
    return NextResponse.json({ error: "Whose details?" }, { status: 400, headers: NO_STORE });
  }

  const answer = await loadPersonSheet(personId, sections, auth.userId, auth.supabase);
  return NextResponse.json(answer, { headers: NO_STORE });
}
