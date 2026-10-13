import { File } from "expo-file-system";

import { STORY_AUDIO_MAX_BYTES, storyAudioPath } from "@/lib/story-audio";
import {
  isScribeDraft,
  scribeBody,
  type ScribeDraft,
  type ScribeRequest,
} from "@/lib/scribe";
import { joinWav, wavSeconds } from "@/lib/wav";
import { supabase } from "@/auth/supabase";

/**
 * The scribe's three trips from the phone (Step 148): what was heard goes
 * to Claude through the web's server, the recording goes to the `stories`
 * bucket, and the story is told through `add_story`, as on the web.
 */

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/** Something to say when a trip fails. */
export class ScribeError extends Error {}

/** Claude's write-up of what was heard, to read over before it's told. */
export async function writeUp(request: ScribeRequest): Promise<ScribeDraft> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ScribeError("Sign in again.");
  let response: Response;
  try {
    response = await fetch(`${SITE}/api/mobile/scribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new ScribeError("No connection. Try again.");
  }
  const body = (await response.json().catch(() => null)) as {
    draft?: unknown;
    error?: string;
  } | null;
  if (!response.ok || !isScribeDraft(body?.draft)) {
    throw new ScribeError(body?.error ?? "Couldn’t write it up. Try again.");
  }
  return body.draft;
}

/** A name no other file in the folder has. */
function freshId(): string {
  const native = globalThis.crypto?.randomUUID?.();
  if (native) return native;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The recordings, one for each stretch between pauses, joined and put in
 * the person's folder: its path and length, or null when there's none to
 * keep or it couldn't be joined. Too long to keep is said, not dropped.
 */
export async function keepRecording(
  personId: string,
  uris: string[],
): Promise<{ path: string; seconds: number | null } | null> {
  if (!uris.length) return null;
  let joined: Uint8Array | null;
  try {
    const parts = await Promise.all(
      uris.map(
        async (uri) => new Uint8Array(await new File(uri).arrayBuffer()),
      ),
    );
    joined = joinWav(parts);
  } catch {
    joined = null;
  }
  if (!joined) return null;
  if (joined.length > STORY_AUDIO_MAX_BYTES) {
    throw new ScribeError(
      "The recording is too long to keep. Save the story without it.",
    );
  }
  const path = storyAudioPath(personId, "wav", freshId());
  const { error } = await supabase.storage
    .from("stories")
    .upload(path, joined, { contentType: "audio/wav", upsert: false });
  if (error) throw new ScribeError("The recording didn’t upload.");
  return { path, seconds: wavSeconds(joined) };
}

/** Remove a recording no story took. Best effort, as on the web. */
export async function discardRecording(path: string): Promise<void> {
  try {
    await supabase.storage.from("stories").remove([path]);
  } catch {
    // Nothing points at it either way.
  }
}

/** Today, as `add_story` keeps the day a story was told. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Tell the story on the person's tree, told today, with its recording and
 * credits: approved at once when the teller may approve it, else waiting
 * on whoever can, as every story is.
 */
export async function tellStory(story: {
  personId: string;
  treeId: string;
  title: string;
  story: string;
  english: string | null;
  recording: { path: string; seconds: number | null } | null;
  storytellers: string[];
  interviewers: string[];
}): Promise<"approved" | "pending"> {
  const { data, error } = await supabase.rpc("add_story", {
    p_person: story.personId,
    p_tree: story.treeId,
    p_title: story.title.trim(),
    p_body: scribeBody(story.story, story.english),
    p_audio_path: story.recording?.path,
    p_audio_seconds: story.recording?.seconds ?? undefined,
    p_told_on: today(),
    p_told_precision: "day",
    p_storytellers: story.storytellers,
    p_interviewers: story.interviewers,
  });
  if (error) {
    const said = error.message;
    throw new ScribeError(
      said.includes("not on your tree")
        ? "That entry, or someone credited, isn’t on your tree."
        : said.includes("only their parent")
          ? "Only their parent can add to a placeholder."
          : said.includes("longer than a story")
            ? "That’s longer than a story may be."
            : said.includes("didn't arrive")
              ? "The recording didn’t upload."
              : "Couldn’t save it. Try again.",
    );
  }
  return (data as { status?: string } | null)?.status === "approved"
    ? "approved"
    : "pending";
}
