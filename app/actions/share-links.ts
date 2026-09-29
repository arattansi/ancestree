"use server";

import { ownedWrite } from "@/lib/db-errors";
import { expiresAfter } from "@/lib/expiry";
import { SHARE_LINK_DAYS, SHARE_LINK_LABEL_MAX } from "@/lib/limits";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
import { rootOf } from "@/lib/tree-context";

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
  if (!membership) return { error: notRoot };

  const label = (input.label ?? "").trim() || null;
  if (label && label.length > SHARE_LINK_LABEL_MAX) {
    return { error: `Keep the label under ${SHARE_LINK_LABEL_MAX} characters.` };
  }
  const withExpiry = Boolean(input.withExpiry);

  const supabase = await createClient();
  const expiresAt = withExpiry ? expiresAfter(SHARE_LINK_DAYS) : null;

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

/**
 * Root: revoke a share link so its URL stops working immediately. A failure
 * is said (Step 70); it used to look like success.
 */
export async function revokeShareLink(id: string): Promise<{ error?: string }> {
  if (!id) return { error: "Couldn't revoke that link." };

  // RLS lets only a Root of the link's tree update it; anyone else's write
  // touches nothing, and says so (Step 77.4).
  const supabase = await createClient();
  const revoked = await ownedWrite(
    supabase
      .from("share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .is("revoked_at", null)
      .select("id"),
    {
      refused: "That link is already revoked, or isn't yours to revoke.",
      failed: "Couldn't revoke that link. Try again.",
    },
  );
  if (revoked.error) return { error: revoked.error };

  revalidateTreePages();
  return {};
}
