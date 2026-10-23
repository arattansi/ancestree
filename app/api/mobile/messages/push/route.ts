import { NextResponse, type NextRequest } from "next/server";

import { claimMessagePush, pushAfter } from "@/lib/push.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

/**
 * `POST /api/mobile/messages/push` `{ messageId }` (Step 204): the phone's
 * `/api/messages/push`, as the member its bearer token names.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
  await pushAfter(claimMessagePush(auth.supabase, body?.messageId));
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
