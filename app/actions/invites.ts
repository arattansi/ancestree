"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireProfile } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const INVITE_TTL_DAYS = 14;

export type CreateInviteState = {
  url?: string;
  error?: string;
};

/** Mint a fresh, inviter-attributed, single-use invite link. */
export async function createInvite(): Promise<CreateInviteState> {
  const profile = await requireProfile();
  if (profile.role !== "admin" && !profile.can_invite) {
    return { error: "You don't have permission to create invites." };
  }

  const supabase = await createClient();

  const { data: tree, error: treeError } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (treeError || !tree) {
    return { error: "No family tree exists yet." };
  }

  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: invite, error } = await supabase
    .from("invites")
    .insert({
      tree_id: tree.id,
      created_by: profile.auth_user_id,
      status: "active",
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !invite) {
    return { error: "Could not create an invite link. Try again." };
  }

  revalidatePath("/admin");
  return { url: `${getSiteUrl()}/join/${invite.token}` };
}

/** Admin-only: grant or revoke a member's ability to mint invites. */
export async function setCanInvite(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const canInvite = String(formData.get("canInvite") ?? "") === "true";
  if (!userId) return;

  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ can_invite: canInvite })
    .eq("auth_user_id", userId);

  revalidatePath("/admin");
}
