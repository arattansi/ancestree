import "server-only";

import {
  readFoundAccount,
  type FoundAccount,
  type FoundTree,
} from "@/lib/admin-manage";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * Accounts whose address or name holds `query`, or the one `userId`, for a
 * beta reviewer (Step 103.4); nobody else gets any (`find_accounts` checks
 * again).
 */
export async function findAccounts(
  query: string | null,
  userId: string | null = null,
): Promise<FoundAccount[]> {
  if ((!query && !userId) || !(await isBetaReviewer())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_accounts", {
    p_query: query ?? undefined,
    p_user: userId ?? undefined,
  });
  if (error) {
    console.error("[admin] couldn't find accounts", error.code);
    return [];
  }
  return (data ?? []).map(readFoundAccount);
}

/** Trees whose name holds `query`, or the one `treeId`, for a beta reviewer. */
export async function findTrees(
  query: string | null,
  treeId: string | null = null,
): Promise<FoundTree[]> {
  if ((!query && !treeId) || !(await isBetaReviewer())) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_trees", {
    p_query: query ?? undefined,
    p_tree: treeId ?? undefined,
  });
  if (error) {
    console.error("[admin] couldn't find trees", error.code);
    return [];
  }
  return (data ?? []).map((t) => ({
    id: t.tree_id,
    name: t.name,
    createdAt: t.created_at,
    members: t.members,
    entries: t.entries,
    roots: t.roots ?? [],
  }));
}
