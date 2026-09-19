"use server";

import { revalidatePath } from "next/cache";

import { ROOT, isAssignable } from "@/lib/account-types";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Root: give a member a different account type — Branch, Canopy or Leaf
 * (`lib/account-types`).
 *
 * What each can reach is the database's to enforce; this only records the
 * choice. A Branch's branch is derived from their own entry, not configured
 * here (`private.branch_ids`, Step 17). Roots are left alone: making someone a
 * Root, or unmaking one, is a bigger decision than a dropdown.
 */
export async function setAccountType(
  userId: string,
  key: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  if (!userId) return { error: "No member specified." };
  if (!isAssignable(key)) {
    return { error: "That isn't an account type a Root can give." };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!target) return { error: "That member no longer exists." };
  if (target.role === ROOT.key) {
    return { error: "A Root's account type can't be changed here." };
  }

  // `profiles_protect_role` quietly keeps the old role for anyone who isn't
  // a Root, so read the row back rather than trusting a clean response.
  const { data } = await supabase
    .from("profiles")
    .update({ role: key })
    .eq("auth_user_id", userId)
    .select("role");
  if (data?.[0]?.role !== key) {
    return { error: "Couldn't change that account type. Try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/tree");
  revalidatePath("/account");
  return {};
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
