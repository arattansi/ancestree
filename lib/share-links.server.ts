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

/**
 * Whether a share link's page shows this place (Step 27.9): the link still
 * works, and the place is where someone on its tree was born or died, or
 * where one of its companions was born. That bounds what a share link can
 * have Native Land Digital asked about to what its cards show. Counts no
 * view: the page already did.
 */
export async function sharedTreeShowsPlace(
  token: string,
  placeId: number,
): Promise<boolean> {
  // An integer only: it goes into the filter below as text.
  if (!token || !Number.isSafeInteger(placeId)) return false;

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("share_links")
    .select("tree_id, revoked_at, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || !isShareLinkUsable(link)) return false;

  // The same rows the shared page draws: `getTreeGraph` and `getTreePets`.
  const [people, pets] = await Promise.all([
    admin
      .from("tree_people")
      .select("id", { count: "exact", head: true })
      .eq("tree_id", link.tree_id)
      .or(`place_id_birth.eq.${placeId},place_id_death.eq.${placeId}`),
    admin
      .from("pets")
      .select("id", { count: "exact", head: true })
      .eq("tree_id", link.tree_id)
      .eq("place_id_birth", placeId),
  ]);
  return (people.count ?? 0) + (pets.count ?? 0) > 0;
}
