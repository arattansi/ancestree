/**
 * Accounts and trees a beta reviewer finds on the admin page's manage tab
 * (Step 103.4), to suspend, restore or delete: what `find_accounts` and
 * `find_trees` answer, read into shapes the cards draw.
 */

import { accountTypeOf } from "@/lib/account-types";

/** Longest search the finders are given. */
export const ADMIN_SEARCH_MAX = 100;

/** A tree an account is on, and whether it's that tree's only Root. */
export type FoundAccountTree = {
  id: string;
  name: string;
  /** "Root", "Branch" or "Leaf". */
  type: string;
  /**
   * Who could take over where the account is the only Root: the tree's
   * other members, by name. `null` where it isn't.
   */
  successors: { userId: string; name: string }[] | null;
};

export type FoundAccount = {
  userId: string;
  email: string | null;
  /** Their profile's name; `null` before they've joined a tree. */
  name: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  suspended: boolean;
  /** A beta reviewer's own: left alone here. */
  reviewer: boolean;
  trees: FoundAccountTree[];
};

export type FoundTree = {
  id: string;
  name: string;
  createdAt: string;
  members: number;
  /** Entries whose home it is. */
  entries: number;
  roots: string[];
};

/** A search box's `?account=` / `?tree=`: trimmed, capped, or `null`. */
export function readAdminSearch(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.trim().slice(0, ADMIN_SEARCH_MAX);
  return q ? q : null;
}

type AccountRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  suspended: boolean | null;
  reviewer: boolean | null;
  trees: unknown;
};

/** One `find_accounts` row, its trees' JSON read defensively. */
export function readFoundAccount(row: AccountRow): FoundAccount {
  const trees = Array.isArray(row.trees) ? row.trees : [];
  return {
    userId: row.user_id,
    email: row.email,
    name: row.display_name,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
    suspended: row.suspended === true,
    reviewer: row.reviewer === true,
    trees: trees.flatMap((t): FoundAccountTree[] => {
      if (!t || typeof t !== "object") return [];
      const { id, name, role, successors } = t as Record<string, unknown>;
      if (typeof id !== "string") return [];
      return [
        {
          id,
          name: typeof name === "string" ? name : "",
          type: accountTypeOf(typeof role === "string" ? role : null).name,
          successors: Array.isArray(successors)
            ? successors.flatMap((s) => {
                if (!s || typeof s !== "object") return [];
                const o = s as Record<string, unknown>;
                if (typeof o.user_id !== "string") return [];
                const named = typeof o.name === "string" && o.name ? o.name : "Unnamed member";
                const type = accountTypeOf(typeof o.role === "string" ? o.role : null).name;
                return [{ userId: o.user_id, name: `${named} (${type})` }];
              })
            : null,
        },
      ];
    }),
  };
}

/** The trees where the account is the only Root, which need a successor. */
export function soleRootTreesOf(account: FoundAccount) {
  return account.trees.flatMap((t) =>
    t.successors
      ? [{ treeId: t.id, treeName: t.name, successors: t.successors }]
      : [],
  );
}

/** "Oak (Root) · Ash (Leaf)", or `null` on none. */
export function accountTreesLine(account: FoundAccount): string | null {
  if (account.trees.length === 0) return null;
  return account.trees.map((t) => `${t.name} (${t.type})`).join(" · ");
}

/** "3 members · 41 entries". */
export function treeCountsLine(tree: FoundTree): string {
  const members = `${tree.members} ${tree.members === 1 ? "member" : "members"}`;
  const entries = `${tree.entries} ${tree.entries === 1 ? "entry" : "entries"}`;
  return `${members} · ${entries}`;
}
