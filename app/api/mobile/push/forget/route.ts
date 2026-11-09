import { NextResponse, type NextRequest } from "next/server";

import { readPushForget } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * `POST /api/mobile/push/forget` `{ token, userId }`: a phone nobody is
 * signed in on any more gives its Expo push token back. Signing out does
 * this itself, as the member (`forget_push_token`); this is for when that
 * couldn't reach us (no connection, or the session was already gone), and
 * the phone asks again later with no session to ask as. Holding the token
 * is the say-so, as it is Expo's for sending to it, and only that member's
 * row for it goes: one who signed in on the phone since keeps theirs.
 */
export async function POST(request: NextRequest) {
  const forget = readPushForget(await request.json().catch(() => null));
  if (!forget) return NextResponse.json({ error: "Bad request." }, { status: 400, headers: NO_STORE });
  const { error } = await createAdminClient()
    .from("push_tokens")
    .delete()
    .eq("token", forget.token)
    .eq("user_id", forget.userId);
  if (error) {
    console.error("[push] couldn't forget a phone", error);
    return NextResponse.json({ error: "Try again." }, { status: 503, headers: NO_STORE });
  }
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
