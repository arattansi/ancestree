/**
 * Links into the canvas and the add flow (Step 19.2), in one place so the
 * query parameters each end reads are named once.
 */

/** The canvas opened on one person's spotlight (`FamilyTree` reads `person`). */
export function treeFocusHref(personId: string | null | undefined): string {
  return personId ? `/tree?person=${encodeURIComponent(personId)}` : "/tree";
}

/** The add flow, with `relatedTo` preselected as the person to connect to. */
export function addRelativeHref(relatedTo: string | null | undefined): string {
  return relatedTo
    ? `/people/new?relatedTo=${encodeURIComponent(relatedTo)}`
    : "/people/new";
}

/**
 * `relatedTo` as `/people/new` should use it: one id that is on the tree, or
 * nothing. Anything else — missing, repeated, or someone not on the tree — is
 * ignored rather than refused, so a stale link still opens the plain flow.
 */
export function validRelatedTo(
  raw: string | string[] | undefined,
  memberIds: Iterable<string>,
): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  for (const id of memberIds) if (id === raw) return raw;
  return null;
}
