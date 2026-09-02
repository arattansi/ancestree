"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
      return { error: "Admins can't be removed here — change their role first." };
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
