"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

const EXPIRY_DAYS = 30;

export type CreateShareLinkState = {
  url?: string;
  error?: string;
};

/** Admin-only: mint a view-only link to the shared tree. */
export async function createShareLink(input: {
  label?: string;
  withExpiry?: boolean;
}): Promise<CreateShareLinkState> {
  const profile = await requireAdmin();

  const label = (input.label ?? "").trim() || null;
  const withExpiry = Boolean(input.withExpiry);

  const supabase = await createClient();

  const { data: tree } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!tree) return { error: "No family tree exists yet." };

  const expiresAt = withExpiry
    ? new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: link, error } = await supabase
    .from("share_links")
    .insert({
      tree_id: tree.id,
      created_by: profile.auth_user_id,
      label,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !link) {
    return { error: "Could not create a share link. Try again." };
  }

  revalidatePath("/admin");
  return { url: `${getSiteUrl()}/shared/${link.token}` };
}

/** Admin-only: revoke a share link so its URL stops working immediately. */
export async function revokeShareLink(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);

  revalidatePath("/admin");
}
