"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { listPetComments, type PetComment } from "@/lib/pet-comments";
import { createClient } from "@/lib/supabase/server";

const MAX_BODY = 2000;

/** Every comment on a companion, for its detail panel. */
export async function getPetComments(petId: string): Promise<PetComment[]> {
  await requireProfile();
  return listPetComments(petId);
}

/**
 * Add a comment to a companion. Any tree member may do this; membership is
 * enforced by `pet_comments` RLS. No notifications — a companion has no owner
 * to tell.
 */
export async function addPetComment(input: {
  petId: string;
  body: string;
}): Promise<{ error?: string; comment?: PetComment }> {
  const profile = await requireProfile();
  const body = input.body.trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > MAX_BODY) {
    return { error: `Keep it under ${MAX_BODY} characters.` };
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

  revalidatePath("/tree");
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
  const { error } = await supabase
    .from("pet_comments")
    .delete()
    .eq("id", commentId);
  if (error) {
    return { error: "Couldn't delete that comment. Try again." };
  }
  revalidatePath("/tree");
  return {};
}
