import { File } from "expo-file-system";

import { STORY_AUDIO_MAX_BYTES, storyAudioPath } from "@/lib/story-audio";
import {
  isScribeDraft,
  scribeBody,
  type ScribeDraft,
  type ScribeRequest,
} from "@/lib/scribe";
import type { ClaimInviteRequest } from "@/lib/claim-invites";
import {
  factNote,
  fillFieldsFor,
  isScribeFacts,
  type FactWay,
  type FactWrite,
  type ScribeFacts,
} from "@/lib/scribe-facts";
import type { Json, TablesUpdate } from "@/lib/database.types";
import { asSuggestionColumns } from "@/lib/suggestions";
import { joinWav, wavSeconds } from "@/lib/wav";
import { supabase } from "@/auth/supabase";

/**
 * The scribe's trips from the phone (Step 148): what was heard goes to
 * Claude through the web's server, once to be written up and once to be
 * read for facts (148.2); the recording goes to the `stories` bucket; the
 * story is told through `add_story`, and each fact the member accepts is
 * made as the web would make it; a relative it adds may be invited to
 * claim their entry (148.4).
 */

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/** Something to say when a trip fails. */
export class ScribeError extends Error {}

/** One of the web's phone endpoints, as the member: its answer, or why not. */
async function askServer(
  path: string,
  request: ScribeRequest | ClaimInviteRequest,
  failed: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ScribeError("Sign in again.");
  let response: Response;
  try {
    response = await fetch(`${SITE}${path}`, {
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
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok || !body) {
    throw new ScribeError(
      typeof body?.error === "string" ? body.error : failed,
    );
  }
  return body;
}

/** Claude's write-up of what was heard, to read over before it's told. */
export async function writeUp(request: ScribeRequest): Promise<ScribeDraft> {
  const failed = "Couldn’t write it up. Try again.";
  const body = await askServer("/api/mobile/scribe", request, failed);
  if (!isScribeDraft(body.draft)) throw new ScribeError(failed);
  return body.draft;
}

/** What the story tells the tree (Step 148.2), each to accept or not. */
export async function findFacts(request: ScribeRequest): Promise<ScribeFacts> {
  const failed = "Couldn’t look for facts.";
  const body = await askServer("/api/mobile/scribe/facts", request, failed);
  if (!isScribeFacts(body.facts)) throw new ScribeError(failed);
  return body.facts;
}

/**
 * Invite someone just added to claim their entry, as the web's add form
 * does (`/api/mobile/claim-invite`): where it went, or why it didn't. An
 * invite made whose email didn't send says so too.
 */
export async function inviteToClaim(
  request: ClaimInviteRequest,
): Promise<{ invited: string } | { error: string }> {
  try {
    const body = await askServer(
      "/api/mobile/claim-invite",
      request,
      "Couldn’t send the invite.",
    );
    if (typeof body.error === "string") return { error: body.error };
    return {
      invited: typeof body.email === "string" ? body.email : request.email,
    };
  } catch (error) {
    return {
      error:
        error instanceof ScribeError
          ? error.message
          : "Couldn’t send the invite.",
    };
  }
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
  /** Who it mentions (Step 116), each on the tree it's told on. */
  mentions: string[];
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
    p_mentions: story.mentions,
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

/** What a refused fact says, by what the database said. */
function factError(message: string): string {
  return message.includes("not on your tree")
    ? "That entry isn’t on your tree."
    : message.includes("yours to edit")
      ? "That entry is yours to edit now. Try again."
      : message.includes("not yours to fill in")
        ? "That entry isn’t yours to fill in any more."
        : message.includes("nothing changed")
          ? "The entry already says that."
          : message.includes("fit the entry") || message.includes("check")
            ? "That doesn’t fit the entry."
            : "Couldn’t save it.";
}

/**
 * Make one accepted write (`factWrites`): an edit through the same row
 * policy the web's edit form meets, a fill through `fill_person_blanks`
 * (Step 44), or a suggestion through `suggest_entry_change` (Step 67),
 * taking in the member's own suggestion still waiting on that entry, which
 * a new one would otherwise replace. Null when it's made, else why not.
 */
async function makeFact(write: FactWrite, title: string): Promise<string | null> {
  if (write.way === "edit") {
    const { data, error } = await supabase
      .from("people")
      // Only the details that change: the columns a suggestion names.
      .update(write.changes as TablesUpdate<"people">)
      .eq("id", write.personId)
      .select("id");
    if (error) return factError(error.message);
    return data?.length ? null : "Only someone who looks after that entry can change it.";
  }
  if (write.way === "fill") {
    const { error } = await supabase.rpc("fill_person_blanks", {
      p_person: write.personId,
      p_fields: fillFieldsFor(write.changes),
    });
    return error ? factError(error.message) : null;
  }
  if (!write.treeId) return "That entry isn’t on your tree.";
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  const { data: waiting } = userId
    ? await supabase
        .from("entry_suggestions")
        .select("changes, note")
        .eq("person_id", write.personId)
        .eq("suggested_by", userId)
        .eq("status", "pending")
        .maybeSingle()
    : { data: null };
  const note = [waiting?.note?.trim(), factNote(title, write.evidence)]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
  const { error } = await supabase.rpc("suggest_entry_change", {
    p_person: write.personId,
    p_tree: write.treeId,
    p_values: { ...asSuggestionColumns(waiting?.changes), ...write.changes } as Json,
    p_note: note,
  });
  return error ? factError(error.message) : null;
}

/** Make every accepted write, each on its own: how each went. */
export async function makeFacts(
  writes: FactWrite[],
  title: string,
): Promise<{ way: FactWay; error: string | null }[]> {
  return Promise.all(
    writes.map(async (write) => ({
      way: write.way,
      error: await makeFact(write, title).catch(() => "Couldn’t save it."),
    })),
  );
}
