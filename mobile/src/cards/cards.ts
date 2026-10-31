import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import * as React from "react";
import { AppState } from "react-native";

import {
  CARD_ERRORS,
  CARD_FILE_MAX_BYTES,
  CARD_FILE_TYPES,
  CARD_MESSAGE_MAX,
  CARD_THANKS_MAX,
  CARD_VOICE_SECONDS,
  cardFilePath,
  type CardFlag,
} from "@/lib/birthday-cards";
import { asCardInk, type CardInk } from "@/lib/card-ink";
import { friendlyDbError } from "@/lib/db-errors";
import { supabase } from "@/auth/supabase";
import { detailsChanged } from "@/person/sheet";

/**
 * Birthday cards on the phone (Step 217.4), through the same calls the
 * web's sheet makes, as the member: the cards to mark on leaves
 * (`my_card_flags`), signing (`sign_birthday_card`, the files put in the
 * card's folder first), taking a signature off, and the person's first
 * look; after the day (Step 217.5), the person's thank-you and hiding a
 * signature. Reading a card, with its files' links, is the sheet's
 * (`/api/mobile/person-sheet?want=cards`).
 */

// ---------------------------------------------------------------------------
// The leaves to mark
// ---------------------------------------------------------------------------

let flags: CardFlag[] = [];
let reading = false;
const listeners = new Set<() => void>();

function tell() {
  for (const l of listeners) l();
}

async function readFlags() {
  if (reading) return;
  reading = true;
  try {
    const { data, error } = await supabase.rpc("my_card_flags");
    if (error) return;
    flags = (data ?? []).flatMap((r): CardFlag[] =>
      r.state === "sign" || r.state === "mine"
        ? [{ personId: r.person_id, state: r.state, cardId: r.card_id }]
        : [],
    );
    tell();
  } finally {
    reading = false;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) void readFlags();
  // Read again as the app comes back: a card may have opened overnight.
  const app = AppState.addEventListener("change", (s) => {
    if (s === "active") void readFlags();
  });
  return () => {
    listeners.delete(onChange);
    app.remove();
  };
}

/**
 * The cards the member's leaves are marked for: an envelope by whoever has
 * a card they may sign, and their own, open, until they've looked.
 */
export function useCardFlags(): readonly CardFlag[] {
  return React.useSyncExternalStore(subscribe, () => flags);
}

/** The flag for someone's leaf, if any. */
export function useCardFlag(personId: string | null): CardFlag | null {
  const all = useCardFlags();
  return personId ? (all.find((f) => f.personId === personId) ?? null) : null;
}

/** A card was signed, taken off or opened: details and leaves read again. */
export function cardsChanged() {
  detailsChanged();
  void readFlags();
}

/** Signing out: nobody's leaves are marked. */
export function forgetCards() {
  flags = [];
  tell();
}

/** Signed in: the member's own leaves to mark, read afresh. */
export function readCards() {
  void readFlags();
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/** A voice memo recorded here, or the one the signature has. */
export type Voice =
  | { kind: "new"; uri: string; seconds: number }
  | { kind: "kept"; path: string; seconds: number | null; url: string | null };

/** A photo picked here, already shrunk, or the one the signature has. */
export type Photo =
  | { kind: "new"; uri: string }
  | { kind: "kept"; path: string; url: string | null };

export class CardError extends Error {}

/** Put one file in the card's folder, as the member: its path. */
async function upload(cardId: string, uri: string, type: string): Promise<string> {
  const ext = CARD_FILE_TYPES[type];
  if (!ext) throw new CardError("That file can’t go on a card.");
  const bytes = new Uint8Array(await new File(uri).arrayBuffer());
  if (bytes.length > CARD_FILE_MAX_BYTES) throw new CardError("That file is too big for a card.");
  const path = cardFilePath(cardId, ext, randomUUID());
  const { error } = await supabase.storage
    .from("cards")
    .upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new CardError("A file didn’t upload. Try again.");
  return path;
}

/** Remove files no signature holds: the member's own, as the bucket lets them. */
async function release(paths: readonly string[]) {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from("cards").remove([...paths]);
  } catch {
    // Nothing points at them either way.
  }
}

function released(answer: unknown): string[] {
  const r = answer && typeof answer === "object" ? (answer as { released?: unknown }).released : null;
  return Array.isArray(r) ? r.filter((p): p is string => typeof p === "string") : [];
}

/**
 * Sign a card, or change one's signature: a message, a voice memo, a photo,
 * a drawing and a name signed by hand, any of them. New files go up first;
 * if the signing is refused they're removed, and what the change let go is
 * removed after.
 */
export async function signCard(input: {
  cardId: string;
  message: string;
  voice: Voice | null;
  photo: Photo | null;
  ink: CardInk | null;
}): Promise<void> {
  const message = input.message.trim();
  if (message.length > CARD_MESSAGE_MAX) {
    throw new CardError(`Keep it under ${CARD_MESSAGE_MAX.toLocaleString("en")} characters.`);
  }
  const ink = input.ink ? asCardInk(input.ink) : null;
  if (input.ink && !ink) throw new CardError("That drawing can’t go on the card. Clear it and try again.");
  if (!message && !input.voice && !input.photo && !ink) {
    throw new CardError("Write a message, record one, add a photo or draw.");
  }

  const sent: string[] = [];
  try {
    let audioPath: string | null = null;
    let audioSeconds: number | null = null;
    if (input.voice?.kind === "kept") {
      audioPath = input.voice.path;
      audioSeconds = input.voice.seconds;
    } else if (input.voice?.kind === "new") {
      audioPath = await upload(input.cardId, input.voice.uri, "audio/mp4");
      sent.push(audioPath);
      audioSeconds = Math.min(CARD_VOICE_SECONDS + 5, Math.max(0, Math.round(input.voice.seconds)));
    }
    let photoPath: string | null = null;
    if (input.photo?.kind === "kept") photoPath = input.photo.path;
    else if (input.photo?.kind === "new") {
      photoPath = await upload(input.cardId, input.photo.uri, "image/jpeg");
      sent.push(photoPath);
    }

    const { data, error } = await supabase.rpc("sign_birthday_card", {
      p_card: input.cardId,
      p_message: message,
      p_audio_path: audioPath ?? undefined,
      p_audio_seconds: audioPath && audioSeconds !== null ? audioSeconds : undefined,
      p_photo_path: photoPath ?? undefined,
      p_ink: ink ?? undefined,
    });
    if (error) {
      throw new CardError(friendlyDbError(error.message, CARD_ERRORS, "Couldn’t sign it. Try again."));
    }
    void release(released(data));
  } catch (error) {
    void release(sent);
    if (error instanceof CardError) throw error;
    throw new CardError("A file didn’t upload. Try again.");
  }
  cardsChanged();
}

/** Take one's own signature off, its files with it. */
export async function takeOffSignature(signatureId: string): Promise<void> {
  const { data, error } = await supabase.rpc("delete_card_signature", { p_signature: signatureId });
  if (error) {
    throw new CardError(friendlyDbError(error.message, CARD_ERRORS, "Couldn’t take it off. Try again."));
  }
  void release(released(data));
  cardsChanged();
}

/** The person's first look at their own card: their leaf stops calling. */
export async function markOpened(cardId: string): Promise<void> {
  await supabase.rpc("mark_card_opened", { p_card: cardId });
  void readFlags();
}

/**
 * Thank everyone who signed one's own card, once it's open (Step 217.5):
 * the words the first time, then the same words for those who signed
 * since. Those who signed are told in the app at once; their phones and a
 * link signer's email follow with the server's next round (the cron), as
 * the phone has no route of its own for them.
 */
export async function thankEveryone(cardId: string, message: string): Promise<void> {
  const words = message.trim();
  if (words.length > CARD_THANKS_MAX) {
    throw new CardError(`Keep it under ${CARD_THANKS_MAX.toLocaleString("en")} characters.`);
  }
  const { error } = await supabase.rpc("thank_card_signers", {
    p_card: cardId,
    p_message: words || undefined,
  });
  if (error) {
    throw new CardError(friendlyDbError(error.message, CARD_ERRORS, "Couldn’t send it. Try again."));
  }
  cardsChanged();
}

/** Hide a signature on one's own open card from everyone else, or show it again (Step 217.5). */
export async function hideSignature(signatureId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.rpc("hide_card_signature", {
    p_signature: signatureId,
    p_hidden: hidden,
  });
  if (error) {
    throw new CardError(friendlyDbError(error.message, CARD_ERRORS, "Couldn’t change it. Try again."));
  }
  cardsChanged();
}

/** This phone's time zone, where a card opens if nothing says where they live. */
export function reportTimeZone() {
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  if (zone && zone.length <= 64) void supabase.rpc("set_my_time_zone", { p_zone: zone });
}
