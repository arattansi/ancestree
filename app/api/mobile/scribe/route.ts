import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";

import { readScribeRequest } from "@/lib/scribe";
import { scribeContext, writeUp } from "@/lib/scribe.server";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

/** A long story takes Claude a minute or two to write up. */
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "private, no-store" };

function answer(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * `POST /api/mobile/scribe` (Step 148): the phone app sends what it heard
 * someone tell (`{ personId, heard, locale }`, `lib/scribe.ts`) with its
 * session as a bearer token; Claude writes it up and the draft comes back
 * (`{ draft }`) for the member to read over before telling it. Nothing is
 * kept here: the story is told from the phone, through `add_story`.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return answer({ error: "Sign in again." }, 401);

  const read = readScribeRequest(await request.json().catch(() => null));
  if ("problem" in read) return answer({ error: read.problem }, 400);

  const context = await scribeContext(auth.supabase, auth.userId, read.request.personId);
  if (!context) return answer({ error: "That entry isn’t on your tree." }, 404);

  if (!process.env.ANTHROPIC_API_KEY) {
    return answer({ error: "The scribe isn’t set up yet." }, 503);
  }

  try {
    const draft = await writeUp(read.request, context);
    if (draft === "refused") return answer({ error: "The scribe couldn’t write this one up." }, 422);
    if (draft === "too-long") return answer({ error: "That’s longer than one story may be." }, 413);
    if (draft === "failed") return answer({ error: "Couldn’t write it up. Try again." }, 502);
    return answer({ draft });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
      return answer({ error: "The scribe is busy. Try again in a minute." }, 503);
    }
    console.error("scribe", error instanceof Anthropic.APIError ? error.status : error);
    return answer({ error: "Couldn’t write it up. Try again." }, 502);
  }
}
