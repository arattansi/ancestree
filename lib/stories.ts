import "server-only";

import { getSiteUrl } from "@/lib/site-url";
import { asCredits, type StoryCredit } from "@/lib/story-credits";
import { storyLinkPath } from "@/lib/story-links";
import { createClient } from "@/lib/supabase/server";

/**
 * A story about a person (Step 88.3): long-form text (Markdown, Step 99), a
 * recording, or both, with who added it and when, and, if they were named,
 * when it was told and who it's credited to (Step 99). It needs approval, from the person themself
 * once they have claimed the entry, or else from whoever can edit it; until
 * then only they and its teller see it (`stories` RLS). It shows wherever
 * the entry does in full, to that tree's members.
 */
export type EntryStory = {
  id: string;
  title: string | null;
  body: string | null;
  /** A signed link to its recording, for an hour. */
  audioUrl: string | null;
  /** It has a recording, even if its link couldn't be made (Step 99.8). */
  hasRecording: boolean;
  audioSeconds: number | null;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  /** Who added it, as the trees name them. */
  toldBy: string;
  /** When it was told, on the first day of as much of it as is known
   *  (`toldPrecision`), or null (Step 99). */
  toldOn: string | null;
  toldPrecision: string | null;
  /** Who it's credited to, storytellers first (Step 99). */
  credits: StoryCredit[];
  /** The viewer may change who it's credited to and when it was told
   *  (Steps 99.5, 99.6): its teller, whoever can edit the entry, or the
   *  person it's about. Its words are its teller's alone (`mine`, 99.7). */
  canEditCredits: boolean;
  /** The viewer told it, so may delete it. */
  mine: boolean;
  /** Waiting, and the viewer may approve it. */
  canDecide: boolean;
  /** Its comments the viewer may read (Step 88.4): an approved story's. */
  commentCount: number;
  /** Someone's public link to it works (Step 88.4). */
  shared: boolean;
  /**
   * The viewer may share it: approved, theirs to see, its person not hidden
   * from visitors, and its links not turned off, unless they could have.
   */
  canShare: boolean;
  /** The viewer may turn its links off: its person, an editor, or its teller. */
  canStopSharing: boolean;
  /** The viewer's own working link to it, once they've shared it. */
  shareUrl: string | null;
};

/** A comment on a story (Step 88.4). */
export type StoryComment = {
  id: string;
  body: string;
  createdAt: string;
  /** Who wrote it, as the trees name them. */
  saidBy: string;
  /** The viewer wrote it, so may edit or delete it. */
  mine: boolean;
  /** When its author last changed it (Step 99.9), or null. */
  editedAt: string | null;
};

/** How long a recording's link lasts: longer than anyone keeps a sheet open. */
export const AUDIO_LINK_SECONDS = 60 * 60;

/** A story link's whole address, to send. */
export function storyLinkUrl(token: string): string {
  return `${getSiteUrl()}${storyLinkPath(token)}`;
}

function asStatus(status: string): EntryStory["status"] {
  return status === "approved" || status === "declined" ? status : "pending";
}

/**
 * The stories on an entry the viewer may see, newest first: one call for
 * the lot (`entry_stories`, which runs as the viewer), and one more to sign
 * the recordings, only when there are any.
 */
export async function listStories(
  personId: string,
  viewerId: string,
): Promise<EntryStory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("entry_stories", {
    p_person: personId,
  });
  if (error) throw new Error("Couldn’t read the stories.");
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const paths = rows.flatMap((r) => (r.audio_path ? [r.audio_path] : []));
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("stories")
      .createSignedUrls(paths, AUDIO_LINK_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? null,
    body: r.body ?? null,
    audioUrl: r.audio_path ? (links.get(r.audio_path) ?? null) : null,
    hasRecording: !!r.audio_path,
    audioSeconds: r.audio_seconds ?? null,
    status: asStatus(r.status),
    createdAt: r.created_at,
    toldBy: r.told_by || "A relative",
    toldOn: r.told_on ?? null,
    toldPrecision: r.told_on_precision ?? null,
    credits: asCredits(r.credits),
    canEditCredits: r.can_edit_credits ?? false,
    mine: r.created_by === viewerId,
    canDecide: r.can_decide ?? false,
    commentCount: r.comment_count ?? 0,
    shared: r.shared ?? false,
    canShare: r.can_share ?? false,
    canStopSharing: r.can_stop_sharing ?? false,
    shareUrl: r.my_link ? storyLinkUrl(r.my_link) : null,
  }));
}

/**
 * A story's comments the viewer may read, oldest first
 * (`list_story_comments`, which runs as the viewer).
 */
export async function listStoryComments(
  storyId: string,
  viewerId: string,
): Promise<StoryComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_story_comments", {
    p_story: storyId,
  });
  if (error) throw new Error("Couldn’t read the comments.");
  return (data ?? []).map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    saidBy: r.said_by || "A relative",
    mine: r.created_by === viewerId,
    editedAt: r.edited_at ?? null,
  }));
}
