/**
 * Where documents live in the `documents` bucket: `{tree}/{person}/{file}`.
 * The bucket's insert policy reads the first two folders
 * (`private.can_write_document`), so the layout is written and read here.
 */

/** A new, unused path for a document of `personId` uploaded onto `treeId`. */
export function documentPath(treeId: string, personId: string, ext: string): string {
  return `${treeId}/${personId}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Whether `path` is a file directly in the folder of `personId` on
 * `treeId` (Step 90): the only place an upload for them can have gone.
 */
export function isDocumentOf(path: string, treeId: string, personId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === treeId &&
    parts[1] === personId &&
    parts[2] !== "" &&
    parts[2] !== "." &&
    parts[2] !== ".."
  );
}
