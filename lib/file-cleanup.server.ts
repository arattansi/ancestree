import "server-only";

import { after } from "next/server";

import { removeUnusedPhotos } from "@/lib/photo-cleanup.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Files whose row is gone go too (Step 90). A bucket that shows a member a
 * file only while a row points at it (documents then, the album since Step
 * 88.5) can't be cleared by that member's own client once the row is gone:
 * storage deletes only what the caller can see, matched nothing and said
 * nothing, and every removed document left its file behind. So, as for
 * photos (Step 82) and recordings (Step 88.3), the row's delete is what
 * proves the right, and the file goes after it with the service role — and
 * only when no row points at it any more.
 */

type Db = ReturnType<typeof createAdminClient>;

function logThrown(what: string, err: unknown) {
  console.error(`[file-cleanup] ${what}`, err instanceof Error ? err.message : err);
}

async function removeFromBucket(db: Db, bucket: string, paths: string[]): Promise<string[]> {
  const { data, error } = await db.storage.from(bucket).remove(paths);
  if (error) {
    console.error(`[file-cleanup] ${bucket}: files left behind weren't removed`, error.message);
    return [];
  }
  const removed = (data ?? []).map((file) => file.name);
  // Storage says nothing about a path it didn't find: say it here, since
  // that's how this leak went unseen.
  if (removed.length < paths.length) {
    console.warn(
      `[file-cleanup] ${bucket}: ${paths.length - removed.length} of ${paths.length} files weren't there`,
    );
  }
  return removed;
}

/**
 * Remove the album photos among `paths` that no `album_photos` row points
 * at, with the service role (Step 88.5): a photo goes when its uploader
 * deletes it, or when nobody is in it any more (its last tag removed, or
 * its last person deleted). What was removed; never throws. When the rows
 * can't be read, nothing goes: a file goes only on a clear answer.
 */
export async function removeUnusedAlbumPhotos(paths: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(paths)].filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    const db = createAdminClient();
    const { data: used, error } = await db
      .from("album_photos")
      .select("file_path")
      .in("file_path", wanted);
    if (error) {
      console.error("[file-cleanup] couldn't tell which album photos are still kept", error.message);
      return [];
    }
    const kept = new Set((used ?? []).map((row) => row.file_path));
    const unused = wanted.filter((path) => !kept.has(path));
    return unused.length > 0 ? await removeFromBucket(db, "album", unused) : [];
  } catch (err) {
    logThrown("album photos left behind weren't removed", err);
    return [];
  }
}

/**
 * The files of the album photos anyone in `personIds` is in, read with the
 * service role before they're deleted (Step 88.5): a photo nobody else is
 * in goes with them, so its file must too. Null when they can't be read.
 */
export async function albumPhotosOf(personIds: readonly string[]): Promise<string[] | null> {
  if (personIds.length === 0) return [];
  try {
    const { data, error } = await createAdminClient()
      .from("album_tags")
      .select("album_photos(file_path)")
      .in("person_id", [...personIds]);
    if (error) {
      console.error("[file-cleanup] couldn't read who's in which album photo", error.message);
      return null;
    }
    return [
      ...new Set(
        (data ?? []).flatMap((row) => {
          const photo = Array.isArray(row.album_photos) ? row.album_photos[0] : row.album_photos;
          return photo?.file_path ? [photo.file_path] : [];
        }),
      ),
    ];
  } catch (err) {
    logThrown("couldn't read who's in which album photo", err);
    return null;
  }
}

/** Remove the story recordings among `paths` that no story points at. */
async function removeUnusedRecordings(db: Db, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data: used, error } = await db
    .from("stories")
    .select("audio_path")
    .in("audio_path", paths);
  if (error) {
    console.error("[file-cleanup] couldn't tell which recordings are still told", error.message);
    return [];
  }
  const kept = new Set((used ?? []).map((row) => row.audio_path));
  const unused = paths.filter((path) => !kept.has(path));
  return unused.length > 0 ? await removeFromBucket(db, "stories", unused) : [];
}

/**
 * Once the response has gone, remove the album photos among `paths` nothing
 * points at. Call it only once the row delete has gone through.
 */
export function removeAlbumPhotosLater(paths: readonly string[]): void {
  if (paths.some(Boolean)) after(() => removeUnusedAlbumPhotos(paths));
}

export type TreeFiles = { photos: string[]; album: string[]; recordings: string[] };

/**
 * Every file a tree's deletion could leave behind, read before it with the
 * service role (Step 90): the photos of its entries and companions, the
 * album photos its entries are in (Step 88.5), and their story recordings.
 * Entries that move to another tree keep theirs, and a photo someone else
 * is in stays for them; `removeTreeFilesLater` checks.
 */
export async function treeFiles(treeId: string): Promise<TreeFiles | null> {
  try {
    const db = createAdminClient();
    const [people, pets] = await Promise.all([
      db.from("people").select("id, photo_path").eq("tree_id", treeId),
      db.from("pets").select("photo_path").eq("tree_id", treeId).not("photo_path", "is", null),
    ]);
    const failed = people.error ?? pets.error;
    if (failed) {
      console.error("[file-cleanup] couldn't read a tree's files", failed.message);
      return null;
    }
    const personIds = (people.data ?? []).map((p) => p.id);
    const stories = personIds.length
      ? await db
          .from("stories")
          .select("audio_path")
          .in("person_id", personIds)
          .not("audio_path", "is", null)
      : { data: [] as { audio_path: string | null }[], error: null };
    if (stories.error) {
      console.error("[file-cleanup] couldn't read a tree's recordings", stories.error.message);
      return null;
    }
    const album = await albumPhotosOf(personIds);
    if (!album) return null;
    const present = (path: string | null): path is string => Boolean(path);
    return {
      photos: [...(people.data ?? []), ...(pets.data ?? [])]
        .map((row) => row.photo_path)
        .filter(present),
      album,
      recordings: (stories.data ?? []).map((row) => row.audio_path).filter(present),
    };
  } catch (err) {
    logThrown("couldn't read a tree's files", err);
    return null;
  }
}

/**
 * Once the response has gone, remove what a tree's deletion left: each of
 * `files` that no row points at now. Call it only once the delete has gone
 * through.
 */
export function removeTreeFilesLater(files: TreeFiles | null): void {
  if (!files) return;
  const { photos, album, recordings } = files;
  if (photos.length + album.length + recordings.length === 0) return;
  after(async () => {
    try {
      await Promise.all([
        removeUnusedPhotos(photos),
        removeUnusedAlbumPhotos(album),
        removeUnusedRecordings(createAdminClient(), [...new Set(recordings)]),
      ]);
    } catch (err) {
      logThrown("a deleted tree's files weren't removed", err);
    }
  });
}
