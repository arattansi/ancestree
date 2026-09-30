import { type NextRequest, NextResponse } from "next/server";

import { getProfile } from "@/lib/auth";
import { sheetPersonParam, sheetSectionsParam } from "@/lib/person-sheet";
import { loadPersonSheet } from "@/lib/person-sheet.server";

/**
 * `GET /api/person-sheet?person=<id>&want=trees,reports,album,stories`: what the
 * details sheet shows about someone beyond their card (Step 87.6, audit
 * S6), read together for whoever is signed in, as them. A route handler
 * rather than server actions because the client sends actions one at a
 * time: the sheet's reads waited in line behind each other and behind any
 * save, and one for a person no longer open couldn't be called off. A share
 * link's viewer isn't signed in and its sheet reads none of these.
 */
export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Sign in to see this." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const personId = sheetPersonParam(params.get("person"));
  const sections = sheetSectionsParam(params.get("want"));
  if (!personId || !sections) {
    return NextResponse.json({ error: "Whose details?" }, { status: 400 });
  }

  const answer = await loadPersonSheet(personId, sections, profile.auth_user_id);
  return NextResponse.json(answer, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
