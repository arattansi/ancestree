import { NextResponse, type NextRequest } from "next/server";

import { claimStoryPush, pushAfter } from "@/lib/push.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

/**
 * `POST /api/mobile/stories/push` `{ storyId }` (Step 204): the phone told
 * a story, or put more people in one, and those it now shows to are told
 * on their phones, each once a story (`claim_story_push` decides). The
 * web's own story actions do this themselves.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { storyId?: unknown } | null;
  await pushAfter(claimStoryPush(auth.supabase, body?.storyId));
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
