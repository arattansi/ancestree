import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { claimMessagePush, pushAfter } from "@/lib/push.server";
import { createClient } from "@/lib/supabase/server";

/**
 * `POST /api/messages/push` `{ messageId }` (Step 204): the messenger says
 * it sent a message; the other member's phones are told who wrote, once a
 * message, unless they muted it (`claim_message_push` decides).
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
  await pushAfter(claimMessagePush(await createClient(), body?.messageId));
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
