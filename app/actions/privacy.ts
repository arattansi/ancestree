"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUser, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreeAndAccount } from "@/lib/revalidate";
import { rootOf } from "@/lib/tree-context";

/**
 * Root: full export of one tree as JSON. Every row a member of it could ever
 * see, in one file, so the tree's data stewards can honour a "show me
 * everything you hold" request. People shown on the tree are included whether
 * or not it is their home; other trees' boards and banks are not.
 */
export async function exportTreeData(treeId: string): Promise<{
  json?: string;
  filename?: string;
  error?: string;
}> {
  const { membership, error: notRoot } = await rootOf(treeId);
  if (notRoot || !membership) return { error: notRoot };

  const db = createAdminClient();

  const { data: placements } = await db
    .from("tree_placements")
    .select("*")
    .eq("tree_id", treeId);
  const personIds = (placements ?? [])
    .filter((p) => p.status === "active")
    .map((p) => p.person_id);

  const [
    trees,
    members,
    people,
    relationships,
    invites,
    claims,
    entryComments,
    documents,
    notifications,
    pets,
    petCompanions,
    petComments,
  ] = await Promise.all([
    db.from("trees").select("*").eq("id", treeId),
    db.from("member_directory").select("*").eq("tree_id", treeId),
    personIds.length ? db.from("people").select("*").in("id", personIds) : Promise.resolve({ data: [], error: null }),
    db.from("tree_edges").select("*").eq("tree_id", treeId),
    db.from("invites").select("*").eq("tree_id", treeId),
    personIds.length ? db.from("claims").select("*").in("person_id", personIds) : Promise.resolve({ data: [], error: null }),
    db.from("entry_comments").select("*").eq("tree_id", treeId),
    db.from("documents").select("*").eq("tree_id", treeId),
    db.from("notifications").select("*").eq("tree_id", treeId),
    db.from("pets").select("*").eq("tree_id", treeId),
    db.from("pet_companions").select("*, pets!inner(tree_id)").eq("pets.tree_id", treeId),
    db.from("pet_comments").select("*, pets!inner(tree_id)").eq("pets.tree_id", treeId),
  ]);

  const firstError = [
    trees,
    members,
    people,
    relationships,
    invites,
    claims,
    entryComments,
    documents,
    notifications,
    pets,
    petCompanions,
    petComments,
  ].find((r) => r.error)?.error;
  if (firstError) return { error: "Could not read every table. Try again." };

  const payload = {
    exported_at: new Date().toISOString(),
    tree_id: treeId,
    tables: {
      trees: trees.data ?? [],
      tree_members: members.data ?? [],
      tree_placements: placements ?? [],
      people: people.data ?? [],
      relationships: relationships.data ?? [],
      invites: invites.data ?? [],
      claims: claims.data ?? [],
      entry_comments: entryComments.data ?? [],
      documents: documents.data ?? [],
      notifications: notifications.data ?? [],
      pets: pets.data ?? [],
      pet_companions: petCompanions.data ?? [],
      pet_comments: petComments.data ?? [],
    },
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    json: JSON.stringify(payload, null, 2),
    filename: `ancestree-${membership.tree.slug}-${stamp}.json`,
  };
}

/**
 * Permanently remove a person entry, its relationship edges (via cascade), and
 * its stored photo + documents. A Root of the entry's home tree may remove any
 * entry — right-to-erasure requests come through here. Since Step 22.3 a
 * Branch or a Leaf may remove an unclaimed entry they added, as long
 * as nobody else has hung a connection, comment, document or companion on it
 * and no other tree shows it (`private.can_delete_person`, enforced by the
 * `people_delete` policy).
 */
export async function deletePerson(
  personId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, tree_id, photo_path")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That entry no longer exists." };

  // Ask first, so a refusal can say why: RLS would just delete nothing.
  const { data: allowed } = await supabase.rpc("can_delete_person", {
    p_person_id: personId,
  });
  if (!allowed) return { error: NOT_YOURS_TO_DELETE };

  const { data: docs } = await supabase
    .from("documents")
    .select("file_path")
    .eq("person_id", personId);

  // Companions whose *only* person is this one go with them (a DB trigger
  // prunes the rows); their photos have to be swept up here.
  const { data: companionLinks } = await supabase
    .from("pet_companions")
    .select("pet_id")
    .eq("person_id", personId);
  const petIds = [...new Set((companionLinks ?? []).map((l) => l.pet_id))];
  const { data: petRows } = petIds.length
    ? await supabase.from("pets").select("id, photo_path").in("id", petIds)
    : { data: [] as { id: string; photo_path: string | null }[] };

  const { data: deleted, error } = await supabase
    .from("people")
    .delete()
    .eq("id", personId)
    .select("id");
  if (error) return { error: "Couldn't delete that entry. Try again." };
  // Something was added between the check and the delete.
  if (!deleted || deleted.length === 0) return { error: NOT_YOURS_TO_DELETE };

  // The entry is gone, and with it the storage policies' way of knowing who
  // could edit it, so the files are swept with the service role. The delete
  // above is what proved the right to remove them.
  const db = createAdminClient();

  const { data: survivingPets } = petIds.length
    ? await db.from("pets").select("id").in("id", petIds)
    : { data: [] as { id: string }[] };
  const surviving = new Set((survivingPets ?? []).map((p) => p.id));

  const objects = [
    ...(person.photo_path ? [person.photo_path] : []),
    ...(petRows ?? [])
      .filter((p) => !surviving.has(p.id) && p.photo_path)
      .map((p) => p.photo_path as string),
  ];
  if (objects.length) await db.storage.from("photos").remove(objects);

  const docPaths = (docs ?? []).map((d) => d.file_path).filter(Boolean);
  if (docPaths.length) {
    await db.storage.from("documents").remove(docPaths);
  }

  revalidateTreeAndAccount();
  return {};
}

const NOT_YOURS_TO_DELETE =
  "Someone else has added to this entry — a connection, comment, document or companion — or another tree shows it, so only a Root can remove it now. Ask a Root.";

export type DeleteAccountInput = {
  /**
   * Per tree where the member is the only Root: who takes over as Root there
   * (Step 25). Keyed by tree id.
   */
  successors?: Record<string, string>;
};

/**
 * Permanently delete the signed-in member's own account: their auth login and
 * profile row. In each tree they belong to, entries and edges they created
 * are reassigned to a Root of that tree so the shared record stays intact
 * (see the privacy notice).
 *
 * A Root may leave too, but never leave a tree without one: where they are
 * the only Root they must name a successor — another member of that tree —
 * who is made a Root first and takes over what they added, and the Branches
 * they made (Step 39). A Root stays a Root (Step 22.5), so that promotion
 * stands even if the deletion then fails. With only one Root to replace, the
 * tree never passes its two.
 */
export async function deleteAccount(
  input?: DeleteAccountInput | string,
): Promise<{ error?: string }> {
  await requireProfile();
  const user = await getUser();
  if (!user) return { error: "You are not signed in." };

  // The pre-Step-25 form passed one successor for the one tree.
  const successors: Record<string, string> =
    typeof input === "string" ? { "*": input } : input?.successors ?? {};

  const db = createAdminClient();
  const supabase = await createClient();

  const { data: memberships } = await db
    .from("tree_members")
    .select("tree_id, role")
    .eq("user_id", user.id);

  // 1. Every tree they run alone gets its successor first.
  for (const m of memberships ?? []) {
    if (m.role !== "admin") continue;
    const { count } = await db
      .from("tree_members")
      .select("user_id", { count: "exact", head: true })
      .eq("tree_id", m.tree_id)
      .eq("role", "admin")
      .neq("user_id", user.id);
    if (count) continue;

    const successorId = successors[m.tree_id] ?? successors["*"];
    if (!successorId || successorId === user.id) {
      return {
        error:
          "You're the only Root of one of your trees. Choose who takes over as Root there before deleting your account.",
      };
    }
    // Promoted as the signed-in Root, which the guard allows; the service
    // role can't change a role.
    const { data: promoted, error } = await supabase.rpc("set_member_role", {
      p_tree: m.tree_id,
      p_user: successorId,
      p_role: "admin",
    });
    if (error || promoted !== "admin") {
      return { error: "Couldn't make them a Root. Try again." };
    }
  }

  // 2. In each tree, hand what they added to a Root there: the successor
  //    they named, else the longest-standing.
  for (const m of memberships ?? []) {
    const { data: roots } = await db
      .from("tree_members")
      .select("user_id, created_at")
      .eq("tree_id", m.tree_id)
      .eq("role", "admin")
      .neq("user_id", user.id)
      .order("created_at", { ascending: true });
    const named = successors[m.tree_id] ?? successors["*"];
    const steward =
      (roots ?? []).find((r) => r.user_id === named)?.user_id ??
      roots?.[0]?.user_id;
    if (!steward) {
      return {
        error:
          "One of your trees has no other Root to hand your entries to. Ask a Root for help.",
      };
    }

    const results = await Promise.all([
      db.from("people").update({ created_by: steward }).eq("created_by", user.id).eq("tree_id", m.tree_id),
      db.from("people").update({ owner_user_id: steward }).eq("owner_user_id", user.id).eq("tree_id", m.tree_id),
      db.from("relationships").update({ created_by: steward }).eq("created_by", user.id).eq("tree_id", m.tree_id),
      db.from("invites").update({ created_by: steward }).eq("created_by", user.id).eq("tree_id", m.tree_id),
      db.from("share_links").update({ created_by: steward }).eq("created_by", user.id).eq("tree_id", m.tree_id),
      db.from("entry_comments").update({ created_by: steward }).eq("created_by", user.id).eq("tree_id", m.tree_id),
      db.from("documents").update({ uploaded_by: steward }).eq("uploaded_by", user.id).eq("tree_id", m.tree_id),
      // Companions are family memories too — hand them over rather than
      // letting the profile cascade take the household dog with it.
      db.from("pets").update({ created_by: steward }).eq("created_by", user.id).eq("tree_id", m.tree_id),
      db.from("tree_placements").update({ placed_by: steward }).eq("placed_by", user.id).eq("tree_id", m.tree_id),
      // The Branches they made count toward the steward's four now (Step 39),
      // even past four; only the service role may name who made a Branch.
      db.from("tree_members").update({ branch_granted_by: steward }).eq("branch_granted_by", user.id).eq("tree_id", m.tree_id),
    ]);
    if (results.some((r) => r.error)) {
      return { error: "Couldn't hand off your entries. Try again." };
    }
  }

  // 3. Anything not tied to a tree row (companion links and comments, or
  //    stray rows) goes to the first steward found.
  const { data: anyRoot } = await db
    .from("tree_members")
    .select("user_id")
    .eq("role", "admin")
    .neq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyRoot) {
    const s = anyRoot.user_id;
    await Promise.all([
      db.from("people").update({ created_by: s }).eq("created_by", user.id),
      db.from("people").update({ owner_user_id: s }).eq("owner_user_id", user.id),
      db.from("relationships").update({ created_by: s }).eq("created_by", user.id),
      db.from("invites").update({ created_by: s }).eq("created_by", user.id),
      db.from("share_links").update({ created_by: s }).eq("created_by", user.id),
      db.from("entry_comments").update({ created_by: s }).eq("created_by", user.id),
      db.from("documents").update({ uploaded_by: s }).eq("uploaded_by", user.id),
      db.from("pets").update({ created_by: s }).eq("created_by", user.id),
      db.from("pet_companions").update({ created_by: s }).eq("created_by", user.id),
      db.from("pet_comments").update({ created_by: s }).eq("created_by", user.id),
      db.from("tree_placements").update({ placed_by: s }).eq("placed_by", user.id),
    ]);
  }
  // A founded tree keeps going without its founder on record.
  await db.from("trees").update({ created_by: null }).eq("created_by", user.id);

  const { error: profileError } = await db
    .from("profiles")
    .delete()
    .eq("auth_user_id", user.id);
  if (profileError) {
    return { error: "Couldn't delete your profile. Try again." };
  }

  const { error: authError } = await db.auth.admin.deleteUser(user.id);
  if (authError) {
    return {
      error: "Profile removed, but sign-in cleanup failed. Contact a Root.",
    };
  }

  await supabase.auth.signOut();
  revalidatePath("/");
  redirect("/?deleted=1");
}
