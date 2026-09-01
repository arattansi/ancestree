import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isShareLinkUsable } from "@/lib/share-links";

export type ResolvedShareLink = {
  id: string;
  token: string;
  treeId: string;
  treeName: string;
};

/**
 * Look up a share-link token with the service role (the visitor is
 * unauthenticated) and return the tree it points at, or `null` when the token
 * is unknown, revoked, or expired. Records the view as a side effect.
 */
export async function resolveShareLink(
  token: string,
): Promise<ResolvedShareLink | null> {
  if (!token) return null;

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("share_links")
    .select("id, token, tree_id, revoked_at, expires_at, view_count")
    .eq("token", token)
    .maybeSingle();

  if (!link || !isShareLinkUsable(link)) return null;

  const { data: tree } = await admin
    .from("trees")
    .select("id, name")
    .eq("id", link.tree_id)
    .maybeSingle();

  if (!tree) return null;

  // Fire-and-forget view accounting; never block the render on it.
  void admin
    .from("share_links")
    .update({
      last_viewed_at: new Date().toISOString(),
      view_count: (link.view_count ?? 0) + 1,
    })
    .eq("id", link.id);

  return {
    id: link.id,
    token: link.token,
    treeId: tree.id,
    treeName: tree.name,
  };
}
