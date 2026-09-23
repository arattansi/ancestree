/**
 * Account types (Step 18, three since Step 34): what a member's role on a
 * tree is called, and what it lets them reach.
 *
 * Three, named for the tree they grow, from the ground up:
 *
 *   Root    admin          the whole tree, and running it
 *   Branch  branch_admin   their part of the side of the Root they're related to
 *   Leaf    member         their own line to grow, what they add, their own entry
 *
 * The stored keys predate the names and stay as they are. `member` was
 * Canopy's until Step 34 retired the first Leaf (`leaf`, their own entry and
 * nothing more) and gave its name to Canopy. This module is the only place
 * that turns one into the other, so a name can change, or be sold as a plan,
 * without a migration. Each type is described by how far its rights reach
 * rather than by a list of screens, which is what a plan would sell.
 *
 * The database enforces these rules (`private.can_edit_person`,
 * `can_edit_relationship`, `can_edit_pet`, and the own-line check in
 * `add_people_with_connections`). This module describes them so the UI knows
 * what to offer, and `lib/branch.ts` reads it to mirror them per entry.
 */

export const ACCOUNT_TYPE_KEYS = ["admin", "branch_admin", "member"] as const;

export type AccountTypeKey = (typeof ACCOUNT_TYPE_KEYS)[number];

/**
 * How far a right reaches, widest first. Each includes the ones after it: a
 * Branch that edits its side of the family also edits what it added itself.
 *
 * - `tree`   everything on the tree
 * - `branch` the part of a Root's side they are related through (`lib/branch.ts#branchReach`)
 * - `own`    what they added, and their own entry
 */
export type Reach = "tree" | "branch" | "own";

export type AccountType = {
  /** What `tree_members.role` stores. */
  key: AccountTypeKey;
  name: "Root" | "Branch" | "Leaf";
  /** One line under the name. */
  tagline: string;
  /** Who it's for and what it can do, for whoever is choosing one. */
  description: string;
  /** Whose entries they can edit. */
  entries: Reach;
  /** Whose connections they can change or remove. Anyone may draw a new one,
   *  and answer the tree's "are these two connected?" prompts. */
  connections: Reach;
  /** Whose companions (pets) they can edit. Anyone may add one to an entry
   *  they can edit. */
  companions: Reach;
  /**
   * Where they can add new relatives (Step 34): `tree`, anywhere they connect
   * to it — a member who married in is still held to the bloodline gate — or
   * `line`, only on their own line (`lib/branch.ts#lineIds`): their ancestors,
   * everyone descended from them, and the people those relatives married.
   */
  addRelatives: "tree" | "line";
  /**
   * Whose unclaimed entries they can invite someone to claim — the entries
   * they can edit (`lib/branch.ts#canInviteToClaim`). Whoever accepts joins
   * as a Leaf.
   */
  claimInvites: Reach;
  /**
   * Which entries they can delete (Step 22.3): `tree` for a Root; `own` —
   * unclaimed entries they created, while nobody else has built on them
   * (`private.can_delete_person`).
   */
  deletes: "tree" | "own";
  /** The admin console: members and their account types, invites, share
   *  links, deleting entries, lineage, verification, auto-arrange. */
  runsTree: boolean;
};

export const ROOT: AccountType = {
  key: "admin",
  name: "Root",
  tagline: "Holds the whole tree",
  description:
    "The tree’s founders. A Root can edit every entry and connection, and runs the tree: members and their account types, invites, share links, and removing entries. A Root is told when a Branch changes an entry they added, and can undo it. A Root can make a Leaf a Branch, or make another member a Root; nobody can undo that.",
  entries: "tree",
  connections: "tree",
  companions: "tree",
  addRelatives: "tree",
  claimInvites: "tree",
  deletes: "tree",
  runsTree: true,
};

export const BRANCH: AccountType = {
  key: "branch_admin",
  name: "Branch",
  tagline: "Tends their part of a Root’s side",
  description:
    "A Branch looks after the part of a Root’s side of the family they’re related through: their own ancestors on that side, everyone descended from them, and the people those relatives married — so a Root’s father’s family, say, but not their mother’s, when that is how the Branch is related. They can edit any entry and connection there, except another member’s own entry. A Root is told when they change an entry that Root added, and can undo it. They bring relatives in as Leaves, can invite someone to claim an unclaimed entry on that side, and can delete an entry they added while nobody else has built on it.",
  entries: "branch",
  connections: "branch",
  companions: "branch",
  addRelatives: "tree",
  claimInvites: "branch",
  deletes: "own",
  runsTree: false,
};

export const LEAF: AccountType = {
  key: "member",
  name: "Leaf",
  tagline: "Grows their own line",
  description:
    "Where most of the family sits. A Leaf adds relatives on their own line — their parents and grandparents, everyone descended from them, and the people those relatives married — and edits the entries and connections they added, and their own entry. They bring relatives in as Leaves, can invite someone to claim an entry they added, and can delete one while nobody else has built on it. A Root can make them a Branch.",
  entries: "own",
  connections: "own",
  companions: "own",
  addRelatives: "line",
  claimInvites: "own",
  deletes: "own",
  runsTree: false,
};

/** Every account type, from the ground up. */
export const ACCOUNT_TYPES: readonly AccountType[] = [ROOT, BRANCH, LEAF];

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
 * What a Root can set from /admin, for anyone who isn't a Root yet: a Leaf
 * made a Branch, a Branch back to a Leaf. Making someone a Root is on offer
 * (Step 22.5) but is for good: a Root is never demoted or removed, by another
 * Root or themselves (`tree_members_guard`).
 */
export const ASSIGNABLE_ACCOUNT_TYPES: readonly AccountType[] = [
  ROOT,
  BRANCH,
  LEAF,
];

export function isAssignable(key: unknown): key is AccountTypeKey {
  return ASSIGNABLE_ACCOUNT_TYPES.some((t) => t.key === key);
}

/**
 * What an invite makes someone (Step 34): a Leaf, whoever sends it — Root,
 * Branch or Leaf (`private.can_invite_as`). Nothing wider comes in by link;
 * a Root makes a Branch or a Root afterwards.
 */
export const INVITED_AS: AccountType = LEAF;

/** One line of what an account type can do: yes, no, or how far. */
export type Access = {
  label: string;
  /** `true` / `false` for yes and no; a phrase when the answer is "some". */
  value: boolean | string;
};

const ENTRY_REACH: Record<Reach, string | true> = {
  tree: true,
  branch: "Their part of a Root’s side",
  own: "The ones they added",
};

const DOCUMENT_REACH: Record<Reach, string | true> = {
  tree: true,
  branch: "Their part of a Root’s side",
  own: "Entries they own",
};

const CLAIM_INVITE_REACH: Record<Reach, string | true> = {
  tree: true,
  branch: "On their part of a Root’s side",
  own: "The ones they added",
};

const CONNECTION_REACH: Record<Reach, string | true> = {
  tree: true,
  branch: "Within that side",
  own: "The ones they drew",
};

/**
 * What an account type can do, in the order a person would ask: can I see it,
 * can I change it, can I grow it, can I run it. "Every" is a plain yes; the
 * narrower reaches say how far.
 */
export function describeAccess(type: AccountType): Access[] {
  return [
    { label: "See the whole tree", value: true },
    { label: "Comment on and flag entries", value: true },
    { label: "Edit entries", value: ENTRY_REACH[type.entries] },
    // Documents follow the same reach as editing, except that a Branch also
    // sees members' own entries on their side (`private.can_see_documents`).
    { label: "See documents", value: DOCUMENT_REACH[type.entries] },
    { label: "Change connections", value: CONNECTION_REACH[type.connections] },
    {
      label: "Add relatives",
      value: type.addRelatives === "tree" ? true : "On their own line",
    },
    { label: "Add companions", value: true },
    { label: "Invite relatives", value: "As Leaves" },
    {
      label: "Invite someone to claim an entry",
      value: CLAIM_INVITE_REACH[type.claimInvites],
    },
    {
      label: "Delete entries",
      value:
        type.deletes === "tree"
          ? true
          : "Ones they added, until someone else builds on them",
    },
    { label: "Run the tree", value: type.runsTree },
  ];
}

/**
 * Whose side a Branch tends, as a phrase: "Raiya Suleman’s side", or "Aalim
 * Rattansi’s and Raiya Suleman’s sides" for a child of both. `null` when they
 * are related to no Root and so tend nothing.
 */
export function branchSideLabel(rootNames: readonly string[]): string | null {
  if (rootNames.length === 0) return null;
  const owners = rootNames.map((name) => `${name}’s`);
  const last = owners.pop();
  return owners.length === 0
    ? `${last} side`
    : `${owners.join(", ")} and ${last} sides`;
}

/** Why an entry is closed to the viewer, when it is. */
export const LOCKED_ENTRY_NOTE =
  "Only this entry’s owner, a Branch for this side of the family, or a Root can edit it.";

/**
 * What a new entry off a Leaf's own line is refused with. The database marks
 * that refusal `OWN_LINE` (`add_people_with_connections`), so actions can
 * tell it from other failures.
 */
export const OWN_LINE_REFUSAL =
  "As a Leaf, you add relatives on your own line: your parents and grandparents, everyone descended from them, and the people they married. Ask a Branch or a Root to add anyone else.";

export function isOwnLineRefusal(message: string | undefined): boolean {
  return (message ?? "").includes("OWN_LINE");
}
