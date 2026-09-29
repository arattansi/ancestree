/**
 * Where photos live in the `photos` bucket (Step 77.4, audit R2). The layout
 * is load-bearing: the bucket's policies read it, `fill_person_blanks` checks
 * the person's folder, and `claim_person` moves a photo only when its path
 * matches it. So it's written and read in this one place.
 *
 * - A person's: `{tree}/{person}/{file}`. Writing needs `can_edit_person` of
 *   the person folder; any tree the person is on will do for the first.
 * - A companion's: `{tree}/pets/{pet}/{file}`. Reading needs membership of
 *   the tree folder, so it must be the companion's own tree.
 */

export type PhotoOwner =
  | { kind: "person"; treeId: string; personId: string }
  | { kind: "pet"; treeId: string; petId: string };

/**
 * A photo's file ending by its type: the three the picker takes and the
 * bucket allows. Anything else isn't a photo here.
 */
export const PHOTO_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** A new, unused path for a photo of `owner`, ending `.ext`. */
export function photoPath(owner: PhotoOwner, ext: string): string {
  const file = `${crypto.randomUUID()}.${ext}`;
  return owner.kind === "person"
    ? `${owner.treeId}/${owner.personId}/${file}`
    : `${owner.treeId}/pets/${owner.petId}/${file}`;
}

/** Whose photo a stored path is, or `null` for one laid out otherwise. */
export function photoPathOwner(path: string): PhotoOwner | null {
  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return null;
  }
  if (parts.length === 3 && parts[1] !== "pets") {
    return { kind: "person", treeId: parts[0], personId: parts[1] };
  }
  if (parts.length === 4 && parts[1] === "pets") {
    return { kind: "pet", treeId: parts[0], petId: parts[2] };
  }
  return null;
}
