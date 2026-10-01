import "server-only";

import { cache } from "react";

import { relationOf, relationText } from "@/lib/connection-path";
import { isStoryToken } from "@/lib/story-links";
import { asCredits, type StoryCredit } from "@/lib/story-credits";
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
  /** When it was told, and who it's credited to (Step 99). */
  toldOn: string | null;
  toldPrecision: string | null;
  credits: StoryCredit[];
  /** What each credited person is to whoever it's about, by their id, for
   *  their tag's card (Step 99): "Great-grandson of Amarshi Sayani". None
   *  where nothing joins them, and for the story's own person. */
  connections: Record<string, string>;
};

type Admin = ReturnType<typeof createAdminClient>;

/**
 * What each credited person is to the story's person (`personName`),
 * worked out on the tree it was told on (where `add_story` found them all), from the same
 * people and lines that tree's canvas draws. Nothing when that tree is gone.
 */
async function creditConnections(
  admin: Admin,
  storyId: string,
  credits: StoryCredit[],
  personName: string,
): Promise<Record<string, string>> {
  if (credits.length === 0) return {};
  const { data: story } = await admin
    .from("stories")
    .select("person_id, tree_id")
    .eq("id", storyId)
    .maybeSingle();
  if (!story?.tree_id) return {};
  const [people, edges] = await Promise.all([
    admin.from("tree_people").select("id, sex").eq("tree_id", story.tree_id),
    admin
      .from("tree_edges")
      .select("from_person, to_person, type, is_divorced")
      .eq("tree_id", story.tree_id),
  ]);
  if (people.error || edges.error) return {};
  const byId = new Map(
    (people.data ?? []).flatMap((p) => (p.id ? [[p.id, { sex: p.sex }] as const] : [])),
  );
  const lines = (edges.data ?? []).flatMap((e) =>
    e.from_person && e.to_person && e.type
      ? [{ from_person: e.from_person, to_person: e.to_person, type: e.type, is_divorced: e.is_divorced }]
      : [],
  );
  const out: Record<string, string> = {};
  for (const c of credits) {
    const relation = relationOf(c.id, story.person_id, byId, lines);
    if (relation) out[c.id] = relationText(relation, personName);
  }
  return out;
}

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

    const credits = asCredits(story.credits);
    const personName = story.person_name || "A relative";
    return {
      storyId: story.story_id,
      personName,
      sharedBy: story.shared_by || "A relative",
      title: story.title ?? null,
      body: story.body ?? null,
      audioUrl,
      audioSeconds: story.audio_seconds ?? null,
      toldOn: story.told_on ?? null,
      toldPrecision: story.told_on_precision ?? null,
      credits,
      connections: await creditConnections(admin, story.story_id, credits, personName),
    };
  },
);
