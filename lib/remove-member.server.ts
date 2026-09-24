import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Which of these members of `treeId` are on another tree too (Step 46), so
 * the admin console can say whether removing them deletes their login:
 * `remove_tree_member` drops the profile only with their last membership. A
 * Root sees memberships only of trees they can view, so this asks with the
 * service role, and hands back nothing but who: never which trees, which a
 * Root who isn't on them has no business knowing. Null when it can't tell.
 * Only for the admin console, which only a Root of `treeId` is shown.
 */
export async function membersOnOtherTrees(
  treeId: string,
  userIds: string[],
): Promise<Set<string> | null> {
  if (userIds.length === 0) return new Set();
  try {
    const { data, error } = await createAdminClient()
      .from("tree_members")
      .select("user_id")
      .in("user_id", userIds)
      .neq("tree_id", treeId);
    if (error) return null;
    return new Set(data.map((m) => m.user_id));
  } catch {
    return null;
  }
}
