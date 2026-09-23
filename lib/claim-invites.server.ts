import "server-only";

import {
  claimInvitesShown,
  type ClaimInviteRow,
  type ClaimInviteViewer,
  type EntryInvite,
} from "@/lib/claim-invites";
import { createAdminClient } from "@/lib/supabase/admin";

/** How many of a tree's newest claim invites the cards look at. */
const SCAN_LIMIT = 500;

/**
 * The invites out to claim entries on a tree, for its cards (Step 38): who
 * sent each and when. Read with the service role, since RLS shows an invite
 * only to a Root, its sender and whoever accepted it, while the card tells
 * every member of the tree. So the caller must already know the viewer is
 * one (the canvas's `requireTreeAccess`), and only what `claimInvitesShown`
 * keeps leaves here: never a token, and an address only for a Root or the
 * sender. An accepted invite is deleted as it's redeemed, so none shows.
 */
export async function listClaimInvites(
  treeId: string,
  viewer: ClaimInviteViewer,
): Promise<EntryInvite[]> {
  const { data, error } = await createAdminClient()
    .from("invites")
    .select(
      "id, person_id, created_by, invited_email, created_at, expires_at, archived_at, profiles!invites_created_by_fkey(display_name), invite_requests(email_sent)",
    )
    .eq("tree_id", treeId)
    .eq("status", "active")
    .eq("founds_tree", false)
    .not("person_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);

  if (error || !data) {
    if (error) console.error("[claim-invites] listing for a tree failed", error.code);
    return [];
  }

  const rows = data.flatMap((i): ClaimInviteRow[] => {
    if (!i.person_id) return [];
    // One-to-one FKs that PostgREST still hands back as arrays.
    const sender = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;
    const record = Array.isArray(i.invite_requests)
      ? i.invite_requests[0]
      : i.invite_requests;
    return [
      {
        id: i.id,
        personId: i.person_id,
        sentBy: i.created_by,
        sentByName: sender?.display_name ?? null,
        email: i.invited_email,
        sentAt: i.created_at,
        expiresAt: i.expires_at,
        archived: i.archived_at !== null,
        emailSent: record?.email_sent ?? null,
      },
    ];
  });
  return claimInvitesShown(rows, viewer, new Date());
}
