import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import {
  asBirthdayCard,
  asPersonCards,
  cardFiles,
  withLinks,
  type BirthdayCard,
  type BirthdayCardView,
  type CardFlag,
  type PersonCards,
} from "@/lib/birthday-cards";
import type { Database } from "@/lib/database.types";
import { sendEmails } from "@/lib/email";
import { cardThanksEmail } from "@/lib/emails/card-thanks";
import { reachableEmail } from "@/lib/no-email";
import { cardThanksPush } from "@/lib/push";
import { sendPushes } from "@/lib/push.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;

/** How long a card's file links last: longer than anyone keeps it open. */
const FILE_LINK_SECONDS = 60 * 60;

/**
 * Link a card's files. The bucket has no read policy at all: only what
 * `card_json` handed the viewer, as themself, is signed, with the service
 * role.
 */
async function linked(card: BirthdayCard): Promise<BirthdayCardView> {
  const paths = cardFiles(card);
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await createAdminClient()
      .storage.from("cards")
      .createSignedUrls(paths, FILE_LINK_SECONDS);
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
    }
  }
  return withLinks(card, links);
}

/** What someone's sheet shows of their cards to the viewer (`birthday_cards_for`). */
export async function loadPersonCards(personId: string, db?: DbClient): Promise<PersonCards> {
  const supabase = db ?? (await createClient());
  const { data, error } = await supabase.rpc("birthday_cards_for", { p_person: personId });
  if (error) throw new Error("Couldn’t read the cards.");
  const { current, past, startsOn } = asPersonCards(data);
  return { current: current ? await linked(current) : null, past, startsOn };
}

/** One card, as the viewer may see it, for opening an earlier one again. */
export async function loadCard(cardId: string, db?: DbClient): Promise<BirthdayCardView | null> {
  const supabase = db ?? (await createClient());
  const { data, error } = await supabase.rpc("birthday_card", { p_card: cardId });
  if (error) throw new Error("Couldn’t read the card.");
  const card = asBirthdayCard(data);
  return card ? linked(card) : null;
}

/**
 * Every card of the viewer's own that has opened, oldest first, with its
 * files' links: for Export data (Step 217.5, `my_birthday_cards`).
 */
export async function loadMyCards(db?: DbClient): Promise<BirthdayCardView[]> {
  const supabase = db ?? (await createClient());
  const { data, error } = await supabase.rpc("my_birthday_cards");
  if (error) throw new Error("Couldn’t read your cards.");
  const cards = (Array.isArray(data) ? data : []).flatMap((c) => {
    const card = asBirthdayCard(c);
    return card ? [card] : [];
  });
  return Promise.all(cards.map(linked));
}

/** What the canvas marks for the viewer (`my_card_flags`): never throws. */
export async function loadCardFlags(db?: DbClient): Promise<CardFlag[]> {
  try {
    const supabase = db ?? (await createClient());
    const { data, error } = await supabase.rpc("my_card_flags");
    if (error) throw error;
    return (data ?? []).flatMap((r): CardFlag[] =>
      r.state === "sign" || r.state === "mine"
        ? [{ personId: r.person_id, state: r.state, cardId: r.card_id }]
        : [],
    );
  } catch (error) {
    console.error("[cards] couldn't read the canvas's flags", error);
    return [];
  }
}

/**
 * Remove the files a signature or a card let go, with the service role, once
 * the response has gone: deleting the row (as the caller) was the right to.
 */
export function removeCardFilesLater(paths: readonly string[]): void {
  if (paths.length === 0) return;
  after(async () => {
    const { error } = await createAdminClient().storage.from("cards").remove([...paths]);
    if (error) console.error("[cards] couldn't remove files", error);
  });
}

/** The files a card call let go, as it answers them. */
export function releasedFiles(answer: unknown): string[] {
  const released =
    answer && typeof answer === "object" ? (answer as { released?: unknown }).released : null;
  return Array.isArray(released) ? released.filter((p): p is string => typeof p === "string") : [];
}

/**
 * What a thank-you owes (Step 217.5), with the service role: a push to each
 * member it reached whose cards switch is on (`card_thanks_pushes`), and an
 * email to each link signer who left an address (`card_thanks_emails`,
 * which forgets it as it hands it over). Each once. For `cardId`'s, after
 * a thank-you from the web; for every card's, from the cron, which also
 * catches one sent from the phone. Never throws.
 */
export async function sendCardThanks(cardId: string | null): Promise<{ pushed: number; emailed: number }> {
  const admin = createAdminClient();
  const card = cardId ?? undefined;
  let pushed = 0;
  let emailed = 0;
  try {
    const { data, error } = await admin.rpc("card_thanks_pushes", { p_card: card });
    if (error) throw error;
    ({ sent: pushed } = await sendPushes(
      (data ?? []).map((r) => ({
        userId: r.user_id,
        note: cardThanksPush({ personId: r.person_id, firstName: r.first_name, thanks: r.thanks }),
      })),
    ));
  } catch (error) {
    console.error("[cards] couldn't push the thank-you", error);
  }
  try {
    const { data, error } = await admin.rpc("card_thanks_emails", { p_card: card });
    if (error) throw error;
    const emails = (data ?? []).flatMap((r) => {
      const to = reachableEmail(r.to_email);
      return to
        ? [{ to, ...cardThanksEmail({ firstName: r.first_name, signerName: r.signer, message: r.message }) }]
        : [];
    });
    const sent = await sendEmails(emails);
    emailed = sent.filter((s) => s.ok).length;
  } catch (error) {
    console.error("[cards] couldn't email the thank-you", error);
  }
  return { pushed, emailed };
}
