import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  accountTypeOf,
  isAccountTypeKey,
  type AccountType,
  type AccountTypeKey,
} from "@/lib/account-types";
import {
  getProfile,
  getSessionUser,
  requireProfile,
  type Profile,
} from "@/lib/auth";
import { readCurrentTreeId } from "@/lib/current-tree.server";
import { isPlacedOn } from "@/lib/placements.server";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { onboardingHref, treeHref, treesHref } from "@/lib/tree-links";

export type Tree = Pick<
  Tables<"trees">,
  "id" | "name" | "slug" | "created_by" | "created_at"
>;

/**
 * Who the signed-in member is on one tree (Step 25): their profile, the tree,
 * and their account type *there*. Every tree-scoped page and action starts
 * from one of these, so a Root of one tree is nobody in particular on another.
 */
export type TreeMembership = {
  tree: Tree;
  profile: Profile;
  role: AccountTypeKey;
  type: AccountType;
  isRoot: boolean;
};

const TREE_COLUMNS = "id, name, slug, created_by, created_at";

/** A tree by id, if the caller may see it. */
export const getTreeById = cache(
  async (treeId: string): Promise<Tree | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("trees")
      .select(TREE_COLUMNS)
      .eq("id", treeId)
      .maybeSingle();
    return data ?? null;
  },
);

/**
 * The caller's account type on a tree, or `null` when they are not on it.
 * Read off their own list of trees (`listMyTrees`, once per request), which
 * holds the same membership row.
 */
export const getRoleIn = cache(
  async (treeId: string): Promise<AccountTypeKey | null> =>
    (await listMyTrees()).find((t) => t.id === treeId)?.role ?? null,
);

function membership(
  tree: Tree,
  profile: Profile,
  role: AccountTypeKey,
): TreeMembership {
  const type = accountTypeOf(role);
  return { tree, profile, role, type, isRoot: type.runsTree };
}

/**
 * A member looking at a tree they don't belong to, because one of its Roots
 * opened it to a tree they do belong to (Step 25.4). Read-only; hidden
 * entries are a blur to them.
 */
export type TreeVisit = {
  tree: Tree;
  profile: Profile;
};

export type TreeAccess =
  | { kind: "member"; membership: TreeMembership }
  | { kind: "visitor"; visit: TreeVisit };

/**
 * The tree the member is looking at: the one their browser last chose, if
 * they can still see it — as a member, or as a visitor — else their home
 * tree, else the first they joined. `null` for a member of no tree. Every
 * tree page starts here, so "/tree" always means the same tree as the
 * header says.
 */
export const currentAccess = cache(async (): Promise<TreeAccess | null> => {
  // Who they are and which trees are theirs need only the session, so they
  // are read together (Step 77.1); a tree of theirs needs nothing more.
  const [profile, trees, chosen] = await Promise.all([
    getProfile(),
    listMyTrees(),
    readCurrentTreeId(),
  ]);
  if (!profile) return null;

  if (chosen) {
    const mine = trees.find((t) => t.id === chosen);
    if (mine) {
      return {
        kind: "member",
        membership: membership(treeOf(mine), profile, mine.role),
      };
    }
    // Not theirs: RLS on `trees` only returns a row to a visitor.
    const tree = await getTreeById(chosen);
    if (tree) return { kind: "visitor", visit: { tree, profile } };
  }

  const home = await defaultTree(profile);
  if (!home) return null;
  return {
    kind: "member",
    membership: membership(treeOf(home), profile, home.role),
  };
});

/**
 * How the signed-in member may see the current tree. Signed-out visitors go
 * to `/join`; a member of no tree at all goes to their (empty) trees page.
 */
export async function requireTreeAccess(): Promise<TreeAccess> {
  // Asked together: the tree needs only the session too (Step 77.1).
  const [profile, access] = await Promise.all([getProfile(), currentAccess()]);
  if (!profile) {
    const user = await getSessionUser();
    redirect(user ? "/join?status=pending" : "/join");
  }
  if (!access) redirect(treesHref());
  return access;
}

/**
 * The membership behind a page that only a member of the tree may use. A
 * visitor is sent back to the canvas, which they may see.
 */
export async function requireTreeMember(): Promise<TreeMembership> {
  const access = await requireTreeAccess();
  if (access.kind !== "member") redirect(treeHref());
  return access.membership;
}

/**
 * Reference data shared by every tree (nicknames, new places) is curated by
 * any Root. Mirrors `private.is_any_root`.
 */
export async function requireAnyRoot(): Promise<Profile> {
  const [profile, trees] = await Promise.all([requireProfile(), listMyTrees()]);
  if (!trees.some((t) => t.type.runsTree)) redirect(treesHref());
  return profile;
}

/**
 * A member who has their own entry, and has it on this tree, with the
 * page's own reads: anyone without one is sent to this tree's onboarding.
 * The reads start beside the check rather than after it (Step 77.1): `load`
 * runs at once, and whether their entry is on this tree is decided once both
 * have settled, so its redirect still comes before anything `load` found.
 * RLS bounds what `load` can read either way.
 */
export async function requireTreeSelfPersonWith<T>(
  load: (m: TreeMembership & { selfPersonId: string }) => Promise<T>,
): Promise<{ membership: TreeMembership; data: T }> {
  const m = await requireTreeMember();
  const selfPersonId = m.profile.self_person_id;
  if (!selfPersonId) redirect(onboardingHref());
  const [placed, data] = await Promise.allSettled([
    isPlacedOn(m.tree.id, selfPersonId),
    load({ ...m, selfPersonId }),
  ]);
  if (placed.status === "rejected") throw placed.reason;
  if (!placed.value) redirect(onboardingHref());
  if (data.status === "rejected") throw data.reason;
  return { membership: m, data: data.value };
}

/**
 * What an action's check of who's asking answers (Step 77.4, audit R5): the
 * membership, or why not, and never neither — so `if (!membership) return
 * { error }` can't hand back `{ error: undefined }`, which reads as success.
 */
export type MembershipCheck =
  | { membership: TreeMembership; error?: undefined }
  | { membership?: undefined; error: string };

/**
 * For server actions: the caller's membership on a tree by id, or an error
 * message. Never redirects — an action reports, the page decides.
 */
export async function membershipOf(treeId: string): Promise<MembershipCheck> {
  // Their profile and their trees in one wave (Step 77.1): a membership row
  // carries the tree it's on.
  const [profile, trees] = await Promise.all([getProfile(), listMyTrees()]);
  if (!profile) return { error: "You are not signed in." };
  const mine = trees.find((t) => t.id === treeId);
  if (mine) return { membership: membership(treeOf(mine), profile, mine.role) };
  // Not theirs: whether it's gone or only not theirs decides what's said.
  return {
    error: (await getTreeById(treeId))
      ? "You are not a member of that tree."
      : "That tree no longer exists.",
  };
}

/** For server actions that only a Root of the tree may run. */
export async function rootOf(treeId: string): Promise<MembershipCheck> {
  const result = await membershipOf(treeId);
  if (result.membership && !result.membership.isRoot) {
    return { error: "Only a Root of this tree can do that." };
  }
  return result;
}

export type MyTree = {
  id: string;
  name: string;
  slug: string;
  role: AccountTypeKey;
  type: AccountType;
  /** True when the caller founded it. */
  founded: boolean;
  memberCount: number;
  personCount: number;
  joinedAt: string;
  /** The tree row's own columns, so a membership needs no second read. */
  createdBy: string | null;
  createdAt: string;
};

/** The tree a membership row is on. */
function treeOf(t: MyTree): Tree {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    created_by: t.createdBy,
    created_at: t.createdAt,
  };
}

/** Every tree the caller belongs to, with their account type in each. */
export const listMyTrees = cache(async (): Promise<MyTree[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("my_trees")
    .select("*")
    .order("joined_at", { ascending: true });
  return (data ?? []).flatMap((t) => {
    if (!t.id || !t.name || !t.slug || !t.created_at || !isAccountTypeKey(t.role)) {
      return [];
    }
    return [
      {
        id: t.id,
        name: t.name,
        slug: t.slug,
        role: t.role,
        type: accountTypeOf(t.role),
        founded: t.created_by === user.id,
        memberCount: Number(t.member_count ?? 0),
        personCount: Number(t.person_count ?? 0),
        joinedAt: t.joined_at ?? "",
        createdBy: t.created_by,
        createdAt: t.created_at,
      },
    ];
  });
});

/**
 * The tree "/tree" lands on when none has been chosen: the tree the member's
 * own entry calls home when they belong to it, else the first tree they
 * joined. `null` for a member of no tree at all.
 */
export const defaultTree = cache(
  async (profile: Profile | null): Promise<MyTree | null> => {
    const trees = await listMyTrees();
    if (trees.length === 0) return null;
    if (profile?.self_person_id) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("people")
        .select("tree_id")
        .eq("id", profile.self_person_id)
        .maybeSingle();
      const home = trees.find((t) => t.id === data?.tree_id);
      if (home) return home;
    }
    return trees[0];
  },
);
