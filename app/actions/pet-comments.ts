"use server";

import { requireProfile } from "@/lib/auth";
import { ownedWrite } from "@/lib/db-errors";
import { COMMENT_MAX } from "@/lib/limits";
import { listPetComments, type PetComment } from "@/lib/pet-comments";
import { createClient } from "@/lib/supabase/server";

/** Every comment on a companion, for its detail panel. */
export async function getPetComments(petId: string): Promise<PetComment[]> {
  await requireProfile();
  return listPetComments(petId);
}

/**
 * Add a comment to a companion. Any tree member may do this; membership is
 * enforced by `pet_comments` RLS. No notifications — a companion has no owner
 * to tell. Nothing a page draws counts the comments (the panel keeps its own
 * list), so no page is drawn again (Step 61).
 */
export async function addPetComment(input: {
  petId: string;
  body: string;
}): Promise<{ error?: string; comment?: PetComment }> {
  const profile = await requireProfile();
  const body = input.body.trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > COMMENT_MAX) {
    return { error: `Keep it under ${COMMENT_MAX} characters.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pet_comments")
    .insert({
      pet_id: input.petId,
      body,
      created_by: profile.auth_user_id,
    })
    .select("id, body, created_at, created_by")
    .single();

  if (error || !data) {
    return { error: "Couldn't post that. Refresh and try again." };
  }

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

/** Remove a comment (its author, or anyone who can edit the companion). */
export async function deletePetComment(
  commentId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  // Refused by RLS, the delete touches nothing and says nothing (Step 77.4).
  const deleted = await ownedWrite(
    supabase.from("pet_comments").delete().eq("id", commentId).select("id"),
    {
      refused:
        "Only its author, or someone who can edit this companion, can delete it.",
      failed: "Couldn't delete that comment. Try again.",
    },
  );
  return deleted.error ? { error: deleted.error } : {};
}
