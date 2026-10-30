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

/**
 * A link signer's file (Step 217.3), signed in or out: `/api/cards/upload`
 * hands back a place in the card's folder once the database says they could
 * sign, and the file goes there straight from the browser. Its path, or a
 * throw whose message says why.
 */
export async function uploadCardFileByLink(
  token: string,
  kind: "audio" | "photo",
  blob: Blob,
  type: string,
): Promise<string> {
  const res = await fetch("/api/cards/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, kind, type }),
  });
  const answer = (await res.json().catch(() => ({}))) as {
    path?: string;
    uploadToken?: string;
    error?: string;
  };
  if (!res.ok || !answer.path || !answer.uploadToken) {
    throw new Error(answer.error ?? "A file didn’t upload. Try again.");
  }
  const { error } = await (await bucket()).uploadToSignedUrl(answer.path, answer.uploadToken, blob, {
    contentType: type,
  });
  if (error) throw new Error("A file didn’t upload. Try again.");
  return answer.path;
}
