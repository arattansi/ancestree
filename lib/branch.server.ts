import "server-only";

import { accountTypeOf } from "@/lib/account-types";
import { branchIds, type Viewer } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

/**
 * The entries that belong to the people they describe: every member's own
 * entry, plus anything an approved claim has settled on. A branch admin edits
 * around these, never through them.
 *
 * The viewer's own entry is left out — it is theirs to edit, and the ownership
 * rule already says so.
 */
export async function getSpokenForEntryIds(
  viewerUserId: string,
): Promise<Set<string>> {
  const supabase = await createClient();
  const [profileRes, claimRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("auth_user_id, self_person_id")
      .not("self_person_id", "is", null),
    supabase.from("claims").select("person_id").eq("status", "approved"),
  ]);

  const ids = new Set<string>();
  for (const p of profileRes.data ?? []) {
    if (p.auth_user_id === viewerUserId) continue;
    if (p.self_person_id) ids.add(p.self_person_id);
  }
  for (const c of claimRes.data ?? []) ids.add(c.person_id);
  return ids;
}

/**
 * Who the viewer is for permission purposes, with their branch resolved when
 * their account type calls for one. Mirrors `private.is_on_own_branch`: a
 * Branch still in onboarding, with no entry of their own, has no branch.
 */
export async function getViewer(
  profile: Profile,
  treeId: string,
): Promise<Viewer> {
  const base = {
    userId: profile.auth_user_id,
    role: profile.role,
    selfPersonId: profile.self_person_id,
  };
  if (
    accountTypeOf(profile.role).entries !== "branch" ||
    !profile.self_person_id
  ) {
    return { ...base, branch: null };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("relationships")
    .select("from_person, to_person, type")
    .eq("tree_id", treeId);

  return { ...base, branch: branchIds(profile.self_person_id, data ?? []) };
}
