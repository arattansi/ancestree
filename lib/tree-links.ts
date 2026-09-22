/**
 * Links into a tree (Step 25): every tree-scoped page lives under
 * `/t/<slug>/…`, and these build the paths so the shape is written once.
 * Query parameters each end reads are named here too.
 */

const enc = encodeURIComponent;

/** The tree's base path. */
export function treeBase(slug: string): string {
  return `/t/${enc(slug)}`;
}

/** The canvas. */
export function treeHref(slug: string): string {
  return `${treeBase(slug)}/tree`;
}

/** The canvas opened on one person's spotlight (`FamilyTree` reads `person`). */
export function treeFocusHref(
  slug: string,
  personId: string | null | undefined,
): string {
  return personId ? `${treeHref(slug)}?person=${enc(personId)}` : treeHref(slug);
}

/** Connections the tree implies but hasn't recorded. */
export function reviewHref(slug: string): string {
  return `${treeBase(slug)}/tree/review`;
}

/** The tree's admin console; `section` is a card id on it. */
export function adminHref(slug: string, section?: string): string {
  return section
    ? `${treeBase(slug)}/admin#${enc(section)}`
    : `${treeBase(slug)}/admin`;
}

/** The add flow, with `relatedTo` preselected as the person to connect to. */
export function addRelativeHref(
  slug: string,
  relatedTo?: string | null,
): string {
  const base = `${treeBase(slug)}/people/new`;
  return relatedTo ? `${base}?relatedTo=${enc(relatedTo)}` : base;
}

/** Edit one entry, from this tree. */
export function editPersonHref(slug: string, personId: string): string {
  return `${treeBase(slug)}/people/${enc(personId)}/edit`;
}

/** First-run: find or add yourself on this tree. */
export function onboardingHref(slug: string): string {
  return `${treeBase(slug)}/onboarding`;
}

/** The member's trees, and starting one. */
export function treesHref(): string {
  return "/trees";
}

export function newTreeHref(): string {
  return "/trees/new";
}

/**
 * `relatedTo` as the add flow should use it: one id that is on the tree, or
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
