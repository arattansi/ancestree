import { NextResponse, type NextRequest } from "next/server";

import { claimCardStartedPush, pushAfter } from "@/lib/push.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

/**
 * `POST /api/mobile/cards/push` `{ cardId }` (Step 221): the phone started
 * a birthday card, and those it told in the app hear of it on their phones
 * too, each once a card (`claim_card_started_push` decides, asked as
 * whoever started it). The web's own start action does this itself.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { cardId?: unknown } | null;
  await pushAfter(claimCardStartedPush(auth.supabase, body?.cardId));
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
