import { type NextRequest, NextResponse } from "next/server";

import { landsAtPlace, landsResponse } from "@/lib/ancestral-lands.server";
import { getProfile } from "@/lib/auth";
import { placeIdParam } from "@/lib/native-land";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /api/ancestral-lands?place=<places.id>`: the territories Native Land
 * Digital maps at a place of birth or death (Step 27), for anyone signed in:
 * a tree's members, and visitors from another tree (27.9). A share link's
 * viewer isn't signed in, so asks through the link instead
 * (`app/shared/[token]/ancestral-lands`).
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

  const placeId = placeIdParam(request.nextUrl.searchParams.get("place"));
  if (placeId == null) {
    return NextResponse.json({ error: "Which place?" }, { status: 400 });
  }

  return landsResponse(await landsAtPlace(await createClient(), placeId));
}
