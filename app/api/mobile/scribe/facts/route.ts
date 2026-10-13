import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";

import { readScribeRequest } from "@/lib/scribe";
import { factsRoster, scribeFacts } from "@/lib/scribe-facts.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

/** A long story takes Claude a minute or two to read. */
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "private, no-store" };

function answer(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * `POST /api/mobile/scribe/facts` (Step 148.2): the phone sends what it
 * heard, as it does for the write-up (`{ personId, heard, locale }`), and
 * gets back what the story tells the tree (`{ facts }`, `lib/scribe-facts.ts`):
 * details about people on it, each the way the member may make it, the
 * people it mentions, and relatives it names who aren't on it. Nothing is
 * written here: the member accepts each one on the phone.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return answer({ error: "Sign in again." }, 401);

  const read = readScribeRequest(await request.json().catch(() => null));
  if ("problem" in read) return answer({ error: read.problem }, 400);

  let roster;
  try {
    roster = await factsRoster(auth.supabase, auth.userId, read.request.personId);
  } catch {
    return answer({ error: "Couldn’t read your family. Try again." }, 502);
  }
  if (!roster) return answer({ error: "That entry isn’t on your tree." }, 404);

  if (!process.env.ANTHROPIC_API_KEY) {
    return answer({ error: "The scribe isn’t set up yet." }, 503);
  }

  try {
    const facts = await scribeFacts(auth.supabase, read.request, roster);
    if (facts === "refused") return answer({ error: "The scribe couldn’t read this one." }, 422);
    if (facts === "too-long") return answer({ error: "That’s longer than one story may be." }, 413);
    if (facts === "failed") return answer({ error: "Couldn’t look for facts. Try again." }, 502);
    return answer({ facts });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
      return answer({ error: "The scribe is busy. Try again in a minute." }, 503);
    }
    console.error("scribe facts", error instanceof Anthropic.APIError ? error.status : error);
    return answer({ error: "Couldn’t look for facts. Try again." }, 502);
  }
}
