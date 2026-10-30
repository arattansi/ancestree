import { NextResponse } from "next/server";

import { releasedFiles, removeCardFilesLater } from "@/lib/birthday-cards.server";
import { CARD_LINK_ERRORS, isCardLinkToken } from "@/lib/card-links";
import { cardSecretForRoute, cardViewer, sqlNull } from "@/lib/card-links.server";
import { friendlyDbError } from "@/lib/db-errors";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * A link signer takes their own signature off (Step 217.3): the one their
 * account or their browser's edit token signed (`delete_card_signature_by_link`).
 * Its files go once the answer has.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { token, signatureId } =
    typeof body === "object" && body !== null
      ? (body as { token?: unknown; signatureId?: unknown })
      : {};
  if (!isCardLinkToken(token) || typeof signatureId !== "string") {
    return NextResponse.json({ error: "Couldn’t take it off. Try again." }, { status: 400, headers: NO_STORE });
  }
  const [secret, viewer] = await Promise.all([cardSecretForRoute(), cardViewer()]);
  const { data, error } = await createAdminClient().rpc("delete_card_signature_by_link", {
    p_token: token,
    p_viewer: sqlNull(viewer),
    p_secret: secret,
    p_signature: signatureId,
  });
  if (error) {
    return NextResponse.json(
      { error: friendlyDbError(error.message, CARD_LINK_ERRORS, "Couldn’t take it off. Try again.") },
      { status: 400, headers: NO_STORE },
    );
  }
  removeCardFilesLater(releasedFiles(data));
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
