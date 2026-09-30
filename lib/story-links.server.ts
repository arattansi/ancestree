import "server-only";

import { cache } from "react";

import { isStoryToken } from "@/lib/story-links";
import { AUDIO_LINK_SECONDS } from "@/lib/stories";
import { createAdminClient } from "@/lib/supabase/admin";

/** What a story's public page shows (Step 88.4). No comments. */
export type SharedStory = {
  storyId: string;
  /** Who it's about, as the tree names them. */
  personName: string;
  /** Who made the link. */
  sharedBy: string;
  title: string | null;
  body: string | null;
  /** A signed link to its recording, for an hour. */
  audioUrl: string | null;
  audioSeconds: number | null;
};

/**
 * The story a link opens, or `null` when the token is unknown or the link
 * no longer works: turned off, its person hidden from visitors, or its
 * sharer no longer on a tree that shows them (`shared_story`). Read with
 * the service role, as the visitor has no account; the page and its
 * metadata share one read.
 */
export const resolveStoryLink = cache(
  async (token: string): Promise<SharedStory | null> => {
    if (!isStoryToken(token)) return null;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("shared_story", { p_token: token });
    const story = data?.[0];
    if (error || !story?.story_id) return null;

    let audioUrl: string | null = null;
    if (story.audio_path) {
      const { data: signed } = await admin.storage
        .from("stories")
        .createSignedUrl(story.audio_path, AUDIO_LINK_SECONDS);
      audioUrl = signed?.signedUrl ?? null;
    }

    return {
      storyId: story.story_id,
      personName: story.person_name || "A relative",
      sharedBy: story.shared_by || "A relative",
      title: story.title ?? null,
      body: story.body ?? null,
      audioUrl,
      audioSeconds: story.audio_seconds ?? null,
    };
  },
);
