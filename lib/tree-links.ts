/**
 * Links into the tree the member is looking at. Tree pages have plain
 * addresses — the tree itself is remembered per browser
 * (`lib/current-tree.server.ts`), so nothing here carries a tree. Query
 * parameters each end reads are named here too.
 */

const enc = encodeURIComponent;

/** The canvas. */
export function treeHref(): string {
  return "/tree";
}

/** The canvas opened on one person's spotlight (`FamilyTree` reads `person`). */
export function treeFocusHref(personId: string | null | undefined): string {
  return personId ? `${treeHref()}?person=${enc(personId)}` : treeHref();
}

/** Connections the tree implies but hasn't recorded. */
export function reviewHref(): string {
  return "/tree/review";
}

/**
 * The tree's admin console: the "Admin" view of the account page. `section`
 * is a card id on it.
 */
export function adminHref(section?: string): string {
  const base = "/account?view=admin";
  return section ? `${base}#${enc(section)}` : base;
}

/** The add flow, with `relatedTo` preselected as the person to connect to. */
export function addRelativeHref(relatedTo?: string | null): string {
  const base = "/people/new";
  return relatedTo ? `${base}?relatedTo=${enc(relatedTo)}` : base;
}

/** Edit one entry, from the tree being viewed. */
export function editPersonHref(personId: string): string {
  return `/people/${enc(personId)}/edit`;
}

/** First-run: find or add yourself on the tree being viewed. */
export function onboardingHref(): string {
  return "/onboarding";
}

/**
 * One step of a founder's first run (Step 29): `invite`, `you`, `name` or
 * `family` (`lib/first-tree.ts`).
 */
export function onboardingStepHref(step: string): string {
  return `${onboardingHref()}?step=${enc(step)}`;
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
