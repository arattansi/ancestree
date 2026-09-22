import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import {
  accountTypeOf,
  isAccountTypeKey,
  type AccountType,
  type AccountTypeKey,
} from "@/lib/account-types";
import { getProfile, getUser, requireProfile, type Profile } from "@/lib/auth";
import { readCurrentTreeId } from "@/lib/current-tree.server";
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

/** The caller's account type on a tree, or `null` when they are not on it. */
export const getRoleIn = cache(
  async (treeId: string): Promise<AccountTypeKey | null> => {
    const user = await getUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("tree_members")
      .select("role")
      .eq("tree_id", treeId)
      .eq("user_id", user.id)
      .maybeSingle();
    return data && isAccountTypeKey(data.role) ? data.role : null;
  },
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
  /** The tree of theirs that this one was opened to. */
  viaTree: Tree | null;
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
  const profile = await getProfile();
  if (!profile) return null;
  const trees = await listMyTrees();
  const chosen = await readCurrentTreeId();

  if (chosen) {
    const mine = trees.find((t) => t.id === chosen);
    // RLS on `trees` only returns a row to a member or a visitor.
    const tree = await getTreeById(chosen);
    if (tree && mine) {
      return {
        kind: "member",
        membership: membership(tree, profile, mine.role),
      };
    }
    if (tree) {
      const supabase = await createClient();
      const { data: via } = await supabase
        .from("tree_visibility")
        .select(
          "viewer_tree_id, viewer:trees!tree_visibility_viewer_tree_id_fkey(id, name, slug, created_by, created_at)",
        )
        .eq("tree_id", tree.id)
        .limit(1)
        .maybeSingle();
      const viaRaw = Array.isArray(via?.viewer) ? via?.viewer[0] : via?.viewer;
      return {
        kind: "visitor",
        visit: { tree, profile, viaTree: viaRaw ?? null },
      };
    }
  }

  const home = await defaultTree(profile);
  if (!home) return null;
  const tree = await getTreeById(home.id);
  if (!tree) return null;
  return { kind: "member", membership: membership(tree, profile, home.role) };
});

/**
 * How the signed-in member may see the current tree. Signed-out visitors go
 * to `/join`; a member of no tree at all goes to their (empty) trees page.
 */
export async function requireTreeAccess(): Promise<TreeAccess> {
  const profile = await getProfile();
  if (!profile) {
    const user = await getUser();
    redirect(user ? "/join?status=pending" : "/join");
  }
  const access = await currentAccess();
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
  const profile = await requireProfile();
  const trees = await listMyTrees();
  if (!trees.some((t) => t.type.runsTree)) redirect(treesHref());
  return profile;
}

/** A page for Roots of the current tree only; others are sent to the canvas. */
export async function requireTreeRoot(): Promise<TreeMembership> {
  const m = await requireTreeMember();
  if (!m.isRoot) redirect(treeHref());
  return m;
}

/**
 * A member who has their own entry, and has it on this tree. Anyone without
 * one is sent to this tree's onboarding.
 */
export async function requireTreeSelfPerson(): Promise<TreeMembership> {
  const m = await requireTreeMember();
  if (!m.profile.self_person_id) redirect(onboardingHref());
  const supabase = await createClient();
  const { data } = await supabase
    .from("tree_placements")
    .select("id")
    .eq("tree_id", m.tree.id)
    .eq("person_id", m.profile.self_person_id)
    .eq("status", "active")
    .maybeSingle();
  if (!data) redirect(onboardingHref());
  return m;
}

/**
 * For server actions: the caller's membership on a tree by id, or an error
 * message. Never redirects — an action reports, the page decides.
 */
export async function membershipOf(
  treeId: string,
): Promise<{ membership?: TreeMembership; error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "You are not signed in." };
  const tree = await getTreeById(treeId);
  if (!tree) return { error: "That tree no longer exists." };
  const role = await getRoleIn(tree.id);
  if (!role) return { error: "You are not a member of that tree." };
  return { membership: membership(tree, profile, role) };
}

/** For server actions that only a Root of the tree may run. */
export async function rootOf(
  treeId: string,
): Promise<{ membership?: TreeMembership; error?: string }> {
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
};

/** Every tree the caller belongs to, with their account type in each. */
export const listMyTrees = cache(async (): Promise<MyTree[]> => {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("my_trees")
    .select("*")
    .order("joined_at", { ascending: true });
  return (data ?? []).flatMap((t) => {
    if (!t.id || !t.name || !t.slug || !isAccountTypeKey(t.role)) return [];
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
