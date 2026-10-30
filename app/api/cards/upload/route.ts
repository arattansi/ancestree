import { NextResponse } from "next/server";

import { CARD_FILE_TYPES } from "@/lib/birthday-cards";
import { CARD_LINK_ERRORS, isCardLinkToken } from "@/lib/card-links";
import { cardSecretForRoute, cardViewer, notABot, sqlNull } from "@/lib/card-links.server";
import { friendlyDbError } from "@/lib/db-errors";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * A place for one file of a link signer's (Step 217.3): the database checks
 * the link, that signing is open and that they could sign
 * (`card_link_upload`), then storage hands back a one-time upload for that
 * path, so the photo or voice memo goes to the `cards` bucket straight from
 * the browser and never through a function (Vercel's 4.5 MB limit).
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { token, kind, type } =
    typeof body === "object" && body !== null
      ? (body as { token?: unknown; kind?: unknown; type?: unknown })
      : {};
  if (
    !isCardLinkToken(token) ||
    (kind !== "audio" && kind !== "photo") ||
    typeof type !== "string" ||
    !CARD_FILE_TYPES[type]
  ) {
    return NextResponse.json({ error: "That file can’t go on a card." }, { status: 400, headers: NO_STORE });
  }
  if (!(await notABot())) {
    return NextResponse.json({ error: "Couldn’t take that. Try again." }, { status: 403, headers: NO_STORE });
  }
  const [secret, viewer] = await Promise.all([cardSecretForRoute(), cardViewer()]);
  const admin = createAdminClient();
  const { data: path, error } = await admin.rpc("card_link_upload", {
    p_token: token,
    p_viewer: sqlNull(viewer),
    p_secret: secret,
    p_kind: kind,
    p_type: type,
  });
  if (error || typeof path !== "string") {
    return NextResponse.json(
      { error: friendlyDbError(error?.message, CARD_LINK_ERRORS, "Couldn’t take that file. Try again.") },
      { status: 400, headers: NO_STORE },
    );
  }
  const { data: upload, error: uploadError } = await admin.storage.from("cards").createSignedUploadUrl(path);
  if (uploadError || !upload) {
    console.error(`[cards] no upload place — ${uploadError?.message}`);
    return NextResponse.json({ error: "Couldn’t take that file. Try again." }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ path, uploadToken: upload.token }, { headers: NO_STORE });
}
