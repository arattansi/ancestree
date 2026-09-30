import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * A story about a person (Step 88.3): long-form text, a recording, or both,
 * with who told it and when. It needs approval, from the person themself
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
  audioSeconds: number | null;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  /** Who told it, as the trees name them. */
  toldBy: string;
  /** The viewer told it, so may delete it. */
  mine: boolean;
  /** Waiting, and the viewer may approve it. */
  canDecide: boolean;
};

/** How long a recording's link lasts: longer than anyone keeps a sheet open. */
const AUDIO_LINK_SECONDS = 60 * 60;

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
    audioSeconds: r.audio_seconds ?? null,
    status: asStatus(r.status),
    createdAt: r.created_at,
    toldBy: r.told_by || "A relative",
    mine: r.created_by === viewerId,
    canDecide: r.can_decide ?? false,
  }));
}
