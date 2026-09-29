import "server-only";

import { after } from "next/server";

import { photosLeftBehind, type PhotoOwner } from "@/lib/photo-path";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A photo a save left behind goes (Step 82). Replacing or clearing an
 * entry's or a companion's photo used to leave the old file in the bucket
 * for good. Now each writer of `photo_path` reads what it held before the
 * write and, once the write has gone through, hands it here. It goes:
 *
 * - only from that entry's own folder (`photosLeftBehind`), so the service
 *   role removes nothing storage wouldn't have let the saver remove;
 * - only once nothing points at it: no entry or companion (a claim merge
 *   moves files between folders), and no Branch's edit a Root can still
 *   undo, since the undo puts the old photo back (`revert_entry_edit`
 *   restores `entry_revisions.before`). Entries on other trees and
 *   revisions are out of the saver's sight, so the service role asks;
 * - after the response (`after`): a removal that fails leaves the file, as
 *   before, and can't fail or slow the save.
 */

type Db = ReturnType<typeof createAdminClient>;

/**
 * Which of `paths` nothing points at. When any of that can't be read,
 * none: a file goes only on a clear answer.
 */
async function unusedPhotos(db: Db, paths: string[]): Promise<string[]> {
  const [people, pets, revisions] = await Promise.all([
    db.from("people").select("photo_path").in("photo_path", paths),
    db.from("pets").select("photo_path").in("photo_path", paths),
    db
      .from("entry_revisions")
      .select("photo_path:before->>photo_path")
      .is("reverted_at", null)
      .in("before->>photo_path", paths),
  ]);
  const failed = people.error ?? pets.error ?? revisions.error;
  if (failed) {
    console.error("[photo-cleanup] couldn't tell what still shows a photo", failed.message);
    return [];
  }
  const used = new Set(
    [...(people.data ?? []), ...(pets.data ?? []), ...(revisions.data ?? [])].map(
      (row) => row.photo_path,
    ),
  );
  return paths.filter((path) => !used.has(path));
}

async function removeUnused(db: Db, paths: string[]): Promise<string[]> {
  const unused = await unusedPhotos(db, paths);
  if (unused.length === 0) return [];
  const { data, error } = await db.storage.from("photos").remove(unused);
  if (error) {
    console.error("[photo-cleanup] a photo left behind wasn't removed", error.message);
    return [];
  }
  return (data ?? []).map((file) => file.name);
}

function logThrown(err: unknown) {
  console.error(
    "[photo-cleanup] a photo left behind wasn't removed",
    err instanceof Error ? err.message : err,
  );
}

/**
 * Remove the photos among `paths` that nothing points at, with the service
 * role. What was removed; never throws.
 */
export async function removeUnusedPhotos(paths: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(paths)].filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    return await removeUnused(createAdminClient(), wanted);
  } catch (err) {
    logThrown(err);
    return [];
  }
}

/**
 * Once the response has gone, remove what a save of person or companion
 * `id` left behind: whichever of `was` — what it pointed at before the
 * write — isn't `now`, lies in its own folder and nothing points at. Call
 * it only once the write has gone through: that's what proves the right to
 * remove it.
 */
export function removeReplacedPhotos(
  kind: PhotoOwner["kind"],
  id: string,
  was: readonly (string | null | undefined)[],
  now: string | null = null,
): void {
  const left = photosLeftBehind(kind, id, was, now);
  if (left.length > 0) after(() => removeUnusedPhotos(left));
}

/**
 * Once the response has gone, remove the photos a Branch's edit held that
 * nothing shows after a Root's undo of it (Step 22.4): the Branch's, when
 * the undo put the old one back; or the old one, when the photo had
 * changed again since and only this undo could have brought it back. Call
 * it only once the undo has gone through.
 */
export function removeUndonePhotos(revisionId: string): void {
  after(async () => {
    try {
      const db = createAdminClient();
      const { data: edit, error } = await db
        .from("entry_revisions")
        .select(
          "person_id, before_photo:before->>photo_path, after_photo:after->>photo_path",
        )
        .eq("id", revisionId)
        .maybeSingle();
      if (error) {
        console.error("[photo-cleanup] couldn't read an undone edit", error.message);
        return;
      }
      if (!edit) return;
      const left = photosLeftBehind("person", edit.person_id, [
        edit.before_photo,
        edit.after_photo,
      ]);
      if (left.length > 0) await removeUnused(db, left);
    } catch (err) {
      logThrown(err);
    }
  });
}
