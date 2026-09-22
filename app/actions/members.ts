"use server";

import { revalidatePath } from "next/cache";

import { isAssignable, ROOT } from "@/lib/account-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { rootOf } from "@/lib/tree-context";

/**
 * Root: give a member an account type on one tree (Step 25). Making them a
 * Root is for good — nobody demotes or removes a Root (`tree_members_guard`).
 */
export async function setAccountType(
  treeId: string,
  userId: string,
  key: string,
): Promise<{ error?: string }> {
  const { error: notRoot } = await rootOf(treeId);
  if (notRoot) return { error: notRoot };

  if (!userId) return { error: "No member specified." };
  if (!isAssignable(key)) {
    return { error: "That isn't an account type a Root can give." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("tree_members")
    .select("role")
    .eq("tree_id", treeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) return { error: "That member isn't on this tree." };
  if (target.role === ROOT.key) {
    return { error: "A Root stays a Root. Their account type can't change." };
  }

  const { data, error } = await supabase.rpc("set_member_role", {
    p_tree: treeId,
    p_user: userId,
    p_role: key,
  });
  if (error || data !== key) {
    if (error?.message.includes("ROOT_IS_PERMANENT")) {
      return { error: "A Root stays a Root. Their account type can't change." };
    }
    return { error: "Couldn't change that account type. Try again." };
  }

  revalidateTreeAndAccount();
  return {};
}

/**
 * Root: remove a member from one tree.
 *
 * `remove_tree_member` hands what they created or own on this tree to the
 * acting Root (so RESTRICT foreign keys don't block it) and drops their
 * membership. If that was their last tree, their profile goes too and we
 * delete the auth user so they can't sign back in without a fresh invite.
 */
export async function deleteMember(
  treeId: string,
  userId: string,
): Promise<{ error?: string }> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };

  if (!userId) return { error: "No member specified." };
  if (userId === membership.profile.auth_user_id) {
    return { error: "You can't remove yourself." };
  }

  const supabase = await createClient();
  const { data: lastTree, error } = await supabase.rpc("remove_tree_member", {
    p_tree: treeId,
    p_user_id: userId,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("root_is_permanent")) {
      return { error: "A Root can't be removed from their tree." };
    }
    if (m.includes("yourself")) return { error: "You can't remove yourself." };
    if (m.includes("member not found")) {
      return { error: "That member isn't on this tree." };
    }
    return { error: "Couldn't remove that member. Try again." };
  }

  if (lastTree) {
    // Profile is gone; drop the login too. A lingering auth row can't get
    // back in without a new invite, so a failure here is non-fatal.
    try {
      await createAdminClient().auth.admin.deleteUser(userId);
    } catch {
      // no-op
    }
  }

  revalidateTreeAndAccount();
  revalidatePath("/trees");
  return {};
}
