import { NextResponse, type NextRequest } from "next/server";

import { tellWaiting } from "@/lib/message-waiting.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

/**
 * `POST /api/mobile/messages/waiting` `{ conversationId }` (Step 182): the
 * phone's `/api/messages/waiting`, as the member its bearer token names.
 * Answers `{ told }`.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { conversationId?: unknown } | null;
  const told = await tellWaiting(auth.supabase, auth.userId, body?.conversationId);
  return NextResponse.json(told, { headers: { "Cache-Control": "private, no-store" } });
}
