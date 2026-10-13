import { type NextRequest, NextResponse } from "next/server";

import { readClaimInviteRequest } from "@/lib/claim-invites";
import { mintClaimInvite } from "@/lib/claim-invite-send.server";
import { revalidateTreePages } from "@/lib/revalidate";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

const NO_STORE = { "Cache-Control": "private, no-store" };

function answer(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * `POST /api/mobile/claim-invite` (Step 148.4): the phone asks for an
 * invite to claim one entry (`{ personId, email, treeId }`), as the web's
 * `sendClaimInvite` makes one: the same checks, made as the member
 * (`mintClaimInvite` with their bearer client), then the invite made and
 * emailed with the service role. The scribe sends one for a relative it
 * has just added, when the member gave an address.
 *
 * Answers `{ email, minted }`; made but not emailed, `{ minted, error }`
 * (still 200: the invite stands); refused, `{ error }` with 422.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return answer({ error: "Sign in again." }, 401);

  const read = readClaimInviteRequest(await request.json().catch(() => null));
  if ("problem" in read) return answer({ error: read.problem }, 400);

  const { data: inviter } = await auth.supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", auth.userId)
    .maybeSingle();
  if (!inviter) return answer({ error: "Sign in again." }, 401);

  const { personId, email, treeId } = read.request;
  try {
    const sent = await mintClaimInvite(inviter, personId, email, treeId, auth.supabase);
    if (sent.minted) revalidateTreePages();
    return answer(sent, sent.minted ? 200 : 422);
  } catch (error) {
    console.error("claim invite", error);
    return answer({ error: "Couldn’t send the invite. Try again." }, 502);
  }
}
