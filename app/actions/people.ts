"use server";

import { requireProfile } from "@/lib/auth";
import { friendlyDbError, ownedWrite, RLS_REFUSED } from "@/lib/db-errors";
import { ENTRY_RULES, friendlyEntryError } from "@/lib/entry-errors";
import { toStoredCrop, type CropTransform } from "@/lib/image-crop";
import {
  removeReplacedPhotos,
  removeUndonePhotos,
} from "@/lib/photo-cleanup.server";
import { photoPathOwner } from "@/lib/photo-path";
import {
  personSchema,
  toPersonPayload,
  type PersonFormValues,
} from "@/lib/person-schema";
import { fillFields } from "@/lib/fill-blanks";
import { revalidateTreePages } from "@/lib/revalidate";
import { getRoleIn, rootOf } from "@/lib/tree-context";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/database.types";

export type PersonActionState = {
  personId?: string;
  error?: string;
};

/**
 * A photo that goes with an edit (Step 77.5): a new file, already uploaded
 * to the entry's folder, and its framing; or the photo it has, framed anew.
 * Saved in the same write as the details, so an edit is one change — one
 * notice to the entry's people, one undo for a Root.
 */
export type PhotoChange = { path: string; crop: CropTransform } | { crop: CropTransform };

/**
 * What a refused write to someone else's entry says. RLS doesn't raise on an
 * UPDATE it filters out — the row simply isn't touched — so the actions below
 * ask for the row back and treat "none" as this.
 */
const NOT_YOURS_TO_EDIT =
  "Only this entry's owner, a Branch for this side of the family, or a Root can change it.";

const NOT_YOURS_TO_MOVE =
  "Only this entry's owner, a Branch for this side of the family, or a Root can move this card.";

/**
 * Update an existing person entry. Owner, admin, or a branch admin on their
 * branch (enforced by RLS).
 */
export async function updatePerson(
  personId: string,
  values: PersonFormValues,
  photo?: PhotoChange | null,
): Promise<PersonActionState> {
  const profile = await requireProfile();
  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  if (photo && "path" in photo) {
    const owner = photoPathOwner(photo.path);
    if (owner?.kind !== "person" || owner.personId !== personId) {
      return { error: "That photo isn't this entry's." };
    }
  }
  const payload = toPersonPayload(parsed.data);

  const update: TablesUpdate<"people"> = {
    first_name: payload.first_name,
    middle_name: payload.middle_name,
    preferred_name: payload.preferred_name,
    maiden_name: payload.maiden_name,
    last_name: payload.last_name,
    date_of_birth: payload.date_of_birth,
    date_of_birth_precision: payload.date_of_birth_precision,
    birth_month: payload.birth_month,
    birth_day: payload.birth_day,
    date_of_birth_circa: payload.date_of_birth_circa,
    place_id_birth: payload.place_id_birth,
    city_of_birth: payload.city_of_birth,
    country_of_birth: payload.country_of_birth,
    is_deceased: payload.is_deceased,
    date_of_death: payload.date_of_death,
    date_of_death_precision: payload.date_of_death_precision,
    date_of_death_circa: payload.date_of_death_circa,
    place_id_death: payload.place_id_death,
    place_of_death: payload.place_of_death,
    sex: payload.sex,
    ...(photo && "path" in photo ? { photo_path: photo.path } : {}),
    ...(photo ? { photo_crop: toStoredCrop(photo.crop) } : {}),
  };
  const supabase = await createClient();
  // Its photo too: a new one leaves the old file behind (Step 82).
  const { data: home } = await supabase
    .from("people")
    .select("tree_id, owner_user_id, photo_path")
    .eq("id", personId)
    .maybeSingle();
  // lineage_type is a home-tree Root's alone; the DB trigger rejects other
  // writers, so only send it when the caller is one.
  if (home && (await getRoleIn(home.tree_id)) === "admin") {
    update.lineage_type = payload.lineage_type ?? null;
  }
  // Contact details are the entry owner's alone: anyone else's form never
  // showed them, so writing its blanks would wipe them.
  if (home?.owner_user_id === profile.auth_user_id) {
    update.email = payload.email;
    update.email_visible = payload.email_visible;
  }
  void profile;

  const saved = await ownedWrite(
    supabase.from("people").update(update).eq("id", personId).select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyEntryError },
  );
  if (saved.error) return { error: saved.error };

  if (photo && "path" in photo) {
    removeReplacedPhotos("person", personId, [home?.photo_path], photo.path);
  }
  revalidateTreePages();
  return { personId };
}

/** What a refused fill says (Step 44), by the `FILL_BLANKS` reason. */
function friendlyFillError(message: string): string {
  return friendlyDbError(
    message,
    [
      [
        "not yours to fill in",
        "This entry isn't yours to fill in any more. Someone may have claimed it; refresh and look again.",
      ],
      ["photo", "The photo didn't reach this entry. Try adding it again."],
      [
        "longer than",
        "One of those is too long. Keep names under 120 characters.",
      ],
      ...ENTRY_RULES,
    ],
    "Couldn't save this entry. Check the fields and try again.",
  );
}

/**
 * Fill in what's missing on an entry the caller can't edit (Step 44): a
 * Branch or a Leaf, on an unclaimed entry on their own line. The
 * `fill_person_blanks` RPC decides who may, and sets only what's empty — it
 * never changes or clears a value, so sending the whole form is safe. A photo
 * is uploaded into the entry's folder first (the storage policy allows that
 * while it has none) and named here. Returns what was filled in.
 */
export async function fillPersonBlanks(
  personId: string,
  values: PersonFormValues,
  photo?: { path: string; crop: CropTransform } | null,
): Promise<{ filled?: string[]; error?: string }> {
  await requireProfile();
  const parsed = personSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields and try again." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fill_person_blanks", {
    p_person: personId,
    p_fields: fillFields(
      toPersonPayload(parsed.data),
      photo ? { path: photo.path, crop: toStoredCrop(photo.crop) } : null,
    ),
  });
  if (error) return { error: friendlyFillError(error.message) };
  revalidateTreePages();
  return { filled: data ?? [] };
}

/**
 * Persist a drag as a *nudge* from the card's auto-layout position, so it keeps
 * following the tree as relatives are added instead of freezing in place. Also
 * clears any legacy absolute pin on the row, converting it on first drag.
 * Owner, admin, or a branch admin on their branch (RLS).
 */
export async function setPersonPosition(
  treeId: string,
  personId: string,
  dx: number,
  dy: number,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  // The card's place on *this* canvas (Step 25): a person shown on two trees
  // sits wherever each tree put them.
  const moved = await ownedWrite(
    supabase
      .from("tree_placements")
      .update({
        pos_dx: Math.round(dx),
        pos_dy: Math.round(dy),
        pos_x: null,
        pos_y: null,
      })
      .eq("tree_id", treeId)
      .eq("person_id", personId)
      .select("id"),
    {
      refused: NOT_YOURS_TO_MOVE,
      failed: (m) =>
        friendlyDbError(
          m,
          [[RLS_REFUSED, NOT_YOURS_TO_MOVE], ...ENTRY_RULES],
          "Couldn't save this entry. Check the fields and try again.",
        ),
    },
  );
  if (moved.error) return { error: moved.error };
  // Not redrawn (Step 87.3): the canvas holds the card where it was dropped
  // until a later page knows it, Back included (`lib/local-drops`), and no
  // other page draws where cards sit.
  return {};
}

/**
 * Drop every manual nudge and legacy pin in the tree, handing the whole canvas
 * back to the auto-layout. Admin only — it discards other people's placements.
 */
export async function autoArrangeTree(
  treeId: string,
): Promise<{ error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: "Only a Root can re-arrange the whole tree." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tree_placements")
    .update({ pos_dx: null, pos_dy: null, pos_x: null, pos_y: null })
    .eq("tree_id", treeId);
  if (error) return { error: friendlyEntryError(error.message) };

  // Companions hang off the people, so their nudges go with the same sweep.
  await supabase
    .from("pets")
    .update({ pos_dx: null, pos_dy: null })
    .eq("tree_id", treeId);
  revalidateTreePages();
  return {};
}

/**
 * Point a person row at an uploaded photo (or clear it). Only a photo in
 * this entry's own folder (Step 77.4): anything else could be another
 * entry's file. The file it pointed at before goes (Step 82).
 */
export async function setPersonPhoto(
  personId: string,
  photoPath: string | null,
  crop?: CropTransform,
): Promise<{ error?: string }> {
  await requireProfile();
  if (photoPath !== null) {
    const owner = photoPathOwner(photoPath);
    if (owner?.kind !== "person" || owner.personId !== personId) {
      return { error: "That photo isn't this entry's." };
    }
  }
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("people")
    .select("photo_path")
    .eq("id", personId)
    .maybeSingle();
  const saved = await ownedWrite(
    supabase
      .from("people")
      .update({
        photo_path: photoPath,
        photo_crop: photoPath && crop ? toStoredCrop(crop) : null,
      })
      .eq("id", personId)
      .select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyEntryError },
  );
  if (saved.error) return { error: saved.error };
  removeReplacedPhotos("person", personId, [before?.photo_path], photoPath);
  revalidateTreePages();
  return {};
}

/** Re-frame a photo that is already uploaded — no new file involved. */
export async function setPersonPhotoCrop(
  personId: string,
  crop: CropTransform,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const saved = await ownedWrite(
    supabase
      .from("people")
      .update({ photo_crop: toStoredCrop(crop) })
      .eq("id", personId)
      .select("id"),
    { refused: NOT_YOURS_TO_EDIT, failed: friendlyEntryError },
  );
  if (saved.error) return { error: saved.error };
  revalidateTreePages();
  return {};
}

/**
 * Root: undo a Branch's edit to an entry a Root added (Step 22.4). The edit
 * published at once; `revert_entry_edit` puts back each field it changed that
 * nobody has changed since, and tells the Branch.
 */
export async function revertEntryEdit(
  revisionId: string,
): Promise<{ error?: string; restored?: number }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revert_entry_edit", {
    p_revision_id: revisionId,
  });
  if (error) {
    if (error.message.includes("ALREADY_REVERTED")) {
      return { error: "That change has already been undone." };
    }
    if (error.message.includes("NOTHING_TO_REVERT")) {
      return {
        error:
          "Those details have been changed again since, so there's nothing left of this edit to undo.",
      };
    }
    if (error.message.includes("REVISION_NOT_FOUND")) {
      return { error: "That entry no longer exists." };
    }
    return { error: friendlyEntryError(error.message) };
  }
  // A photo the edit held that the entry no longer shows goes (Step 82).
  removeUndonePhotos(revisionId);
  revalidateTreePages();
  return { restored: data?.length ?? 0 };
}

/** What a refused placeholder child says (Step 98.2). */
function friendlyPlaceholderError(message: string | undefined): string {
  return friendlyDbError(
    message ?? "",
    [
      ["only a Root or a Branch", "Only a Root or a Branch can add a placeholder."],
      ["living parent", "A placeholder needs a living parent to fill it in."],
      ["isn't on this tree", "Their parent isn't on this tree."],
      ["BLOODLINE_GATE", "Their parent has no blood tie to this tree."],
    ],
    "Couldn't add the placeholder. Try again.",
  );
}

/**
 * A placeholder child of `parentIds` (Step 98.2): a Root or a Branch can't
 * add someone else's child under 18, but can hold their place, shown as
 * "First Child"… under them, theirs alone to fill in. A parent who is a
 * member is told by the database; the others come back, so whoever added it
 * can invite them to claim their own entry.
 */
export async function addPlaceholderChild(
  treeId: string,
  parentIds: string[],
): Promise<{ personId?: string; uninvitedParentIds?: string[]; error?: string }> {
  await requireProfile();
  if (parentIds.length < 1 || parentIds.length > 2) {
    return { error: "Pick their parent first." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_placeholder_child", {
    p_tree: treeId,
    p_parents: parentIds,
  });
  if (error || !data) return { error: friendlyPlaceholderError(error?.message) };
  const result = data as { id: string; uninvited_parents: string[] };
  revalidateTreePages();
  return {
    personId: result.id,
    uninvitedParentIds: result.uninvited_parents ?? [],
  };
}
