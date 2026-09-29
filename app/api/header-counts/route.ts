import { NextResponse } from "next/server";

import { loadHeaderCounts } from "@/lib/header-counts.server";

/**
 * `GET /api/header-counts`: the header's badges for whoever is signed in
 * (Step 77.2), asked again as they move between pages or come back to the
 * tab, so the counts don't wait for the next save to change (audit N7).
 * A route handler rather than a server action because the client sends
 * actions one at a time: a count shouldn't queue behind a save.
 */
export async function GET() {
  const counts = await loadHeaderCounts();
  if (!counts) {
    return NextResponse.json({ error: "Sign in to see this." }, { status: 401 });
  }
  return NextResponse.json(counts, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
