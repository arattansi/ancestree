import "server-only";

import { accountTypeOf } from "@/lib/account-types";
import { branchReach, relatedRoots, type Viewer } from "@/lib/branch";
import { personDisplayName } from "@/lib/person-name";
import { createClient } from "@/lib/supabase/server";
import { getRootEntryIds } from "@/lib/tree";
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
 * Who the viewer is for permission purposes, with what they tend resolved when
 * their account type calls for it. Mirrors `private.is_on_own_branch`: a
 * Branch tends the side of the Root they are related to, and one still in
 * onboarding, with no entry of their own, is related to no one.
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
  const [rootIds, { data }] = await Promise.all([
    getRootEntryIds(supabase),
    supabase
      .from("relationships")
      .select("from_person, to_person, type")
      .eq("tree_id", treeId),
  ]);

  return {
    ...base,
    branch: branchReach(profile.self_person_id, rootIds, data ?? []),
  };
}

/**
 * Whose side of the tree each of `personIds` would tend as a Branch: the names
 * of the Roots they are related to, in the order the Roots joined. Empty for
 * someone related to no Root. Shown beside a Branch on /admin and /account.
 */
export async function getBranchSides(
  personIds: readonly string[],
): Promise<Map<string, string[]>> {
  const sides = new Map<string, string[]>();
  if (personIds.length === 0) return sides;

  const supabase = await createClient();
  const [rootIds, { data: edges }] = await Promise.all([
    getRootEntryIds(supabase),
    supabase.from("relationships").select("from_person, to_person, type"),
  ]);
  const { data: roots } = await supabase
    .from("people")
    .select("id, first_name, preferred_name, last_name")
    .in("id", rootIds);
  const nameOf = new Map(
    (roots ?? []).map((p) => [p.id, personDisplayName(p)]),
  );

  for (const id of personIds) {
    sides.set(
      id,
      relatedRoots(id, rootIds, edges ?? []).map(
        (root) => nameOf.get(root) ?? "a Root",
      ),
    );
  }
  return sides;
}
