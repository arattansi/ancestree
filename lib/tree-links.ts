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

/**
 * My Family Tree (Step 92): everyone the member is related to, from every
 * tree of theirs, arranged around them. A view, not a tree, so it has an
 * address of its own and leaves the tree the browser remembers alone.
 */
export function myFamilyHref(): string {
  return "/family";
}

/**
 * Where a member lands (Step 92.5): My Family Tree, arranged around their
 * own entry, every visit. Before they have one there's nothing to arrange
 * it around, so the canvas, which asks them to add it.
 */
export function homeHref(selfPersonId: string | null | undefined): string {
  return selfPersonId ? myFamilyHref() : treeHref();
}

/**
 * Whether the header's tree switcher names My Family Tree: on its own page,
 * and on the home page until a tree has been chosen this visit — a member
 * with an entry of their own lands on My Family Tree, so that, not the tree
 * they happen to be Root of, is what the switcher defaults to there.
 */
export function switcherShowsMyFamily({
  pathname,
  hasOwnEntry,
  treeChosen,
}: {
  pathname: string;
  hasOwnEntry: boolean;
  treeChosen: boolean;
}): boolean {
  if (pathname === myFamilyHref()) return true;
  return pathname === "/" && hasOwnEntry && !treeChosen;
}

/** The canvas opened on one person's spotlight (`FamilyTree` reads `person`). */
export function treeFocusHref(personId: string | null | undefined): string {
  return personId ? `${treeHref()}?person=${enc(personId)}` : treeHref();
}

/** My Family Tree opened on one person's details (Step 92.3). */
export function myFamilyFocusHref(personId: string): string {
  return `${myFamilyHref()}?person=${enc(personId)}`;
}

/**
 * An entry's pages opened from My Family Tree (Step 92.3) say so with
 * `back=family`, and go back there rather than to the tree they switched
 * to on the way.
 */
const BACK = "back";
const FROM_FAMILY = "family";

/** Whether a page's `back` parameter says it was opened from the view. */
export function openedFromFamily(back: string | string[] | undefined): boolean {
  return back === FROM_FAMILY;
}

/** Where an entry's page goes back to: the canvas it was opened from. */
export function entryBackHref(personId: string, fromFamily: boolean): string {
  return fromFamily ? myFamilyFocusHref(personId) : treeFocusHref(personId);
}

function withBack(href: string, fromFamily: boolean | undefined): string {
  if (!fromFamily) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${BACK}=${FROM_FAMILY}`;
}

/**
 * The canvas opened on a person's sheet with one of their stories' comments
 * open (Step 88.4): `EntryStories` reads `story`.
 */
export function treeStoryHref(personId: string, storyId: string): string {
  return `${treeFocusHref(personId)}&story=${enc(storyId)}`;
}

/**
 * A story's comments from anywhere (Step 88.4): the link on its public
 * page. It finds the story's person on a tree of the member's that shows
 * them, and opens it there (`app/stories/[id]/route.ts`); signed out, they
 * sign in first and come back to it.
 */
export function storyHref(storyId: string): string {
  return `/stories/${enc(storyId)}`;
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

/** Edit one entry, from the tree being viewed (or from My Family Tree). */
export function editPersonHref(
  personId: string,
  { fromFamily }: { fromFamily?: boolean } = {},
): string {
  return withBack(`/people/${enc(personId)}/edit`, fromFamily);
}

/**
 * Suggest a change to an entry the viewer can't edit (Step 67); with
 * `from`, starting from a suggestion of theirs that was declined, to edit
 * and resend (Step 71).
 */
export function suggestChangeHref(
  personId: string,
  from?: string,
  { fromFamily }: { fromFamily?: boolean } = {},
): string {
  const base = `/people/${enc(personId)}/suggest`;
  return withBack(from ? `${base}?from=${enc(from)}` : base, fromFamily);
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
 * Where a member answers what's been asked of them (Step 80): their
 * account's settings, which open on Asked of You while anything waits. An
 * email's button; callers add the site's origin.
 */
export function asksHref(): string {
  return "/account?view=settings#asked-of-you";
}

/**
 * The weekly newsletter's page (Step 95): opened from the email's
 * Unsubscribe link with the member's own token, signed out, to turn it off
 * or back on. Callers add the site's origin.
 */
export function newsletterPageHref(token: string): string {
  return `/newsletter/${enc(token)}`;
}

/** What a mail app's one-click unsubscribe posts to (RFC 8058), for the
 *  newsletter's `List-Unsubscribe` header. */
export function newsletterOneClickHref(token: string): string {
  return `/api/newsletter/${enc(token)}`;
}

/** Settings, at the newsletter's box. */
export function newsletterSettingsHref(): string {
  return "/account?view=settings#newsletter";
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
