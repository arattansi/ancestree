import { PHOTO_EXTENSIONS } from "@/lib/photo-path";

/**
 * Where album photos live in the `album` bucket (Step 88.5):
 * `{tree}/{file}`, under the tree they were added on. The bucket's insert
 * policy reads the first folder (a member of that tree may upload there),
 * and `add_album_photo` checks it, so the layout is written and read here.
 */

/** A new, unused path for a photo of type `type` added on `treeId`, or null
 *  for a type the bucket won't take. */
export function albumPath(treeId: string, type: string): string | null {
  const ext = PHOTO_EXTENSIONS[type];
  return ext ? `${treeId}/${crypto.randomUUID()}.${ext}` : null;
}

/**
 * Whether `path` is a file directly in `treeId`'s folder: the only place
 * an upload for that tree can have gone.
 */
export function isAlbumPathOn(path: string, treeId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 2 &&
    parts[0] === treeId &&
    parts[1] !== "" &&
    parts[1] !== "." &&
    parts[1] !== ".."
  );
}
