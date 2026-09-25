import "server-only";

import { accountTypeOf, type AccountType } from "@/lib/account-types";
import { createClient } from "@/lib/supabase/server";

export type FamilyLink = {
  id: string;
  token: string;
  maxUses: number;
  useCount: number;
  /** When it was made or last rotated: rotating replaces the row. */
  createdAt: string;
  /** The Root who made or last rotated it; null without a display name. */
  createdByName: string | null;
};

/**
 * A tree's family link (Step 52), or `null` when it has none (never made,
 * or turned off). Only its Roots can read it (`invites_select`).
 */
export async function getFamilyLink(treeId: string): Promise<FamilyLink | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select(
      "id, token, max_uses, use_count, created_at, profiles!invites_created_by_fkey(display_name)",
    )
    .eq("tree_id", treeId)
    .not("max_uses", "is", null)
    .maybeSingle();
  if (!data || data.max_uses === null) return null;

  // One-to-one FK that PostgREST still hands back as an array.
  const creator = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
  return {
    id: data.id,
    token: data.token,
    maxUses: data.max_uses,
    useCount: data.use_count,
    createdAt: data.created_at,
    createdByName: creator?.display_name ?? null,
  };
}

export type FamilyLinkJoin = {
  userId: string;
  name: string | null;
  joinedAt: string;
  /** Came in through the link as it is now, not one since rotated away. */
  viaCurrentLink: boolean;
  /** Their account type on the tree now; null once they've left it. */
  accountType: AccountType | null;
};

/**
 * Who joined a tree through its family link, newest first — through this
 * link or an earlier one — for its Roots (`family_link_joins`, which
 * answers nobody else).
 */
export async function listFamilyLinkJoins(
  treeId: string,
  currentLinkId: string | null,
): Promise<FamilyLinkJoin[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("family_link_joins", { p_tree: treeId });
  return (data ?? []).map((j) => ({
    userId: j.user_id,
    name: j.display_name,
    joinedAt: j.joined_at,
    viaCurrentLink: j.invite_id === currentLinkId,
    accountType: j.role ? accountTypeOf(j.role) : null,
  }));
}
