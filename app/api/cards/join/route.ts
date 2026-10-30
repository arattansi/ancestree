import { after, NextResponse } from "next/server";

import { CARD_LINK_ERRORS, isCardLinkToken } from "@/lib/card-links";
import { cardSecretForRoute, cardViewer, notABot, sqlNull } from "@/lib/card-links.server";
import { friendlyDbError } from "@/lib/db-errors";
import { alertRootsOfAccessRequest } from "@/lib/request-alerts.server";
import { nameAndEmailProblem } from "@/lib/request-forms";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Ask to join the person's family tree from their card (Step 217.3,
 * decision 11): only someone who signed through the public link as family,
 * whose relation passes the bloodline gate on the person's home tree
 * (`ask_to_join_from_card`). The ask waits in that tree's Roots' queue,
 * saying whose card and what relation; the link never lets anyone in. A new
 * ask emails the Roots once the asker has their answer.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (!isCardLinkToken(b.token)) {
    return NextResponse.json({ error: "This link no longer works." }, { status: 400, headers: NO_STORE });
  }
  const entered = { firstName: str(b.firstName), lastName: str(b.lastName), email: str(b.email).toLowerCase() };
  const problem = nameAndEmailProblem(entered);
  if (problem) return NextResponse.json({ error: problem.message }, { status: 400, headers: NO_STORE });
  // Approval leads straight into the tree, so this is where they agree to it.
  if (b.consent !== true) {
    return NextResponse.json(
      { error: "Please accept the privacy notice to continue." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!(await notABot())) {
    return NextResponse.json({ error: "Couldn’t send it. Try again." }, { status: 403, headers: NO_STORE });
  }

  const [secret, viewer] = await Promise.all([cardSecretForRoute(), cardViewer()]);
  const { data, error } = await createAdminClient().rpc("ask_to_join_from_card", {
    p_token: b.token,
    p_viewer: sqlNull(viewer),
    p_secret: secret,
    p_first_name: entered.firstName,
    p_last_name: entered.lastName,
    p_email: entered.email,
  });
  if (error) {
    return NextResponse.json(
      { error: friendlyDbError(error.message, CARD_LINK_ERRORS, "Couldn’t send it. Try again.") },
      { status: 400, headers: NO_STORE },
    );
  }
  const answer = (data ?? {}) as { treeId?: string; treeName?: string; created?: boolean };
  if (answer.created && answer.treeId) {
    const { treeId, treeName } = answer;
    after(() =>
      alertRootsOfAccessRequest({
        treeId,
        treeName: treeName ?? "",
        firstName: entered.firstName,
        lastName: entered.lastName,
      }),
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
