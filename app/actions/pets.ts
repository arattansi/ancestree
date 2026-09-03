"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { toStoredCrop, type CropTransform } from "@/lib/image-crop";
import { petSchema, toPetPayload, type PetFormValues } from "@/lib/pet-schema";
import { getSharedTree } from "@/lib/tree";
import { createClient } from "@/lib/supabase/server";

export type PetActionResult = { petId?: string; error?: string };

function friendlyError(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  const m = message.toLowerCase();
  if (m.includes("row-level security")) {
    return "You don't have permission to change this companion.";
  }
  if (m.includes("same tree")) {
    return "That person isn't on this tree.";
  }
  if (m.includes("duplicate key")) {
    return "They're already listed as a companion.";
  }
  return "Couldn't save this companion. Check the fields and try again.";
}

/**
 * Add a companion animal and link it to the people it belongs to.
 *
 * A pet must arrive with at least one companion: it has no place of its own on
 * the canvas, it hangs off its people, and the DB drops a pet whose last
 * companion goes away.
 */
export async function addPet(input: {
  values: PetFormValues;
  companionIds: string[];
}): Promise<PetActionResult> {
  const profile = await requireProfile();

  const parsed = petSchema.safeParse(input.values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const companionIds = [...new Set(input.companionIds)].filter(Boolean);
  if (companionIds.length === 0) {
    return { error: "Pick at least one person this companion belongs to." };
  }

  const tree = await getSharedTree();
  if (!tree) return { error: "There's no tree to add to yet." };

  const supabase = await createClient();
  const { data: pet, error } = await supabase
    .from("pets")
    .insert({
      ...toPetPayload(parsed.data),
      tree_id: tree.id,
      created_by: profile.auth_user_id,
    })
    .select("id")
    .single();

  if (error || !pet) return { error: friendlyError(error?.message) };

  const { error: linkError } = await supabase.from("pet_companions").insert(
    companionIds.map((person_id) => ({
      pet_id: pet.id,
      person_id,
      created_by: profile.auth_user_id,
    })),
  );

  if (linkError) {
    // No companions means no place on the canvas, so don't leave a stranded
    // row behind — undo the insert and report the real problem.
    await supabase.from("pets").delete().eq("id", pet.id);
    return { error: friendlyError(linkError.message) };
  }

  revalidatePath("/tree");
  return { petId: pet.id };
}

/** Edit the handful of fields a companion has. */
export async function updatePet(
  petId: string,
  values: PetFormValues,
): Promise<PetActionResult> {
  await requireProfile();

  const parsed = petSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pets")
    .update(toPetPayload(parsed.data))
    .eq("id", petId);

  if (error) return { error: friendlyError(error.message) };

  revalidatePath("/tree");
  return { petId };
}

/** Link this companion to one more person. */
export async function addPetCompanion(
  petId: string,
  personId: string,
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("pet_companions").insert({
    pet_id: petId,
    person_id: personId,
    created_by: profile.auth_user_id,
  });
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/tree");
  return {};
}

/**
 * Unlink a companion from one person. The last link can't be removed — that
 * would delete the pet out from under the person doing it; use `removePet`.
 */
export async function removePetCompanion(
  petId: string,
  personId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: links } = await supabase
    .from("pet_companions")
    .select("person_id")
    .eq("pet_id", petId);

  if ((links ?? []).length <= 1) {
    return {
      error:
        "A companion has to belong to someone. Add another person first, or remove the companion.",
    };
  }

  const { error } = await supabase
    .from("pet_companions")
    .delete()
    .eq("pet_id", petId)
    .eq("person_id", personId);

  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/tree");
  return {};
}

/** Remove a companion from the tree, photo and all. */
export async function removePet(petId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: pet } = await supabase
    .from("pets")
    .select("photo_path")
    .eq("id", petId)
    .maybeSingle();

  const { error } = await supabase.from("pets").delete().eq("id", petId);
  if (error) return { error: friendlyError(error.message) };

  if (pet?.photo_path) {
    await supabase.storage.from("photos").remove([pet.photo_path]);
  }

  revalidatePath("/tree");
  return {};
}

/** Point a pet row at an uploaded photo (or clear it). */
export async function setPetPhoto(
  petId: string,
  photoPath: string | null,
  crop?: CropTransform,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("pets")
    .update({
      photo_path: photoPath,
      photo_crop: photoPath && crop ? toStoredCrop(crop) : null,
    })
    .eq("id", petId);
  if (error) return { error: friendlyError(error.message) };
  revalidatePath("/tree");
  return {};
}

/**
 * Persist a drag as a nudge from the spot under the pet's companions, so the
 * chip keeps following them as the tree grows.
 */
export async function setPetPosition(
  petId: string,
  dx: number,
  dy: number,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("pets")
    .update({ pos_dx: Math.round(dx), pos_dy: Math.round(dy) })
    .eq("id", petId);
  if (error) {
    if (error.message.toLowerCase().includes("row-level security")) {
      return { error: "Only someone who can edit this companion can move it." };
    }
    return { error: friendlyError(error.message) };
  }
  revalidatePath("/tree");
  return {};
}
