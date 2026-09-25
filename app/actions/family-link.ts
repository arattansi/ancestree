"use server";

import { FAMILY_LINK_MAX_USES, parseFamilyLinkCap } from "@/lib/family-link";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { rootOf } from "@/lib/tree-context";

export type FamilyLinkResult = { error?: string };

const CAP_ERROR = `Pick a number from 1 to ${FAMILY_LINK_MAX_USES}.`;

/**
 * Root: make the tree's family link, or rotate it (Step 52). Either way it's
 * a fresh link with a fresh count and the cap given, and the old one stops
 * working at once. `rotate_family_link` checks the Root again.
 */
export async function rotateFamilyLink(
  treeId: string,
  cap: number,
): Promise<FamilyLinkResult> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };
  const maxUses = parseFamilyLinkCap(cap);
  if (maxUses === null) return { error: CAP_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.rpc("rotate_family_link", {
    p_tree: treeId,
    p_max_uses: maxUses,
  });
  if (error) return { error: "Could not make a new family link. Try again." };

  revalidateTreeAndAccount();
  return {};
}

/** Root: change how many may join through the current link, keeping it. */
export async function setFamilyLinkCap(
  treeId: string,
  cap: number,
): Promise<FamilyLinkResult> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };
  const maxUses = parseFamilyLinkCap(cap);
  if (maxUses === null) return { error: CAP_ERROR };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_family_link_cap", {
    p_tree: treeId,
    p_max_uses: maxUses,
  });
  if (error) {
    return {
      error: error.message.includes("NO_FAMILY_LINK")
        ? "This tree has no family link now. Reload the page."
        : "Could not change the cap. Try again.",
    };
  }

  revalidateTreeAndAccount();
  return {};
}

/**
 * Root: turn the family link off. It stops working at once; who joined
 * through it stays on record, and making one again gives a fresh link.
 */
export async function turnOffFamilyLink(treeId: string): Promise<FamilyLinkResult> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };

  // RLS (`invites_delete`) holds it to a Root of the tree.
  const supabase = await createClient();
  const { error } = await supabase
    .from("invites")
    .delete()
    .eq("tree_id", treeId)
    .not("max_uses", "is", null);
  if (error) return { error: "Could not turn the family link off. Try again." };

  revalidateTreeAndAccount();
  return {};
}
