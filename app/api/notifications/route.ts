import { NextResponse } from "next/server";

import { getProfile } from "@/lib/auth";
import { listNotifications } from "@/lib/claims";

/**
 * `GET /api/notifications`: the header bell's list, read when it's opened
 * (Step 77.2) rather than drawn into every page and every save's reply. A
 * route handler, as `/api/header-counts`, so opening the bell never waits
 * behind a save.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Sign in to see this." }, { status: 401 });
  }
  const items = await listNotifications(profile.auth_user_id);
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
