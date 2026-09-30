import { storyAudioPath } from "@/lib/story-audio";
import type { StoryAudio } from "@/lib/story-audio-shrink";

/**
 * Putting a story's recording in the `stories` bucket, from the browser
 * (Step 88.3), as a photo goes (`lib/photo-upload.ts`): into the person's
 * folder, before the story that points at it is told. The Supabase client
 * is loaded only once a recording is actually sent.
 */

async function bucket() {
  const { createClient } = await import("@/lib/supabase/client");
  return createClient().storage.from("stories");
}

/** Upload `audio` for a story about `personId`; its path, or a throw. */
export async function uploadStoryAudio(
  personId: string,
  audio: Pick<StoryAudio, "blob" | "type" | "ext">,
): Promise<string> {
  const path = storyAudioPath(personId, audio.ext, crypto.randomUUID());
  const { error } = await (await bucket()).upload(path, audio.blob, {
    contentType: audio.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Remove an uploaded recording no story took: the story was refused. Best
 * effort; storage lets its uploader remove it only while nothing points at
 * it.
 */
export async function discardStoryAudio(path: string): Promise<void> {
  try {
    await (await bucket()).remove([path]);
  } catch {
    // Nothing points at it either way.
  }
}

/** What telling a story says when its recording didn't go. */
export const AUDIO_NOT_SENT = "The recording didn’t upload.";
