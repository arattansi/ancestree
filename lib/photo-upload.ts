import { isRedirect } from "@/lib/action-feedback";
import {
  PHOTO_EXTENSIONS,
  photoPath,
  type PhotoOwner,
} from "@/lib/photo-path";

/**
 * Putting a picked photo in the `photos` bucket, from the browser (Step
 * 77.4, audit R2): one way for every form that takes one. The file keeps its
 * own type — the picker hands over only a JPEG it redrew (Step 91) — and
 * goes in its owner's folder (`lib/photo-path.ts`).
 * The Supabase client is loaded only once a photo is actually sent.
 */

async function bucket() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient().storage.from("photos");
}

/** Upload `file` into `owner`'s folder; its path, or a throw. */
export async function uploadPhoto(owner: PhotoOwner, file: File): Promise<string> {
  const ext = PHOTO_EXTENSIONS[file.type];
  if (!ext) throw new Error(`Not a photo the bucket takes: ${file.type || "?"}`);
  const path = photoPath(owner, ext);
  const { error } = await (await bucket()).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Remove an uploaded photo nothing points at: the entry refused it. Best
 * effort — where storage won't let this person delete it, it stays, still
 * pointed at by nothing.
 */
export async function discardPhoto(path: string): Promise<void> {
  try {
    await (await bucket()).remove([path]);
  } catch {
    // Nothing points at it either way.
  }
}

/** What an attach says when it can't say more. */
export const PHOTO_NOT_SAVED = "The photo didn't upload.";

/**
 * Upload `file` for `owner` and point the entry at it with `attach` — a
 * server action given the new path. When the entry refuses it, the file is
 * removed again rather than left behind. When the attach can't be reached,
 * the file stays: it may have arrived, and the entry may point at it.
 * Never throws (but for a redirect, which the router is already following):
 * `{ error }` says what went wrong.
 */
export async function attachPhoto(
  owner: PhotoOwner,
  file: File,
  attach: (path: string) => Promise<{ error?: string }>,
): Promise<{ error?: string }> {
  let path: string;
  try {
    path = await uploadPhoto(owner, file);
  } catch {
    return { error: PHOTO_NOT_SAVED };
  }
  try {
    const res = await attach(path);
    if (res.error) {
      await discardPhoto(path);
      return { error: res.error };
    }
    return {};
  } catch (thrown) {
    if (isRedirect(thrown)) throw thrown;
    return { error: PHOTO_NOT_SAVED };
  }
}
