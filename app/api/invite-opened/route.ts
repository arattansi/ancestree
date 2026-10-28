import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import {
  isInviteToken,
  isVisitorId,
  OPENED_PATH,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
} from "@/lib/invite-events";
import { createClient } from "@/lib/supabase/server";

/**
 * An invite's page was seen (Step 216): its beacon (`InviteOpened`) posts
 * the token once the page is drawn. A visitor is a random id in a cookie
 * only this route is sent, made on their first open, so one person opening
 * it twice in a day counts once; the database keeps a hash of it with the
 * invite and the day, and nothing else about them. Signed in, a member
 * already on the tree doesn't count (`note_invite_opened`). Answers nothing
 * either way.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const token =
    typeof body === "object" && body !== null ? (body as { token?: unknown }).token : null;
  if (!isInviteToken(token)) return new Response(null, { status: 204 });

  const store = await cookies();
  let visitor = store.get(VISITOR_COOKIE)?.value;
  if (!isVisitorId(visitor)) {
    visitor = randomUUID();
    store.set(VISITOR_COOKIE, visitor, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: OPENED_PATH,
      maxAge: VISITOR_MAX_AGE,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("note_invite_opened", {
    p_token: token,
    p_visitor: visitor,
  });
  if (error) console.error(`[invite-events] open not noted — ${error.message}`);
  return new Response(null, { status: 204 });
}
