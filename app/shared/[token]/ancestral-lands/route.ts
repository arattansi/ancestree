import { type NextRequest, NextResponse } from "next/server";

import { landsAtPlace, landsResponse } from "@/lib/ancestral-lands.server";
import { placeIdParam } from "@/lib/native-land";
import { sharedTreeShowsPlace } from "@/lib/share-links.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * `GET /shared/<token>/ancestral-lands?place=<places.id>`: what
 * `/api/ancestral-lands` tells the signed-in, for a share link's viewer, who
 * isn't (Step 27.9). Public like the page it serves, but only while the link
 * works and only about a place its cards show, so the link can't be used to
 * ask Native Land Digital about anywhere else. Never cached, as NLD's terms
 * require.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/shared/[token]/ancestral-lands">,
) {
  const { token } = await ctx.params;
  const placeId = placeIdParam(request.nextUrl.searchParams.get("place"));
  if (placeId == null) {
    return NextResponse.json({ error: "Which place?" }, { status: 400 });
  }

  if (!(await sharedTreeShowsPlace(token, placeId))) {
    return NextResponse.json({ error: "Not on this tree." }, { status: 404 });
  }

  // The viewer has no session to read `places` with.
  return landsResponse(await landsAtPlace(createAdminClient(), placeId));
}
