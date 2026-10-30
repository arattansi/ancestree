import { isCardLinkToken } from "@/lib/card-links";
import { cardSecretForRoute, cardViewer, sqlNull } from "@/lib/card-links.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A card link's page was drawn, or its join button shown (Step 217.3): the
 * page's beacon posts the token once each, so a chat app's link preview
 * doesn't count. Counted once per browser a day by its secret, never the
 * person or the card's managers (`note_card_link_seen`). Answers nothing.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const { token, what } =
    typeof body === "object" && body !== null ? (body as { token?: unknown; what?: unknown }) : {};
  if (!isCardLinkToken(token) || (what !== "opened" && what !== "join_shown")) {
    return new Response(null, { status: 204 });
  }
  const [secret, viewer] = await Promise.all([cardSecretForRoute(), cardViewer()]);
  const { error } = await createAdminClient().rpc("note_card_link_seen", {
    p_token: token,
    p_viewer: sqlNull(viewer),
    p_secret: secret,
    p_what: what,
  });
  if (error) console.error(`[cards] ${what} not noted — ${error.message}`);
  return new Response(null, { status: 204 });
}
