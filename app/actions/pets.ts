"use server";

import { requireProfile } from "@/lib/auth";
import {
  friendlyDbError,
  ownedWrite,
  RLS_REFUSED,
  type ErrorRule,
} from "@/lib/db-errors";
import { toStoredCrop, type CropTransform } from "@/lib/image-crop";
import { removeReplacedPhotos } from "@/lib/photo-cleanup.server";
import { photoPathOwner } from "@/lib/photo-path";
import { petSchema, toPetPayload, type PetFormValues } from "@/lib/pet-schema";
import { revalidateTreePages } from "@/lib/revalidate";
import { membershipOf } from "@/lib/tree-context";
import { createClient } from "@/lib/supabase/server";

export type PetActionResult = { petId?: string; error?: string };

/**
 * What a refused write says. RLS doesn't raise on an UPDATE it filters out —
 * the row simply isn't touched — so the actions below ask for the row back and
 * treat "none" as this.
 */
const NOT_YOURS_TO_EDIT = "You don't have permission to change this companion.";

/** What a refused write to a companion says, by the database's reason. */
const PET_RULES: readonly ErrorRule[] = [
  [RLS_REFUSED, NOT_YOURS_TO_EDIT],
  ["same tree", "That person isn't on this tree."],
  ["duplicate key", "They're already listed as a companion."],
];
const PET_FALLBACK =
  "Couldn't save this companion. Check the fields and try again.";

function friendlyError(message: string | undefined): string {
  return friendlyDbError(message, PET_RULES, PET_FALLBACK);
}

/**
 * Add a companion animal and link it to the people it belongs to.
 *
 * A pet must arrive with at least one companion: it has no place of its own on
 * the canvas, it hangs off its people, and the DB drops a pet whose last
 * companion goes away.
 */
export async function addPet(input: {
  /** The tree the companion lives on; its people must be shown there. */
  treeId: string;
  values: PetFormValues;
  companionIds: string[];
  /** Which companion the chip hangs from; the first one if not given. */
  primaryPersonId?: string | null;
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

  const { error: notMember } = await membershipOf(input.treeId);
  if (notMember) return { error: notMember };

  const supabase = await createClient();
  const { data: pet, error } = await supabase
    .from("pets")
    .insert({
      ...toPetPayload(parsed.data),
      tree_id: input.treeId,
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

  // The primary is set *after* the links exist: the DB checks it against them,
  // so it can't travel on the insert. Best-effort — a pet with no primary still
  // draws, hanging off its topmost companion.
  const primary =
    input.primaryPersonId && companionIds.includes(input.primaryPersonId)
      ? input.primaryPersonId
      : companionIds[0];
  await supabase
    .from("pets")
    .update({ primary_person_id: primary })
    .eq("id", pet.id);

  revalidateTreePages();
  return { petId: pet.id };
}

/**
 * Choose which companion a pet hangs from on the canvas.
 *
 * The primary decides the chip's row and keeps it tethered there; the other
 * companions only pull it sideways. See lib/pet-layout.ts.
 */
export async function setPetPrimaryCompanion(
  petId: string,
  personId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const saved = await ownedWrite(
    supabase
      .from("pets")
      .update({ primary_person_id: personId })
      .eq("id", petId)
      .select("id"),
    {
      refused: NOT_YOURS_TO_EDIT,
      failed: (m) =>
        friendlyDbError(
          m,
          [
            [
              "primary connection",
              "Pick someone this companion already belongs to.",
            ],
            ...PET_RULES,
          ],
          PET_FALLBACK,
        ),
    },
  );
  if (saved.error) return { error: saved.error };
  revalidateTreePages();
  return {};
}

/**
 * Edit the handful of fields a companion has, and its photo with them
 * (Step 77.5): a new one already uploaded to its folder, or the one it has
 * framed anew — one write for the lot.
 */
export async function updatePet(
  petId: string,
  values: PetFormValues,
  photo?: { path: string; crop: CropTransform } | { crop: CropTransform } | null,
): Promise<PetActionResult> {
  await requireProfile();

  const parsed = petSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const newPath = photo && "path" in photo ? photo.path : null;
  const owner = newPath ? photoPathOwner(newPath) : null;
  if (newPath && (owner?.kind !== "pet" || owner.petId !== petId)) {
    return { error: "That photo isn't this companion's." };
  }

  const supabase = await createClient();
  // A new photo leaves the old file behind (Step 82).
  const { data: before } = newPath
    ? await supabase.from("pets").select("photo_path").eq("id", petId).maybeSingle()
    : { data: null };
  let write = supabase
    .from("pets")
    .update({
      ...toPetPayload(parsed.data),
      ...(newPath ? { photo_path: newPath } : {}),
      ...(photo ? { photo_crop: toStoredCrop(photo.crop) } : {}),
    })
    .eq("id", petId);
  // A photo in a folder of another tree: nobody on this one could see it.
  if (owner) write = write.eq("tree_id", owner.treeId);
  const saved = await ownedWrite(write.select("id"), {
    refused: NOT_YOURS_TO_EDIT,
    failed: friendlyError,
  });
  if (saved.error) return { error: saved.error };

  if (newPath) removeReplacedPhotos("pet", petId, [before?.photo_path], newPath);
  revalidateTreePages();
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
  revalidateTreePages();
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

  // Refused by RLS, the delete touches nothing and says nothing: that's a
  // refusal too, not an unlink (Step 77.4).
  const unlinked = await ownedWrite(
    supabase
      .from("pet_companions")
      .delete()
      .eq("pet_id", petId)
      .eq("person_id", personId)
      .select("pet_id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyError },
  );
  if (unlinked.error) return { error: unlinked.error };
  revalidateTreePages();
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

  // Only once the row is really gone does its photo go (Step 77.4): a
  // refused delete used to read as done.
  const removed = await ownedWrite(
    supabase.from("pets").delete().eq("id", petId).select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyError },
  );
  if (removed.error) return { error: removed.error };

  if (pet?.photo_path) {
    await supabase.storage.from("photos").remove([pet.photo_path]);
  }

  revalidateTreePages();
  return {};
}

/**
 * Point a pet row at an uploaded photo (or clear it). Only a photo in this
 * companion's own folder, on its own tree (Step 77.4): the tree's members
 * can read nothing else. The file it pointed at before goes (Step 82).
 */
export async function setPetPhoto(
  petId: string,
  photoPath: string | null,
  crop?: CropTransform,
): Promise<{ error?: string }> {
  await requireProfile();
  const owner = photoPath === null ? null : photoPathOwner(photoPath);
  if (photoPath !== null && (owner?.kind !== "pet" || owner.petId !== petId)) {
    return { error: "That photo isn't this companion's." };
  }
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("pets")
    .select("photo_path")
    .eq("id", petId)
    .maybeSingle();
  let write = supabase
    .from("pets")
    .update({
      photo_path: photoPath,
      photo_crop: photoPath && crop ? toStoredCrop(crop) : null,
    })
    .eq("id", petId);
  // In a folder of another tree, nobody on this one could see it.
  if (owner) write = write.eq("tree_id", owner.treeId);
  const saved = await ownedWrite(write.select("id"), {
    refused: NOT_YOURS_TO_EDIT,
    failed: friendlyError,
  });
  if (saved.error) return { error: saved.error };
  removeReplacedPhotos("pet", petId, [before?.photo_path], photoPath);
  revalidateTreePages();
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
  const notYours = "Only someone who can edit this companion can move it.";
  const moved = await ownedWrite(
    supabase
      .from("pets")
      .update({ pos_dx: Math.round(dx), pos_dy: Math.round(dy) })
      .eq("id", petId)
      .select("id"),
    {
      refused: notYours,
      failed: (m) =>
        friendlyDbError(m, [[RLS_REFUSED, notYours], ...PET_RULES], PET_FALLBACK),
    },
  );
  if (moved.error) return { error: moved.error };
  revalidateTreePages();
  return {};
}
