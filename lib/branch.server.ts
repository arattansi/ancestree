import "server-only";

import { accountTypeOf, type AccountTypeKey } from "@/lib/account-types";
import {
  branchReach,
  lineIds,
  relatedRoots,
  type Viewer,
} from "@/lib/branch";
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

/** The connections a tree shows, for the branch walks. */
async function treeEdges(treeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tree_edges")
    .select("from_person, to_person, type")
    .eq("tree_id", treeId);
  return (data ?? []).flatMap((r) =>
    r.from_person && r.to_person && r.type
      ? [{ from_person: r.from_person, to_person: r.to_person, type: r.type }]
      : [],
  );
}

/**
 * Who the viewer is for permission purposes on one tree, with what they tend
 * or grow resolved when their account type there calls for it. Mirrors
 * `private.is_on_own_branch(person, tree)`: a Branch tends the part of a
 * Root's side they are related through (Step 22.2), measured on that tree's
 * people, and one still in onboarding, with no entry of their own, is related
 * to no one. A Leaf's own line (`private.line_ids`, Step 34) is measured the
 * same way.
 */
export async function getViewer(
  profile: Profile,
  role: AccountTypeKey,
  treeId: string,
): Promise<Viewer> {
  const base = {
    userId: profile.auth_user_id,
    role,
    selfPersonId: profile.self_person_id,
  };
  const self = profile.self_person_id;
  const type = accountTypeOf(role);
  const tends = type.entries === "branch" && !!self;
  const grows = type.addRelatives === "line" && !!self;
  if (!self || (!tends && !grows)) return { ...base, branch: null, line: null };

  const [rootIds, edges] = await Promise.all([
    tends ? getRootEntryIds(treeId) : [],
    treeEdges(treeId),
  ]);

  return {
    ...base,
    branch: tends ? branchReach(self, rootIds, edges) : null,
    line: grows ? lineIds(self, edges) : null,
  };
}

/**
 * Everyone on `personId`'s own line on one tree (`lib/branch.ts#lineIds`):
 * where a Leaf may add relatives (Step 34).
 */
export async function getOwnLine(
  treeId: string,
  personId: string,
): Promise<Set<string>> {
  return lineIds(personId, await treeEdges(treeId));
}

/**
 * Whose side of a tree each of `personIds` would tend as a Branch: the names
 * of the Roots they are related to, in the order the Roots joined. Empty for
 * someone related to no Root. Shown beside a Branch on the admin and account
 * pages.
 */
export async function getBranchSides(
  personIds: readonly string[],
  treeId: string,
): Promise<Map<string, string[]>> {
  const sides = new Map<string, string[]>();
  if (personIds.length === 0) return sides;

  const supabase = await createClient();
  const [rootIds, edges] = await Promise.all([
    getRootEntryIds(treeId),
    treeEdges(treeId),
  ]);
  const { data: roots } = rootIds.length
    ? await supabase
        .from("people")
        .select("id, first_name, preferred_name, last_name")
        .in("id", rootIds)
    : { data: [] };
  const nameOf = new Map(
    (roots ?? []).map((p) => [p.id, personDisplayName(p)]),
  );

  for (const id of personIds) {
    sides.set(
      id,
      relatedRoots(id, rootIds, edges).map(
        (root) => nameOf.get(root) ?? "a Root",
      ),
    );
  }
  return sides;
}
