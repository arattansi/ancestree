/**
 * What a Root is told when someone joins their tree (Step 171, audit R10),
 * and the Branch it offers: account types are explained when they matter,
 * once someone is there to make one, not before anyone has joined.
 *
 * `redeem_invite` sends each Root one notice a join: `placed_on_join` when
 * the joiner brings their own entry from another tree, `joined_by_link` for
 * the family link, and `member_joined` for everyone else ("Nadia joined The
 * Haddad Family."). All three offer making the joiner a Branch while they
 * are still a Leaf there, within the four each Root may make (Step 39).
 */

import {
  BRANCH,
  LEAF,
  ROOT,
  whyUnavailable,
} from "@/lib/account-types";

/** The notices a join sends each Root of the tree. */
export const JOIN_NOTICE_TYPES: ReadonlySet<string> = new Set([
  "member_joined",
  "joined_by_link",
  "placed_on_join",
]);

/** What a Branch is, in one line, beside the offer. */
export const BRANCH_IN_A_LINE =
  "A Branch can edit their side of the family, not just what they add.";

/**
 * How the button names them: "her" or "him" from their own entry's sex,
 * otherwise their first name — never a guess. "them" when there's no name
 * either.
 */
export function objectWord(sex: string | null | undefined, firstName: string | null): string {
  if (sex === "female") return "her";
  if (sex === "male") return "him";
  return firstName?.trim() || "them";
}

/** The name they go by, off their entry, else their account's first word. */
export function joinerFirstName(
  entry: { first_name: string | null; preferred_name: string | null } | null,
  displayName: string | null,
): string | null {
  const fromEntry = entry?.preferred_name?.trim() || entry?.first_name?.trim();
  if (fromEntry) return fromEntry;
  return displayName?.trim().split(/\s+/)[0] || null;
}

export type BranchOffer = {
  /** The joiner's account, to make a Branch. */
  userId: string;
  /** What's said once they are one: "Nadia is a Branch now." */
  done: string;
  /** The button's words, lower-case but for a name: "make her a branch". */
  label: string;
  /** Why the viewing Root can't now ("You’ve made your four Branches"), or `null`. */
  unavailable: string | null;
};

/**
 * The Branch a join notice offers, or `null` when it offers none: not a
 * join notice, the viewer isn't a Root of the tree, or the joiner is no
 * longer a Leaf there (made a Branch or a Root since, or gone).
 */
export function branchOffer(input: {
  type: string;
  joinerId: string | null;
  /** Their account type on the notice's tree now; `null` if they've left. */
  joinerRole: string | null;
  viewerIsRoot: boolean;
  /** Roots on the tree, and the Branches the viewer has made there. */
  roots: number;
  branchesMade: number;
  firstName: string | null;
  sex: string | null;
}): BranchOffer | null {
  if (!JOIN_NOTICE_TYPES.has(input.type)) return null;
  if (!input.joinerId || !input.viewerIsRoot) return null;
  if (input.joinerRole !== LEAF.key) return null;
  const name = input.firstName?.trim();
  const why = whyUnavailable(BRANCH.key, LEAF.key, {
    roots: input.roots,
    branchesMade: input.branchesMade,
  });
  return {
    userId: input.joinerId,
    done: name ? `${name} is a Branch now.` : "They’re a Branch now.",
    label: `make ${objectWord(input.sex, input.firstName)} a branch`,
    unavailable: why ? `${why}.` : null,
  };
}

/** The member rows a notice's tree needs, as `member_directory` gives them. */
export type DirectoryRow = {
  tree_id: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  role: string | null;
  self_person_id: string | null;
  branch_granted_by: string | null;
};

/**
 * Where the viewer stands on each tree: whether they're a Root there, how
 * many Roots it has, and the Branches they've made — read off the tree's
 * members, as the Root console counts them.
 */
export function treeStanding(
  rows: readonly DirectoryRow[],
  viewerId: string,
): Map<string, { viewerIsRoot: boolean; roots: number; branchesMade: number }> {
  const out = new Map<string, { viewerIsRoot: boolean; roots: number; branchesMade: number }>();
  for (const m of rows) {
    if (!m.tree_id) continue;
    const t = out.get(m.tree_id) ?? { viewerIsRoot: false, roots: 0, branchesMade: 0 };
    if (m.role === ROOT.key) {
      t.roots += 1;
      if (m.auth_user_id === viewerId) t.viewerIsRoot = true;
    }
    if (m.role === BRANCH.key && m.branch_granted_by === viewerId) t.branchesMade += 1;
    out.set(m.tree_id, t);
  }
  return out;
}
