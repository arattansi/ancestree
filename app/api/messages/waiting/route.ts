import { NextResponse, type NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { tellWaiting } from "@/lib/message-waiting.server";
import { createClient } from "@/lib/supabase/server";

/**
 * `POST /api/messages/waiting` `{ conversationId }` (Step 182): the
 * messenger says it sent a message that waits for the other member, who
 * has no key yet; they're emailed that the sender wrote, once for each
 * sender until they visit (`tellWaiting` decides). Answers `{ told }`.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { conversationId?: unknown } | null;
  const told = await tellWaiting(await createClient(), user.id, body?.conversationId);
  return NextResponse.json(told, { headers: { "Cache-Control": "private, no-store" } });
}
