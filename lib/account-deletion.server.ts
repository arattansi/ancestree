import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who is deleting the account: its own member, from the account page, or a
 * beta reviewer, from the admin page (Step 103.4). Only the wording of a
 * refusal differs, and how a successor is made a Root.
 */
export type AccountDeleter =
  | {
      kind: "self";
      /** Makes `successorId` a Root of `treeId` as the departing Root. */
      promote: (treeId: string, successorId: string) => Promise<boolean>;
    }
  | { kind: "reviewer" };

const SAY = {
  self: {
    needsSuccessor:
      "You're the only Root of one of your trees. Choose who takes over as Root there before deleting your account.",
    noSteward:
      "One of your trees has no other Root to hand your entries to. Ask a Root for help.",
    handOff: "Couldn't hand off your entries. Try again.",
    profile: "Couldn't delete your profile. Try again.",
    signIn: "Profile removed, but sign-in cleanup failed. Contact a Root.",
  },
  reviewer: {
    needsSuccessor: "They're the only Root of a tree. Choose who takes over there.",
    noSteward: "One of their trees has no other Root to hand their entries to.",
    handOff: "Couldn't hand off their entries. Try again.",
    profile: "Couldn't delete their profile. Try again.",
    signIn: "Profile removed, but sign-in cleanup failed. Try again.",
  },
} as const;

/**
 * Permanently delete an account: its auth login and profile row. In each
 * tree it belongs to, entries and edges it created are reassigned to a Root
 * of that tree so the shared record stays intact (see the privacy notice).
 *
 * A Root may go too, but never leave a tree without one: where they are the
 * only Root, `successors` names another member of that tree, who is made a
 * Root first and takes over what they added, and the Branches they made
 * (Step 39). A Root stays a Root (Step 22.5), so that promotion stands even
 * if the deletion then fails. With only one Root to replace, the tree never
 * passes its two. Keyed by tree id; `"*"` stands for any tree (the
 * pre-Step-25 form's one successor).
 */
export async function deleteAccountOf(
  userId: string,
  successors: Record<string, string>,
  by: AccountDeleter,
): Promise<{ error?: string }> {
  const say = SAY[by.kind];
  const db = createAdminClient();

  const { data: memberships } = await db
    .from("tree_members")
    .select("tree_id, role")
    .eq("user_id", userId);

  // 1. Every tree they run alone gets its successor first.
  for (const m of memberships ?? []) {
    if (m.role !== "admin") continue;
    const { count } = await db
      .from("tree_members")
      .select("user_id", { count: "exact", head: true })
      .eq("tree_id", m.tree_id)
      .eq("role", "admin")
      .neq("user_id", userId);
    if (count) continue;

    const successorId = successors[m.tree_id] ?? successors["*"];
    if (!successorId || successorId === userId) {
      return { error: say.needsSuccessor };
    }
    const promoted =
      by.kind === "self"
        ? // As the signed-in Root, which the guard allows.
          await by.promote(m.tree_id, successorId)
        : // With the service role, which tree_members_guard lets through
          // and tree_members_limits still holds to two Roots.
          await promoteWithServiceRole(m.tree_id, successorId);
    if (!promoted) {
      return { error: "Couldn't make them a Root. Try again." };
    }
  }

  // 2. In each tree, hand what they added to a Root there: the successor
  //    named, else the longest-standing.
  for (const m of memberships ?? []) {
    const { data: roots } = await db
      .from("tree_members")
      .select("user_id, created_at")
      .eq("tree_id", m.tree_id)
      .eq("role", "admin")
      .neq("user_id", userId)
      .order("created_at", { ascending: true });
    const named = successors[m.tree_id] ?? successors["*"];
    const steward =
      (roots ?? []).find((r) => r.user_id === named)?.user_id ??
      roots?.[0]?.user_id;
    if (!steward) return { error: say.noSteward };

    const results = await Promise.all([
      db.from("people").update({ created_by: steward }).eq("created_by", userId).eq("tree_id", m.tree_id),
      db.from("people").update({ owner_user_id: steward }).eq("owner_user_id", userId).eq("tree_id", m.tree_id),
      db.from("relationships").update({ created_by: steward }).eq("created_by", userId).eq("tree_id", m.tree_id),
      db.from("invites").update({ created_by: steward }).eq("created_by", userId).eq("tree_id", m.tree_id),
      db.from("share_links").update({ created_by: steward }).eq("created_by", userId).eq("tree_id", m.tree_id),
      // Companions are family memories too — hand them over rather than
      // letting the profile cascade take the household dog with it.
      db.from("pets").update({ created_by: steward }).eq("created_by", userId).eq("tree_id", m.tree_id),
      db.from("tree_placements").update({ placed_by: steward }).eq("placed_by", userId).eq("tree_id", m.tree_id),
      // The Branches they made count toward the steward's four now (Step 39),
      // even past four; only the service role may name who made a Branch.
      db.from("tree_members").update({ branch_granted_by: steward }).eq("branch_granted_by", userId).eq("tree_id", m.tree_id),
    ]);
    if (results.some((r) => r.error)) return { error: say.handOff };
  }

  // 3. Anything not tied to a tree row (companion links and comments, or
  //    stray rows) goes to the first steward found.
  const { data: anyRoot } = await db
    .from("tree_members")
    .select("user_id")
    .eq("role", "admin")
    .neq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyRoot) {
    const s = anyRoot.user_id;
    await Promise.all([
      db.from("people").update({ created_by: s }).eq("created_by", userId),
      db.from("people").update({ owner_user_id: s }).eq("owner_user_id", userId),
      db.from("relationships").update({ created_by: s }).eq("created_by", userId),
      db.from("invites").update({ created_by: s }).eq("created_by", userId),
      db.from("share_links").update({ created_by: s }).eq("created_by", userId),
      db.from("pets").update({ created_by: s }).eq("created_by", userId),
      db.from("pet_companions").update({ created_by: s }).eq("created_by", userId),
      db.from("pet_comments").update({ created_by: s }).eq("created_by", userId),
      db.from("tree_placements").update({ placed_by: s }).eq("placed_by", userId),
    ]);
  }
  // A founded tree keeps going without its founder on record. Their stories
  // stay on the entries they're about, told by nobody (Step 88.3), and their
  // photos in the albums they're in, added by nobody (Step 88.5): the
  // profile's delete clears `stories.created_by` and `album_photos.created_by`.
  await db.from("trees").update({ created_by: null }).eq("created_by", userId);

  const { error: profileError } = await db
    .from("profiles")
    .delete()
    .eq("auth_user_id", userId);
  if (profileError) return { error: say.profile };

  const { error: authError } = await db.auth.admin.deleteUser(userId);
  if (authError) return { error: say.signIn };

  return {};
}

async function promoteWithServiceRole(treeId: string, userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("tree_members")
    .update({ role: "admin" })
    .eq("tree_id", treeId)
    .eq("user_id", userId)
    .select("role");
  return !error && data?.length === 1 && data[0].role === "admin";
}
