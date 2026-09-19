/**
 * Account types (Step 18): what a member's `profiles.role` is called, and
 * what it lets them reach.
 *
 * Four, named for the tree they grow, from the ground up:
 *
 *   Root    admin          the whole tree, and running it
 *   Branch  branch_admin   every entry on their own side of the family
 *   Canopy  member         what they add, and their own entry
 *   Leaf    leaf           their own entry; the rest is theirs to read
 *
 * The stored keys predate the names and stay as they are. This module is the
 * only place that turns one into the other, so a name can change, or be sold
 * as a plan, without a migration. Each type is described by how far its rights
 * reach rather than by a list of screens, which is what a plan would sell.
 *
 * The database enforces these rules (`private.can_edit_person`,
 * `can_edit_relationship`, `can_edit_pet`, and the Leaf guards on `people` and
 * `relationships`). This module describes them so the UI knows what to offer,
 * and `lib/branch.ts` reads it to mirror them per entry.
 */

export const ACCOUNT_TYPE_KEYS = [
  "admin",
  "branch_admin",
  "member",
  "leaf",
] as const;

export type AccountTypeKey = (typeof ACCOUNT_TYPE_KEYS)[number];

/**
 * How far a right reaches, widest first. Each includes the ones after it: a
 * Branch that edits its side of the family also edits what it added itself.
 *
 * - `tree`   everything on the tree
 * - `branch` their side of the family (`lib/branch.ts#branchIds`)
 * - `own`    what they added, and their own entry
 * - `self`   their own entry only
 * - `none`   nothing
 */
export type Reach = "tree" | "branch" | "own" | "self" | "none";

export type AccountType = {
  /** What `profiles.role` stores. */
  key: AccountTypeKey;
  name: "Root" | "Branch" | "Canopy" | "Leaf";
  /** One line under the name. */
  tagline: string;
  /** Who it's for and what it can do, for whoever is choosing one. */
  description: string;
  /** Whose entries they can edit. */
  entries: Reach;
  /** Whose connections they can draw, change or remove — and so whether they
   *  can answer the tree's "are these two connected?" prompts at all. */
  connections: Reach;
  /** Whose companions (pets) they can add and edit. */
  companions: Reach;
  /** Add new relatives to the tree. */
  addRelatives: boolean;
  /** The admin console: members and their account types, invites, share
   *  links, deleting entries, lineage, verification, auto-arrange. */
  runsTree: boolean;
};

export const ROOT: AccountType = {
  key: "admin",
  name: "Root",
  tagline: "Holds the whole tree",
  description:
    "The tree’s founders. A Root can edit every entry and connection, and runs the tree: members and their account types, invites, share links, and removing entries.",
  entries: "tree",
  connections: "tree",
  companions: "tree",
  addRelatives: true,
  runsTree: true,
};

export const BRANCH: AccountType = {
  key: "branch_admin",
  name: "Branch",
  tagline: "Tends one side of the family",
  description:
    "A Branch looks after the side of the family they belong to: their ancestors, everyone descended from them, and the people those relatives married. They can edit any entry and connection there, except another member’s own entry.",
  entries: "branch",
  connections: "branch",
  companions: "branch",
  addRelatives: true,
  runsTree: false,
};

export const CANOPY: AccountType = {
  key: "member",
  name: "Canopy",
  tagline: "Grows the tree",
  description:
    "Where most of the family sits. Canopy members add relatives, and edit the entries and connections they added themselves.",
  entries: "own",
  connections: "own",
  companions: "own",
  addRelatives: true,
  runsTree: false,
};

export const LEAF: AccountType = {
  key: "leaf",
  name: "Leaf",
  tagline: "Their own entry, and the view",
  description:
    "One person’s place on the tree. A Leaf keeps their own entry up to date (details, photo, documents) and can read, comment on and flag everything else.",
  entries: "self",
  connections: "none",
  companions: "none",
  addRelatives: false,
  runsTree: false,
};

/** Every account type, from the ground up. */
export const ACCOUNT_TYPES: readonly AccountType[] = [ROOT, BRANCH, CANOPY, LEAF];

const BY_KEY = new Map<string, AccountType>(
  ACCOUNT_TYPES.map((t) => [t.key, t]),
);

export function isAccountTypeKey(value: unknown): value is AccountTypeKey {
  return typeof value === "string" && BY_KEY.has(value);
}

/**
 * The account type a stored role names. Anything unrecognised reads as a Leaf,
 * the narrowest: the UI should never offer more than the database will allow.
 */
export function accountTypeOf(role: string | null | undefined): AccountType {
  return (role && BY_KEY.get(role)) || LEAF;
}

/**
 * What a Root can set from /admin. Making someone a Root, or changing another
 * Root, is a bigger decision than a dropdown and stays out of it.
 */
export const ASSIGNABLE_ACCOUNT_TYPES: readonly AccountType[] = [
  BRANCH,
  CANOPY,
  LEAF,
];

export function isAssignable(key: unknown): key is AccountTypeKey {
  return ASSIGNABLE_ACCOUNT_TYPES.some((t) => t.key === key);
}

/** One line of what an account type can do: yes, no, or how far. */
export type Access = {
  label: string;
  /** `true` / `false` for yes and no; a phrase when the answer is "some". */
  value: boolean | string;
};

const ENTRY_REACH: Record<Reach, string | false> = {
  tree: "Every entry",
  branch: "Their side of the family",
  own: "The ones they added",
  self: "Only their own",
  none: false,
};

const CONNECTION_REACH: Record<Reach, string | false> = {
  tree: "Any",
  branch: "Within their side",
  own: "The ones they drew",
  self: "Only their own",
  none: false,
};

function reach(table: Record<Reach, string | false>, r: Reach): boolean | string {
  // "Every" is a plain yes; the narrower reaches say how far.
  return r === "tree" ? true : table[r];
}

/**
 * What an account type can do, in the order a person would ask: can I see it,
 * can I change it, can I grow it, can I run it.
 */
export function describeAccess(type: AccountType): Access[] {
  return [
    { label: "See the whole tree", value: true },
    { label: "Comment on and flag entries", value: true },
    { label: "Edit entries", value: reach(ENTRY_REACH, type.entries) },
    {
      label: "Change connections",
      value: reach(CONNECTION_REACH, type.connections),
    },
    { label: "Add relatives", value: type.addRelatives },
    { label: "Add companions", value: type.companions !== "none" },
    {
      label: "Invite relatives",
      value: type.runsTree ? true : "If a Root allows it",
    },
    { label: "Run the tree", value: type.runsTree },
  ];
}

/** Why an entry is closed to the viewer, put in terms of their own account. */
export function lockedEntryNote(viewer: AccountType): string {
  return viewer.entries === "self"
    ? "As a Leaf, you edit only your own entry. Flag this one if something’s wrong."
    : "Only this entry’s owner, a Branch for this side of the family, or a Root can edit it.";
}

/**
 * What a write the Leaf guards refused says. The database marks those
 * refusals `LEAF_ACCOUNT` (`private.leaf_guard_people` /
 * `leaf_guard_relationships`), so actions can tell them from other failures.
 */
export const LEAF_REFUSAL =
  "A Leaf account changes only its own entry. Ask a Root if you need to add relatives or connections.";

export function isLeafRefusal(message: string | undefined): boolean {
  return (message ?? "").includes("LEAF_ACCOUNT");
}
