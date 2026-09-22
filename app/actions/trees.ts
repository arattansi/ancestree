"use server";

import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import {
  clearCurrentTreeCookie,
  setCurrentTreeCookie,
} from "@/lib/current-tree.server";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { redeemInvite } from "@/lib/sign-in.server";
import { membershipOf, rootOf } from "@/lib/tree-context";
import { onboardingHref, treeHref, treesHref } from "@/lib/tree-links";

const MAX_TREE_NAME = 80;

function friendlyTreeError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("one_tree_each")) {
    return "You've already started a tree of your own. You can be a Root of several trees, but found only one.";
  }
  if (m.includes("name your tree")) return "Give your tree a name.";
  if (m.includes("only a root")) return "Only a Root of this tree can do that.";
  return "Couldn't do that. Try again.";
}

export type FoundTreeResult = { slug?: string; error?: string };

/**
 * A member starts a tree of their own (Step 25, the married-in path): a
 * fresh tree with them as its Root. Nothing is copied; they then bring the
 * people they choose over from the trees they belong to (`placePeople`).
 */
export async function foundTree(name: string): Promise<FoundTreeResult> {
  await requireProfile();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your tree a name." };
  if (trimmed.length > MAX_TREE_NAME) return { error: "That name is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("found_tree", { p_name: trimmed });
  if (error || !data) return { error: friendlyTreeError(error?.message) };

  // Their new tree is the one they're looking at from here on.
  await setCurrentTreeCookie(data.id);
  revalidateTreeAndAccount();
  return { slug: data.slug };
}

/** Root: rename a tree. Its URL slug follows the name. */
export async function renameTree(
  treeId: string,
  name: string,
): Promise<{ slug?: string; error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give your tree a name." };
  if (trimmed.length > MAX_TREE_NAME) return { error: "That name is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rename_tree", {
    p_tree: treeId,
    p_name: trimmed,
  });
  if (error || !data) return { error: friendlyTreeError(error?.message) };
  revalidateTreeAndAccount();
  return { slug: data.slug };
}

export type PlacementOutcome = { personId: string; status: string };

/**
 * Root: bring people onto a tree (Step 25). Anyone the Root can see on a tree
 * they belong to. Another member's own entry waits for that member to accept
 * (`placement_requested`); everyone else is shown at once.
 */
export async function placePeople(
  treeId: string,
  personIds: string[],
): Promise<{ placed?: PlacementOutcome[]; error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };
  const ids = [...new Set(personIds)].filter(Boolean);
  if (ids.length === 0) return { error: "Pick at least one person." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_people", {
    p_tree: treeId,
    p_person_ids: ids,
  });
  if (error) {
    if (error.message.toLowerCase().includes("only bring people you can see")) {
      return { error: "You can only bring people you can see on a tree you belong to." };
    }
    return { error: friendlyTreeError(error.message) };
  }
  revalidateTreeAndAccount();
  return {
    placed: (data ?? []).map((r) => ({
      personId: r.placed_person_id ?? "",
      status: r.placement_status ?? "",
    })),
  };
}

/** The person a placement waits on accepts or declines it. */
export async function respondToPlacement(
  placementId: string,
  accept: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_placement", {
    p_placement_id: placementId,
    p_accept: accept,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already answered")) return { error: "That request was already answered." };
    if (m.includes("no longer exists")) return { error: "That request no longer exists." };
    if (m.includes("only the person")) return { error: "Only the person this entry belongs to can answer." };
    return { error: friendlyTreeError(error.message) };
  }
  revalidateTreeAndAccount();
  return {};
}

/**
 * Take a person off a tree that isn't their home: a Root of that tree, or
 * the person themselves. Their entry and its connections are untouched.
 */
export async function removePlacement(
  treeId: string,
  personId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tree_placements")
    .delete()
    .eq("tree_id", treeId)
    .eq("person_id", personId)
    .select("id");
  if (error) {
    if (error.message.includes("HOME_PLACEMENT")) {
      return { error: "This is the entry's home tree. Move its home first, or delete the entry." };
    }
    return { error: friendlyTreeError(error.message) };
  }
  if (!data || data.length === 0) {
    return { error: "Only a Root of this tree, or the person themselves, can remove them from it." };
  }
  revalidateTreeAndAccount();
  return {};
}

/**
 * Move a person's home to another tree that already shows them: the person
 * themselves, or a Root of the current home for an unclaimed entry.
 */
export async function setHomeTree(
  personId: string,
  treeId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_home_tree", {
    p_person: personId,
    p_tree: treeId,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("must already show")) {
      return { error: "That tree doesn't show this entry yet. A Root there has to bring it over first." };
    }
    if (m.includes("only this person")) {
      return { error: "Only this person, or a Root of their home tree for an unclaimed entry, can move their home." };
    }
    return { error: friendlyTreeError(error.message) };
  }
  revalidateTreeAndAccount();
  return {};
}

/** Hide (or show) an entry to visitors from other trees (Step 25.4). */
export async function setHiddenFromVisitors(
  personId: string,
  hidden: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({ hidden_from_visitors: hidden })
    .eq("id", personId)
    .select("id");
  if (error) return { error: friendlyTreeError(error.message) };
  if (!data || data.length === 0) {
    return { error: "Only this person, or whoever can edit their entry, can change that." };
  }
  revalidateTreeAndAccount();
  return {};
}

/**
 * Root: open this tree to the members of another tree they belong to, or
 * close it again (Step 25.4). Only a Root may; only for trees they are on.
 */
export async function setTreeVisibility(
  treeId: string,
  viewerTreeId: string,
  visible: boolean,
): Promise<{ error?: string }> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };
  const { error: notThere } = await membershipOf(viewerTreeId);
  if (notThere) return { error: "You can only open your tree to a tree you belong to." };

  const supabase = await createClient();
  if (visible) {
    const { error } = await supabase.from("tree_visibility").upsert(
      {
        tree_id: treeId,
        viewer_tree_id: viewerTreeId,
        granted_by: membership.profile.auth_user_id,
      },
      { onConflict: "tree_id,viewer_tree_id" },
    );
    if (error) return { error: friendlyTreeError(error.message) };
  } else {
    const { error } = await supabase
      .from("tree_visibility")
      .delete()
      .eq("tree_id", treeId)
      .eq("viewer_tree_id", viewerTreeId);
    if (error) return { error: friendlyTreeError(error.message) };
  }
  revalidateTreeAndAccount();
  return {};
}

/**
 * A signed-in member accepts an invite to another tree (Step 25). Lands on
 * that tree's canvas if their own entry is already shown there, else on its
 * onboarding.
 */
export async function joinTreeWithInvite(token: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const joined = await redeemInvite(supabase, token);
  if (!joined) return { error: "That invite is invalid, used up, or expired." };
  revalidateTreeAndAccount();
  redirect(joined.selfPersonId ? treeHref() : onboardingHref());
}

export type PersonTreeLink = {
  id: string;
  name: string;
  slug: string;
  /** The caller isn't a member: the tree's Root opened it to one of theirs. */
  visitor: boolean;
};

/**
 * The trees a person is shown on that the caller may open (Step 25): as a
 * member, or as a visitor where the tree has been opened to one of theirs.
 * RLS on `trees` is what decides; a tree the caller can't see isn't listed.
 */
export async function listPersonTrees(personId: string): Promise<PersonTreeLink[]> {
  await requireProfile();
  const supabase = await createClient();
  const [{ data: placements }, { data: mine }] = await Promise.all([
    supabase
      .from("tree_placements")
      .select("tree_id, trees(id, name, slug)")
      .eq("person_id", personId)
      .eq("status", "active"),
    supabase.from("my_trees").select("id"),
  ]);
  const member = new Set((mine ?? []).map((t) => t.id));
  return (placements ?? []).flatMap((p) => {
    const t = Array.isArray(p.trees) ? p.trees[0] : p.trees;
    if (!t?.id || !t.name || !t.slug) return [];
    return [{ id: t.id, name: t.name, slug: t.slug, visitor: !member.has(t.id) }];
  });
}

/**
 * Root: delete a tree they run. Entries whose home it was move to another
 * tree that shows them; the rest go with it (`delete_tree`).
 */
export async function deleteTree(treeId: string): Promise<{ error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_tree", { p_tree: treeId });
  if (error) return { error: friendlyTreeError(error.message) };
  await clearCurrentTreeCookie();
  revalidateTreeAndAccount();
  redirect(treesHref());
}
