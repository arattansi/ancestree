import { CARD_FILE_TYPES, cardFilePath } from "@/lib/birthday-cards";

/**
 * Putting a signature's photo or voice memo in the `cards` bucket, from the
 * browser (Step 217), as a story's recording goes (`lib/story-upload.ts`):
 * into the card's folder, before the signature that points at it is saved.
 * Only someone who may sign the card can put a file there.
 */

async function bucket() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient().storage.from("cards");
}

/** Upload `blob` of `type` for `cardId`; its path, or a throw. */
export async function uploadCardFile(cardId: string, blob: Blob, type: string): Promise<string> {
  const ext = CARD_FILE_TYPES[type];
  if (!ext) throw new Error(`Not a file the card takes: ${type || "?"}`);
  const path = cardFilePath(cardId, ext, crypto.randomUUID());
  const { error } = await (await bucket()).upload(path, blob, {
    contentType: type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Remove an upload no signature took. Best effort. */
export async function discardCardFile(path: string): Promise<void> {
  try {
    await (await bucket()).remove([path]);
  } catch {
    // Nothing points at it either way.
  }
}
