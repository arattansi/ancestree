import { NextResponse } from "next/server";

import { CARD_MESSAGE_MAX, CARD_VOICE_SECONDS } from "@/lib/birthday-cards";
import { releasedFiles, removeCardFilesLater } from "@/lib/birthday-cards.server";
import { asCardInk } from "@/lib/card-ink";
import { CARD_LINK_ERRORS, isCardLinkToken, thanksEmail } from "@/lib/card-links";
import { cardSecretForRoute, cardViewer, notABot, sqlNull } from "@/lib/card-links.server";
import { friendlyDbError } from "@/lib/db-errors";
import { MAX_NAME_LENGTH } from "@/lib/request-forms";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Sign a card through its link, or change one's signature (Step 217.3):
 * signed in as themself, or signed out with a name, the browser's secret
 * making their edit token. Ink drawn on a touch screen comes too (Step
 * 217.4), checked as the database checks it, and, signed out, an email
 * for the person's thank-you if they gave one (Step 217.5, kept only until
 * it's sent). A form a bot filled in (the hidden `website` field) is
 * answered as signed and goes nowhere; BotID's verdict and the
 * database's caps (200 a card, three a day a browser, 300 an hour in all)
 * stand behind it (`sign_card_by_link`). Files a change let go are removed
 * once the answer has gone.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Couldn’t sign. Try again." }, { status: 400, headers: NO_STORE });
  }
  const b = body as Record<string, unknown>;
  if (str(b.website)?.trim()) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  if (!isCardLinkToken(b.token)) {
    return NextResponse.json({ error: "This link no longer works." }, { status: 400, headers: NO_STORE });
  }
  const name = (str(b.name) ?? "").trim();
  const message = (str(b.message) ?? "").trim();
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: "That name is too long." }, { status: 400, headers: NO_STORE });
  }
  if (message.length > CARD_MESSAGE_MAX) {
    return NextResponse.json(
      { error: `Keep it under ${CARD_MESSAGE_MAX.toLocaleString("en")} characters.` },
      { status: 400, headers: NO_STORE },
    );
  }
  const ink = b.ink == null ? null : asCardInk(b.ink);
  if (b.ink != null && !ink) {
    return NextResponse.json(
      { error: "That drawing can’t go on the card. Clear it and try again." },
      { status: 400, headers: NO_STORE },
    );
  }
  const email = thanksEmail(b.email);
  if (!email) {
    return NextResponse.json(
      { error: "Check your email address, or leave it empty." },
      { status: 400, headers: NO_STORE },
    );
  }
  const seconds =
    typeof b.audioSeconds === "number" && Number.isFinite(b.audioSeconds)
      ? Math.min(CARD_VOICE_SECONDS + 5, Math.max(0, Math.round(b.audioSeconds)))
      : null;
  if (!(await notABot())) {
    return NextResponse.json({ error: "Couldn’t sign. Try again." }, { status: 403, headers: NO_STORE });
  }

  const [secret, viewer] = await Promise.all([cardSecretForRoute(), cardViewer()]);
  const audioPath = str(b.audioPath);
  const { data, error } = await createAdminClient().rpc("sign_card_by_link", {
    p_token: b.token,
    p_viewer: sqlNull(viewer),
    p_secret: secret,
    p_name: name,
    p_relation: sqlNull(str(b.relation)),
    p_message: message,
    p_audio_path: sqlNull(audioPath),
    p_audio_seconds: sqlNull(audioPath ? seconds : null),
    p_photo_path: sqlNull(str(b.photoPath)),
    p_ink: sqlNull(ink),
    // Asked only of someone signed out; the database keeps none otherwise.
    p_email: sqlNull(viewer ? null : email.email),
  });
  if (error) {
    return NextResponse.json(
      { error: friendlyDbError(error.message, CARD_LINK_ERRORS, "Couldn’t sign. Try again.") },
      { status: 400, headers: NO_STORE },
    );
  }
  removeCardFilesLater(releasedFiles(data));
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
