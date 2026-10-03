"use server";

import { requireProfile } from "@/lib/auth";
import { listAlbum, type AlbumPhoto } from "@/lib/album";
import { isAlbumPathOn } from "@/lib/album-path";
import { takenProblem } from "@/lib/album-taken";
import { friendlyDbError, ownedWrite } from "@/lib/db-errors";
import { removeAlbumPhotosLater } from "@/lib/file-cleanup.server";
import { ALBUM_DESCRIPTION_MAX, ALBUM_PEOPLE_MAX } from "@/lib/limits";
import { toStoredDate } from "@/lib/partial-date";
import { createClient } from "@/lib/supabase/server";

/**
 * Albums (Step 88.5), in place of an entry's documents. The sheet keeps
 * its own list, so none of these draws the page again: each hands back
 * what the list needs.
 */

/** What adding a photo says when it can't say more. */
const NOT_ADDED = "Couldn’t add it. Try again.";

/**
 * Add a photo the viewer has just uploaded to the tree's folder, of the
 * people in it (`personId`'s album first among them), with when it was
 * taken if that's known (Step 88.6: "1962" will do). Each of them it waits
 * for, unless the viewer could approve it there. When it's refused, the
 * upload goes again. The album back is `personId`'s.
 */
export async function addAlbumPhoto(input: {
  /** Whose album it was added from. */
  personId: string;
  /** The tree it's added on, whose inbox its uploader hears back in. */
  treeId: string;
  path: string;
  description: string;
  people: string[];
  /** Partial ISO ("1962", "1962-03", "1962-03-05"), or "". */
  taken?: string;
}): Promise<{ error?: string; pending?: number; photos?: AlbumPhoto[] }> {
  const profile = await requireProfile();
  const description = input.description.trim();
  const people = [...new Set([input.personId, ...input.people])];
  const supabase = await createClient();

  // Refused: the upload no photo took goes, as its uploader (storage lets
  // them, while nothing points at it).
  const refuse = async (error: string) => {
    if (isAlbumPathOn(input.path, input.treeId)) {
      await supabase.storage.from("album").remove([input.path]).catch(() => undefined);
    }
    return { error };
  };

  if (!isAlbumPathOn(input.path, input.treeId)) {
    return { error: "The photo didn’t upload." };
  }
  if (description.length > ALBUM_DESCRIPTION_MAX) {
    return refuse(`Keep the description under ${ALBUM_DESCRIPTION_MAX} characters.`);
  }
  if (people.length > ALBUM_PEOPLE_MAX) {
    return refuse(`Tag ${ALBUM_PEOPLE_MAX} people at most.`);
  }
  const takenError = takenProblem(input.taken ?? "");
  if (takenError) return refuse(takenError);
  const taken = toStoredDate(input.taken);

  const { data, error } = await supabase.rpc("add_album_photo", {
    p_tree: input.treeId,
    p_path: input.path,
    p_description: description,
    p_people: people,
    p_taken_on: taken.date ?? undefined,
    p_taken_precision: taken.date ? taken.precision : undefined,
  });
  if (error) {
    return refuse(
      friendlyDbError(
        error.message,
        [
          ["not on your tree", "Someone tagged isn’t on this tree."],
          ["didn't arrive", "The photo didn’t upload."],
          ["album_photos_file_path_key", "The photo didn’t upload."],
          ["nobody in it", "Tag who’s in it."],
          ["too many people", `Tag ${ALBUM_PEOPLE_MAX} people at most.`],
          ["longer than a description may be", `Keep the description under ${ALBUM_DESCRIPTION_MAX} characters.`],
          ["taken after today", "That’s after today."],
        ],
        NOT_ADDED,
      ),
    );
  }
  const added = data as { pending?: number } | null;
  return {
    pending: added?.pending ?? 0,
    // It's added either way; an album that can't be read now is read again.
    photos: await listAlbum(input.personId, profile.auth_user_id).catch(() => undefined),
  };
}

/**
 * Its uploader changes what a photo is of and who's in it (Step 114): the
 * whole new description and list of people, `personId`'s album always
 * among them. Someone newly in it waits, as when it was added; new words
 * go back to whoever else approved the old ones. The album back is
 * `personId`'s.
 */
export async function editAlbumPhoto(input: {
  photoId: string;
  /** Whose album it's edited from, who stays in it. */
  personId: string;
  /** The tree it's edited on: anyone newly in it is on it. */
  treeId: string;
  description: string;
  people: string[];
}): Promise<{ error?: string; pending?: number; photos?: AlbumPhoto[] }> {
  const profile = await requireProfile();
  const description = input.description.trim();
  const people = [...new Set([input.personId, ...input.people])];
  if (description.length > ALBUM_DESCRIPTION_MAX) {
    return { error: `Keep the description under ${ALBUM_DESCRIPTION_MAX} characters.` };
  }
  if (people.length > ALBUM_PEOPLE_MAX) {
    return { error: `Tag ${ALBUM_PEOPLE_MAX} people at most.` };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("edit_album_photo", {
    p_photo: input.photoId,
    p_tree: input.treeId,
    p_description: description,
    p_people: people,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["not yours to edit", "Only whoever added it can edit it."],
          ["not on your tree", "Someone tagged isn’t on this tree."],
          ["nobody in it", "Tag who’s in it."],
          ["too many people", `Tag ${ALBUM_PEOPLE_MAX} people at most.`],
          ["longer than a description may be", `Keep the description under ${ALBUM_DESCRIPTION_MAX} characters.`],
        ],
        "Couldn’t save it. Try again.",
      ),
    };
  }
  const edited = data as { pending?: number } | null;
  return {
    pending: edited?.pending ?? 0,
    // Saved either way; an album that can't be read now is read again.
    photos: await listAlbum(input.personId, profile.auth_user_id).catch(() => undefined),
  };
}

/**
 * Approve or decline a photo waiting on the viewer in someone's album. Its
 * uploader is told; a declined one stays for them alone.
 */
export async function decideAlbumPhoto(
  photoId: string,
  personId: string,
  approve: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_album_tag", {
    p_photo: photoId,
    p_person: personId,
    p_approve: approve,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["already decided", "It’s already been answered."],
          ["not yours to approve", "It isn’t yours to approve."],
        ],
        "Couldn’t answer it. Try again.",
      ),
    };
  }
  return {};
}

/**
 * Take a photo out of someone's album: its uploader, whoever approves their
 * photos, or whoever can edit the entry. It stays in the others'; nobody
 * left in it, and it goes, file and all, after the response.
 */
export async function removeFromAlbum(
  photoId: string,
  personId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  // Read first, while the viewer can still see it: the file to check after.
  const { data: photo } = await supabase
    .from("album_photos")
    .select("file_path")
    .eq("id", photoId)
    .maybeSingle();
  const res = await ownedWrite(
    supabase
      .from("album_tags")
      .delete()
      .eq("photo_id", photoId)
      .eq("person_id", personId)
      .select("photo_id"),
    {
      refused: "It’s gone already, or isn’t yours to remove.",
      failed: "Couldn’t remove it. Try again.",
    },
  );
  if (res.error !== undefined) return { error: res.error };
  if (photo?.file_path) removeAlbumPhotosLater([photo.file_path]);
  return {};
}

/**
 * Delete a photo the viewer added, from every album it's in. Its file goes
 * after the response, with the service role, since the photo it belonged
 * to (storage's way of knowing who may touch it) is gone.
 */
export async function deleteAlbumPhoto(photoId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const res = await ownedWrite(
    supabase.from("album_photos").delete().eq("id", photoId).select("file_path"),
    {
      refused: "It’s gone already, or isn’t yours to delete.",
      failed: "Couldn’t delete it. Try again.",
    },
  );
  if (res.error !== undefined) return { error: res.error };
  removeAlbumPhotosLater(res.rows.map((r) => r.file_path));
  return {};
}
