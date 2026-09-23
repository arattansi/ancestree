"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const MAX_NAME = 60;

/**
 * Change the name a member is shown under across the app (their profile
 * `display_name`). With `relatives_can_ask`, it's all a member may write on
 * their profile: their own entry and who invited them are set by the RPCs
 * alone (Step 42, the column grants and `profiles_guard`).
 */
export async function updateDisplayName(
  name: string,
): Promise<{ error?: string; displayName?: string }> {
  const profile = await requireProfile();

  const trimmed = name.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) {
    return { error: "Enter at least two characters." };
  }
  if (trimmed.length > MAX_NAME) {
    return { error: `Keep it under ${MAX_NAME} characters.` };
  }
  if (trimmed === profile.display_name) {
    return { displayName: trimmed };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed })
    .eq("auth_user_id", profile.auth_user_id);

  if (error) {
    return { error: "Couldn't save your name. Try again." };
  }

  revalidatePath("/account");
  revalidatePath("/admin");
  revalidatePath("/tree");
  return { displayName: trimmed };
}
