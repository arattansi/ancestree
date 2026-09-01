"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { foldName, nicknameInputError } from "@/lib/nicknames";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin: teach the onboarding search that a nickname belongs to a root name
 * (Step 15.1). Writes the pair and the root's identity row together, so the
 * group works in both directions from the first nickname onwards.
 */
export async function addNickname(
  root: string,
  nickname: string,
): Promise<{ error?: string; canonical?: string }> {
  await requireAdmin();

  const invalid = nicknameInputError(root, nickname);
  if (invalid) return { error: invalid };

  const canonical = foldName(root);
  const variant = foldName(nickname);

  const supabase = await createClient();
  const { error } = await supabase
    .from("name_nicknames")
    .upsert(
      [
        { variant, canonical },
        { variant: canonical, canonical },
      ],
      { onConflict: "variant,canonical", ignoreDuplicates: true },
    );

  if (error) return { error: "Couldn't save that nickname. Try again." };

  revalidatePath("/admin");
  return { canonical };
}

/** Admin: drop one nickname from a group, leaving the rest of it in place. */
export async function removeNickname(
  canonical: string,
  variant: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  if (canonical === variant) {
    return { error: "Remove the whole group instead of its root name." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("name_nicknames")
    .delete()
    .eq("canonical", canonical)
    .eq("variant", variant);

  if (error) return { error: "Couldn't remove that nickname. Try again." };

  revalidatePath("/admin");
  return {};
}

/** Admin: drop a root and every nickname under it, identity row included. */
export async function removeNicknameGroup(
  canonical: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("name_nicknames")
    .delete()
    .eq("canonical", canonical);

  if (error) return { error: "Couldn't remove that group. Try again." };

  revalidatePath("/admin");
  return {};
}
