"use server";

import { listEntryComments, type EntryComment } from "@/lib/entry-comments";
import { requireProfile } from "@/lib/auth";
import { COMMENT_MAX } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";

/** Every comment on an entry's board on one tree, for the detail panel. */
export async function getEntryComments(
  treeId: string,
  personId: string,
): Promise<EntryComment[]> {
  await requireProfile();
  return listEntryComments(treeId, personId);
}

/**
 * Add a comment to an entry. Any tree member may do this; membership is
 * enforced by `entry_comments` RLS. A DB trigger notifies the entry's owner
 * and original creator.
 */
export async function addEntryComment(input: {
  /** The board it goes on: one per tree (Step 25). */
  treeId: string;
  personId: string;
  body: string;
}): Promise<{ error?: string; comment?: EntryComment }> {
  const profile = await requireProfile();
  const body = input.body.trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > COMMENT_MAX) {
    return { error: `Keep it under ${COMMENT_MAX} characters.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entry_comments")
    .insert({
      tree_id: input.treeId,
      person_id: input.personId,
      body,
      created_by: profile.auth_user_id,
    })
    .select("id, body, created_at, created_by")
    .single();

  if (error || !data) {
    return { error: "Couldn't post that. Refresh and try again." };
  }

  // A comment only shows on the board, which keeps its own list (Step 61).
  return {
    comment: {
      id: data.id,
      body: data.body,
      createdAt: data.created_at,
      createdBy: data.created_by,
      authorName: profile.display_name ?? "You",
    },
  };
}
