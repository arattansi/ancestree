"use server";

import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
import { rootOf } from "@/lib/tree-context";

const EXPIRY_DAYS = 30;

export type CreateShareLinkState = {
  url?: string;
  error?: string;
};

/** Root: mint a view-only link to one tree. */
export async function createShareLink(input: {
  treeId: string;
  label?: string;
  withExpiry?: boolean;
}): Promise<CreateShareLinkState> {
  const { membership, error: notRoot } = await rootOf(input.treeId);
  if (notRoot || !membership) return { error: notRoot };

  const label = (input.label ?? "").trim() || null;
  const withExpiry = Boolean(input.withExpiry);

  const supabase = await createClient();
  const expiresAt = withExpiry
    ? new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data: link, error } = await supabase
    .from("share_links")
    .insert({
      tree_id: input.treeId,
      created_by: membership.profile.auth_user_id,
      label,
      expires_at: expiresAt,
    })
    .select("token")
    .single();

  if (error || !link) {
    return { error: "Could not create a share link. Try again." };
  }

  revalidateTreePages();
  return { url: `${getSiteUrl()}/shared/${link.token}` };
}

/** Root: revoke a share link so its URL stops working immediately. */
export async function revokeShareLink(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // RLS lets only a Root of the link's tree update it.
  const supabase = await createClient();
  await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);

  revalidateTreePages();
}
