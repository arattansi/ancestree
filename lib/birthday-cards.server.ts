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
