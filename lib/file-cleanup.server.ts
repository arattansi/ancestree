import "server-only";

import { after } from "next/server";

import { removeUnusedPhotos } from "@/lib/photo-cleanup.server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Files whose row is gone go too (Step 90). The `documents` bucket only lets
 * a member see a file while a `documents` row points at it, and storage
 * deletes only what the caller can see, so a member's own client removing a
 * document's file after deleting its row matched nothing and said nothing:
 * every removed document left its file behind. So, as for photos (Step 82)
 * and recordings (Step 88.3), the row's delete is what proves the right,
 * and the file goes after it with the service role — and only when no row
 * points at it any more.
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
 * Remove the documents among `paths` that no `documents` row points at,
 * with the service role. What was removed; never throws. When the rows
 * can't be read, nothing goes: a file goes only on a clear answer.
 */
export async function removeUnusedDocuments(paths: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(paths)].filter(Boolean);
  if (wanted.length === 0) return [];
  try {
    const db = createAdminClient();
    const { data: used, error } = await db
      .from("documents")
      .select("file_path")
      .in("file_path", wanted);
    if (error) {
      console.error("[file-cleanup] couldn't tell which documents are still recorded", error.message);
      return [];
    }
    const kept = new Set((used ?? []).map((row) => row.file_path));
    const unused = wanted.filter((path) => !kept.has(path));
    return unused.length > 0 ? await removeFromBucket(db, "documents", unused) : [];
  } catch (err) {
    logThrown("documents left behind weren't removed", err);
    return [];
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
 * Once the response has gone, remove the documents among `paths` nothing
 * points at. Call it only once the row delete has gone through.
 */
export function removeDocumentsLater(paths: readonly string[]): void {
  if (paths.some(Boolean)) after(() => removeUnusedDocuments(paths));
}

export type TreeFiles = { photos: string[]; documents: string[]; recordings: string[] };

/**
 * Every file a tree's deletion could leave behind, read before it with the
 * service role (Step 90): the photos of its entries and companions, the
 * documents uploaded onto it, and its entries' story recordings. Entries
 * that move to another tree keep theirs; `removeTreeFilesLater` checks.
 */
export async function treeFiles(treeId: string): Promise<TreeFiles | null> {
  try {
    const db = createAdminClient();
    const [people, pets, documents] = await Promise.all([
      db.from("people").select("id, photo_path").eq("tree_id", treeId),
      db.from("pets").select("photo_path").eq("tree_id", treeId).not("photo_path", "is", null),
      db.from("documents").select("file_path").eq("tree_id", treeId),
    ]);
    const failed = people.error ?? pets.error ?? documents.error;
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
    const present = (path: string | null): path is string => Boolean(path);
    return {
      photos: [...(people.data ?? []), ...(pets.data ?? [])]
        .map((row) => row.photo_path)
        .filter(present),
      documents: (documents.data ?? []).map((row) => row.file_path).filter(present),
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
  const { photos, documents, recordings } = files;
  if (photos.length + documents.length + recordings.length === 0) return;
  after(async () => {
    try {
      await Promise.all([
        removeUnusedPhotos(photos),
        removeUnusedDocuments(documents),
        removeUnusedRecordings(createAdminClient(), [...new Set(recordings)]),
      ]);
    } catch (err) {
      logThrown("a deleted tree's files weren't removed", err);
    }
  });
}
