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

/**
 * The welcome on a tree (Step 50). Someone whose entry a relative made, and
 * who has just made it theirs, is asked for a photo and what's missing;
 * `returning` is a member who brought their own entry, and is only greeted.
 */
export function welcomeHref({
  returning = false,
}: { returning?: boolean } = {}): string {
  return returning ? "/welcome?returning=1" : "/welcome";
}

/**
 * Where accepting an invite lands (Step 30.2): their own entry when the tree
 * they joined shows it — a claim invite claims its entry as it's accepted,
 * and a member's own entry comes with them (Steps 30.9 and 41.3) — else that
 * tree's onboarding, to find or add themselves. A claim invite goes by the
 * welcome first (Step 50): with its entry theirs now, to fill it in; with
 * their own entry brought onto a tree they weren't on, to be greeted there.
 */
export function joinedTreeHref(joined: {
  selfPersonId: string | null;
  selfPlaced: boolean;
  /** The invite named an entry to claim. */
  claimInvite?: boolean;
  /** They had an entry of their own before accepting. */
  hadEntry?: boolean;
  /** They were on the invite's tree before accepting. */
  wasMember?: boolean;
}): string {
  if (!joined.selfPersonId || !joined.selfPlaced) return onboardingHref();
  if (joined.claimInvite && !joined.hadEntry) return welcomeHref();
  if (joined.claimInvite && !joined.wasMember) {
    return welcomeHref({ returning: true });
  }
  return treeFocusHref(joined.selfPersonId);
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
