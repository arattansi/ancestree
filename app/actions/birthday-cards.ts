"use server";

import {
  CARD_ERRORS,
  CARD_MESSAGE_MAX,
  CARD_VOICE_SECONDS,
  isCardFilePath,
  type BirthdayCardView,
  type PersonCards,
} from "@/lib/birthday-cards";
import {
  loadCard,
  loadPersonCards,
  releasedFiles,
  removeCardFilesLater,
} from "@/lib/birthday-cards.server";
import { requireProfile } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

/**
 * Birthday cards (Step 217). The sheet keeps its own copy of a person's
 * cards, so none of these draws the page again: each hands back what the
 * sheet shows next.
 */

type CardsAnswer = { error?: string; cards?: PersonCards };

async function cardsOf(personId: string): Promise<CardsAnswer> {
  try {
    return { cards: await loadPersonCards(personId) };
  } catch {
    return { error: "Couldn’t read the card. Try again." };
  }
}

/**
 * Start someone's card for their next birthday: their spouse, a parent, a
 * Root or their Branch, up to a month before. `timeZone` is the starter's
 * device's, where the card opens if nothing says where the person lives.
 */
export async function startBirthdayCard(input: {
  personId: string;
  timeZone: string | null;
}): Promise<CardsAnswer> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_birthday_card", {
    p_person: input.personId,
    p_time_zone: input.timeZone ?? undefined,
  });
  if (error) {
    return { error: friendlyDbError(error.message, CARD_ERRORS, "Couldn’t start the card. Try again.") };
  }
  return cardsOf(input.personId);
}

/**
 * Sign a card, or change one's signature: a message, a voice memo and a
 * photo, any of them, the files already in the card's folder. What the
 * change let go is removed once the answer has gone.
 */
export async function signBirthdayCard(input: {
  personId: string;
  cardId: string;
  message: string;
  audioPath: string | null;
  audioSeconds: number | null;
  photoPath: string | null;
}): Promise<CardsAnswer> {
  await requireProfile();
  const message = input.message.trim();
  if (!message && !input.audioPath && !input.photoPath) {
    return { error: "Write a message, record one or add a photo." };
  }
  if (message.length > CARD_MESSAGE_MAX) {
    return { error: `Keep it under ${CARD_MESSAGE_MAX.toLocaleString("en")} characters.` };
  }
  for (const path of [input.audioPath, input.photoPath]) {
    if (path && !isCardFilePath(input.cardId, path)) return { error: "A file didn’t upload. Try again." };
  }
  const seconds =
    input.audioSeconds !== null && Number.isFinite(input.audioSeconds)
      ? Math.min(CARD_VOICE_SECONDS + 5, Math.max(0, Math.round(input.audioSeconds)))
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_birthday_card", {
    p_card: input.cardId,
    p_message: message,
    p_audio_path: input.audioPath ?? undefined,
    p_audio_seconds: input.audioPath && seconds !== null ? seconds : undefined,
    p_photo_path: input.photoPath ?? undefined,
  });
  if (error) {
    return { error: friendlyDbError(error.message, CARD_ERRORS, "Couldn’t sign it. Try again.") };
  }
  removeCardFilesLater(releasedFiles(data));
  return cardsOf(input.personId);
}

/** Take a signature off: one's own, or, before the day, any as a manager. */
export async function deleteCardSignature(input: {
  personId: string;
  signatureId: string;
}): Promise<CardsAnswer> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_card_signature", {
    p_signature: input.signatureId,
  });
  if (error) {
    return { error: friendlyDbError(error.message, CARD_ERRORS, "Couldn’t take it off. Try again.") };
  }
  removeCardFilesLater(releasedFiles(data));
  return cardsOf(input.personId);
}

/** Delete a card before its day, signatures and all (a manager). */
export async function deleteBirthdayCard(input: {
  personId: string;
  cardId: string;
}): Promise<CardsAnswer> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_birthday_card", { p_card: input.cardId });
  if (error) {
    return { error: friendlyDbError(error.message, CARD_ERRORS, "Couldn’t delete the card. Try again.") };
  }
  removeCardFilesLater(releasedFiles(data));
  return cardsOf(input.personId);
}

/** An earlier card, to open again. */
export async function openBirthdayCard(cardId: string): Promise<{
  error?: string;
  card?: BirthdayCardView;
}> {
  await requireProfile();
  try {
    const card = await loadCard(cardId);
    return card ? { card } : { error: "That card isn’t yours to open." };
  } catch {
    return { error: "Couldn’t open the card. Try again." };
  }
}

/** The person's first look at their own card, kept so the canvas stops calling. */
export async function markCardOpened(cardId: string): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  await supabase.rpc("mark_card_opened", { p_card: cardId });
}

/** The member's device's time zone, for the cards that open at their midnight. */
export async function setMyTimeZone(zone: string): Promise<void> {
  if (typeof zone !== "string" || zone.length > 64) return;
  const supabase = await createClient();
  await supabase.rpc("set_my_time_zone", { p_zone: zone });
}
