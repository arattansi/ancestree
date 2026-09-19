"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin: make a member a branch admin, or put them back to member.
 *
 * A branch admin curates the part of the tree they belong to — every entry on
 * their own branch, and the connections between two people on it. Which
 * entries those are is derived from their own entry, not configured here; see
 * `private.branch_ids` (Step 17). Admins are left alone: demoting one is a
 * bigger decision than this button, and promoting one would be a demotion.
 */
export async function setBranchAdmin(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const makeBranchAdmin = String(formData.get("branchAdmin") ?? "") === "true";
  if (!userId) return;

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!target || target.role === "admin") return;

  await supabase
    .from("profiles")
    .update({ role: makeBranchAdmin ? "branch_admin" : "member" })
    .eq("auth_user_id", userId);

  revalidatePath("/admin");
  revalidatePath("/tree");
}

/**
 * Admin: remove a member.
 *
 * `admin_delete_member` reassigns everything the departing member created or
 * owns to the acting admin (so RESTRICT foreign keys don't block it) and drops
 * their profile row. We then delete the auth user itself via the service role
 * so they can't sign back in without a fresh invite.
 */
export async function deleteMember(
  userId: string,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  if (!userId) return { error: "No member specified." };
  if (userId === admin.auth_user_id) {
    return { error: "You can't remove yourself." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_member", {
    p_user_id: userId,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("another admin")) {
      return {
        error: "Admins can't be removed here — change their role first.",
      };
    }
    if (m.includes("yourself")) return { error: "You can't remove yourself." };
    if (m.includes("member not found")) {
      return { error: "That member no longer exists." };
    }
    return { error: "Couldn't remove that member. Try again." };
  }

  // Profile is gone; drop the login too. A lingering auth row can't get back
  // in without a new invite, so a failure here is non-fatal.
  try {
    await createAdminClient().auth.admin.deleteUser(userId);
  } catch {
    // no-op
  }

  revalidatePath("/admin");
  return {};
}
