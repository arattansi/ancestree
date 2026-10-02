"use server";

import { after } from "next/server";

import { requireProfile } from "@/lib/auth";
import { friendlyDbError, ownedWrite } from "@/lib/db-errors";
import { COMMENT_MAX, STORY_MAX, STORY_TITLE_MAX } from "@/lib/limits";
import { isStoryAudioPath } from "@/lib/story-audio";
import { STORY_CREDIT_MAX, toldProblem } from "@/lib/story-credits";
import {
  listStories,
  listStoryComments,
  storyLinkUrl,
  type EntryStory,
  type StoryComment,
} from "@/lib/stories";
import { createAdminClient } from "@/lib/supabase/admin";
import { toStoredDate } from "@/lib/partial-date";
import { createClient } from "@/lib/supabase/server";

/**
 * Stories on an entry (Step 88.3). The sheet keeps its own list, so none of
 * these draws the page again: each hands back what the list needs.
 */

/**
 * Tell a story about someone on the viewer's tree: text, a recording they
 * have just uploaded to that person's folder, or both. It waits for the
 * person, or whoever can edit the entry, unless the teller is that person.
 * It may say when it was told (`told`, as much of a date as is known: "1962"
 * will do) and credit people on the tree as its storytellers and its
 * interviewers (Step 99). The list back includes it.
 */
export async function addStory(input: {
  personId: string;
  /** The tree it's told on, whose inbox its teller hears back in. */
  treeId: string;
  title: string;
  body: string;
  audioPath: string | null;
  audioSeconds: number | null;
  told?: string;
  storytellers?: string[];
  interviewers?: string[];
}): Promise<{ error?: string; status?: "pending" | "approved"; stories?: EntryStory[] }> {
  const profile = await requireProfile();
  const title = input.title.trim();
  const body = input.body.trim();
  const audioPath = input.audioPath;
  if (!body && !audioPath) return { error: "Write the story or add a recording." };
  if (title.length > STORY_TITLE_MAX) {
    return { error: `Keep the title under ${STORY_TITLE_MAX} characters.` };
  }
  if (body.length > STORY_MAX) {
    return { error: `Keep it under ${STORY_MAX.toLocaleString("en")} characters.` };
  }
  if (audioPath && !isStoryAudioPath(input.personId, audioPath)) {
    return { error: "The recording didn’t upload." };
  }
  const storytellers = [...new Set(input.storytellers ?? [])];
  const interviewers = [...new Set(input.interviewers ?? [])];
  if (storytellers.length > STORY_CREDIT_MAX || interviewers.length > STORY_CREDIT_MAX) {
    return { error: `Credit ${STORY_CREDIT_MAX} people at most in each role.` };
  }
  const toldError = toldProblem(input.told ?? "");
  if (toldError) return { error: toldError };
  const toldOn = toStoredDate(input.told);
  const seconds =
    input.audioSeconds !== null && Number.isFinite(input.audioSeconds)
      ? Math.max(0, Math.round(input.audioSeconds))
      : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_story", {
    p_person: input.personId,
    p_tree: input.treeId,
    // Blank is none: `add_story` keeps only what has words in it.
    p_title: title,
    p_body: body,
    p_audio_path: audioPath ?? undefined,
    p_audio_seconds: audioPath && seconds !== null ? seconds : undefined,
    p_told_on: toldOn.date ?? undefined,
    p_told_precision: toldOn.date ? toldOn.precision : undefined,
    p_storytellers: storytellers,
    p_interviewers: interviewers,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["not on your tree", "That entry, or someone credited, isn’t on your tree."],
          ["too many people", `Credit ${STORY_CREDIT_MAX} people at most in each role.`],
          // Step 98.3: a placeholder child is told about, or credited, by
          // their parent alone.
          ["only their parent fills in", "Only their parent can add to a placeholder."],
          ["told after today", "That’s after today."],
          ["didn't arrive", "The recording didn’t upload."],
          ["stories_audio_path_key", "The recording didn’t upload."],
          ["nothing to tell", "Write the story or add a recording."],
          ["longer than a story may be", "That’s longer than a story may be."],
        ],
        "Couldn’t add it. Try again.",
      ),
    };
  }
  const told = data as { status?: string } | null;
  return {
    status: told?.status === "approved" ? "approved" : "pending",
    // It's told either way; a list that can't be read now is read again.
    stories: await listStories(input.personId, profile.auth_user_id).catch(
      () => undefined,
    ),
  };
}

/**
 * Edit a story after it's told (Steps 99.5–99.7): who it's credited to and
 * when it was told (its teller, whoever can edit the entry, or the person
 * it's about may), and, from its teller alone, its title and text (`text`).
 * New words from someone who couldn't approve them wait for approval again
 * (`status` back says so). Someone newly credited must be on the tree it's
 * edited from; someone already credited may stay. An empty date clears it.
 * The list back has it.
 */
export async function editStory(input: {
  storyId: string;
  /** Whose sheet it's edited on: the list back is theirs. */
  personId: string;
  /** The tree it's edited from, which anyone newly credited must be on. */
  treeId: string;
  storytellers: string[];
  interviewers: string[];
  /** As much of the date as is known ("1962" will do); empty for none. */
  told: string;
  /** Its teller's title and text; left as they are when absent. */
  text?: { title: string; body: string };
}): Promise<{ error?: string; status?: EntryStory["status"]; stories?: EntryStory[] }> {
  const profile = await requireProfile();
  const storytellers = [...new Set(input.storytellers)];
  const interviewers = [...new Set(input.interviewers)];
  if (storytellers.length > STORY_CREDIT_MAX || interviewers.length > STORY_CREDIT_MAX) {
    return { error: `Credit ${STORY_CREDIT_MAX} people at most in each role.` };
  }
  const toldError = toldProblem(input.told);
  if (toldError) return { error: toldError };
  const toldOn = toStoredDate(input.told);
  const title = input.text?.title.trim() ?? "";
  const body = input.text?.body.trim() ?? "";
  if (input.text) {
    if (title.length > STORY_TITLE_MAX) {
      return { error: `Keep the title under ${STORY_TITLE_MAX} characters.` };
    }
    if (body.length > STORY_MAX) {
      return { error: `Keep it under ${STORY_MAX.toLocaleString("en")} characters.` };
    }
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_story", {
    p_story: input.storyId,
    p_tree: input.treeId,
    p_storytellers: storytellers,
    p_interviewers: interviewers,
    // Left out, it's cleared.
    p_told_on: toldOn.date ?? undefined,
    p_told_precision: toldOn.date ? toldOn.precision : undefined,
    p_edit_text: !!input.text,
    // Blank is none: `edit_story` keeps only what has words in it.
    p_title: input.text ? title : undefined,
    p_body: input.text ? body : undefined,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["not yours to credit", "It isn’t yours to change."],
          ["not yours to edit", "Only whoever added it can change its words."],
          ["nothing to tell", "Write the story or add a recording."],
          ["longer than a story may be", "That’s longer than a story may be."],
          ["not a story you can see", "That story is gone."],
          ["not on your tree", "Someone credited isn’t on this tree."],
          ["too many people", `Credit ${STORY_CREDIT_MAX} people at most in each role.`],
          ["told after today", "That’s after today."],
          // Step 98.3: a placeholder child is credited by their parent alone.
          ["only their parent fills in", "Only their parent can add to a placeholder."],
        ],
        "Couldn’t save it. Try again.",
      ),
    };
  }
  const edited = data as { status?: string } | null;
  return {
    status:
      edited?.status === "approved" || edited?.status === "declined"
        ? edited.status
        : "pending",
    // Saved either way; a list that can't be read now is read again.
    stories: await listStories(input.personId, profile.auth_user_id).catch(
      () => undefined,
    ),
  };
}

/**
 * Approve or decline a story waiting on the viewer. Its teller is told; a
 * declined one stays for them alone.
 */
export async function decideStory(
  storyId: string,
  approve: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_story", {
    p_story: storyId,
    p_approve: approve,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["already decided", "It’s already been answered."],
          ["not yours to approve", "It isn’t yours to approve."],
        ],
        "Couldn’t answer it. Try again.",
      ),
    };
  }
  return {};
}

/**
 * Delete a story: its teller, or whoever can edit the entry. Its recording
 * goes after the response, with the service role, since the story it
 * belonged to (storage's way of knowing who may touch it) is gone.
 */
export async function deleteStory(storyId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const res = await ownedWrite(
    supabase.from("stories").delete().eq("id", storyId).select("audio_path"),
    {
      refused: "It’s gone already, or isn’t yours to delete.",
      failed: "Couldn’t delete it. Try again.",
    },
  );
  if (res.error !== undefined) return { error: res.error };
  const paths = res.rows.flatMap((r) => (r.audio_path ? [r.audio_path] : []));
  if (paths.length > 0) {
    after(async () => {
      const { error } = await createAdminClient().storage.from("stories").remove(paths);
      if (error) console.error("[stories] a deleted story's recording stayed", error.message);
    });
  }
  return {};
}

/**
 * The viewer's public link to an approved story (Step 88.4), made the first
 * time they share it; the same one after that. Shared by someone who could
 * have turned its links off, they're on again.
 */
export async function shareStory(
  storyId: string,
): Promise<{ error?: string; url?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("share_story", { p_story: storyId });
  if (error || !data) {
    return {
      error: friendlyDbError(
        error?.message,
        [["be shared", "It can’t be shared."]],
        "Couldn’t make a link. Try again.",
      ),
    };
  }
  return { url: storyLinkUrl(data) };
}

/**
 * Turn off every link to a story, for its person, an editor of the entry or
 * its teller. They stay off until one of them shares it again.
 */
export async function stopSharingStory(storyId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_sharing_story", { p_story: storyId });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [["not yours to stop sharing", "It isn’t yours to stop sharing."]],
        "Couldn’t stop sharing it. Try again.",
      ),
    };
  }
  return {};
}

/** A story's comments, for its card (Step 88.4). */
export async function getStoryComments(storyId: string): Promise<StoryComment[]> {
  const profile = await requireProfile();
  return listStoryComments(storyId, profile.auth_user_id);
}

/**
 * Comment on an approved story the viewer can see. Its teller and its
 * person are told. The list back includes it.
 */
export async function addStoryComment(input: {
  storyId: string;
  body: string;
}): Promise<{ error?: string; comments?: StoryComment[] }> {
  const profile = await requireProfile();
  const body = input.body.trim();
  if (!body) return { error: "Write a comment first." };
  if (body.length > COMMENT_MAX) {
    return { error: `Keep it under ${COMMENT_MAX.toLocaleString("en")} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_story_comment", {
    p_story: input.storyId,
    p_body: body,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["not a story you can see", "That story isn’t on your tree."],
          ["nothing to say", "Write a comment first."],
          ["longer than a comment may be", `Keep it under ${COMMENT_MAX.toLocaleString("en")} characters.`],
        ],
        "Couldn’t post it. Try again.",
      ),
    };
  }
  return {
    // It's posted either way; a list that can't be read now is read again.
    comments: await listStoryComments(input.storyId, profile.auth_user_id).catch(
      () => undefined,
    ),
  };
}

/** Delete a comment: its author, the story's teller, or an editor of the entry. */
export async function deleteStoryComment(commentId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const res = await ownedWrite(
    supabase.from("story_comments").delete().eq("id", commentId).select("id"),
    {
      refused: "It’s gone already, or isn’t yours to delete.",
      failed: "Couldn’t delete it. Try again.",
    },
  );
  return res.error !== undefined ? { error: res.error } : {};
}
