"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUser, requireAdmin, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSharedTree } from "@/lib/tree";

/**
 * Admin-only full export of the shared tree as JSON. Every row a member could
 * ever see, in one file, so the tree's data stewards can honour a
 * "show me everything you hold" request.
 */
export async function exportTreeData(): Promise<{
  json?: string;
  filename?: string;
  error?: string;
}> {
  await requireAdmin();

  const tree = await getSharedTree();
  if (!tree) return { error: "No tree to export yet." };

  const db = createAdminClient();

  const [
    trees,
    profiles,
    people,
    relationships,
    invites,
    claims,
    entryComments,
    documents,
    notifications,
    pets,
    petCompanions,
  ] = await Promise.all([
    db.from("trees").select("*"),
    db.from("profiles").select("*"),
    db.from("people").select("*").eq("tree_id", tree.id),
    db.from("relationships").select("*").eq("tree_id", tree.id),
    db.from("invites").select("*").eq("tree_id", tree.id),
    db.from("claims").select("*"),
    db.from("entry_comments").select("*"),
    db.from("documents").select("*"),
    db.from("notifications").select("*"),
    db.from("pets").select("*").eq("tree_id", tree.id),
    db.from("pet_companions").select("*"),
  ]);

  const firstError = [
    trees,
    profiles,
    people,
    relationships,
    invites,
    claims,
    entryComments,
    documents,
    notifications,
    pets,
    petCompanions,
  ].find((r) => r.error)?.error;
  if (firstError) return { error: "Could not read every table. Try again." };

  const payload = {
    exported_at: new Date().toISOString(),
    tree_id: tree.id,
    tables: {
      trees: trees.data ?? [],
      profiles: profiles.data ?? [],
      people: people.data ?? [],
      relationships: relationships.data ?? [],
      invites: invites.data ?? [],
      claims: claims.data ?? [],
      entry_comments: entryComments.data ?? [],
      documents: documents.data ?? [],
      notifications: notifications.data ?? [],
      pets: pets.data ?? [],
      pet_companions: petCompanions.data ?? [],
    },
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    json: JSON.stringify(payload, null, 2),
    filename: `ancestree-export-${stamp}.json`,
  };
}

/**
 * Admin-only permanent removal of a person entry, its relationship edges (via
 * cascade), and its stored photo + documents. Used for right-to-erasure
 * requests.
 */
export async function deletePerson(
  personId: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("people")
    .select("id, tree_id, photo_path")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { error: "That entry no longer exists." };

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

  const { error } = await supabase.from("people").delete().eq("id", personId);
  if (error) return { error: "Couldn't delete that entry. Try again." };

  const { data: survivingPets } = petIds.length
    ? await supabase.from("pets").select("id").in("id", petIds)
    : { data: [] as { id: string }[] };
  const surviving = new Set((survivingPets ?? []).map((p) => p.id));

  const objects = [
    ...(person.photo_path ? [person.photo_path] : []),
    ...(petRows ?? [])
      .filter((p) => !surviving.has(p.id) && p.photo_path)
      .map((p) => p.photo_path as string),
  ];
  if (objects.length) await supabase.storage.from("photos").remove(objects);

  const docPaths = (docs ?? []).map((d) => d.file_path).filter(Boolean);
  if (docPaths.length) {
    await supabase.storage.from("documents").remove(docPaths);
  }

  revalidatePath("/tree");
  revalidatePath("/admin");
  return {};
}

/**
 * Permanently delete the signed-in member's own account: their auth login and
 * profile row. Entries and edges they created are reassigned to a founding
 * admin so the shared family record stays intact (see the privacy notice).
 */
export async function deleteAccount(): Promise<{ error?: string }> {
  await requireProfile();
  const user = await getUser();
  if (!user) return { error: "You are not signed in." };

  const db = createAdminClient();

  // Find another admin to inherit stewardship of this member's contributions.
  const { data: admins } = await db
    .from("profiles")
    .select("auth_user_id, created_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  const steward = (admins ?? []).find(
    (a) => a.auth_user_id !== user.id,
  )?.auth_user_id;

  if (!steward) {
    return {
      error:
        "You are the only admin. Promote another admin before deleting your account.",
    };
  }

  // Reassign every row that references this user with ON DELETE RESTRICT.
  const reassign = [
    db.from("people").update({ created_by: steward }).eq("created_by", user.id),
    db
      .from("people")
      .update({ owner_user_id: steward })
      .eq("owner_user_id", user.id),
    db
      .from("relationships")
      .update({ created_by: steward })
      .eq("created_by", user.id),
    db
      .from("invites")
      .update({ created_by: steward })
      .eq("created_by", user.id),
    db
      .from("entry_comments")
      .update({ created_by: steward })
      .eq("created_by", user.id),
    db
      .from("documents")
      .update({ uploaded_by: steward })
      .eq("uploaded_by", user.id),
    // Companions are family memories too — hand them over rather than letting
    // the profile cascade take the household dog with it.
    db.from("pets").update({ created_by: steward }).eq("created_by", user.id),
    db
      .from("pet_companions")
      .update({ created_by: steward })
      .eq("created_by", user.id),
  ];
  const results = await Promise.all(reassign);
  if (results.some((r) => r.error)) {
    return { error: "Couldn't hand off your entries. Try again." };
  }

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
      error: "Profile removed, but sign-in cleanup failed. Contact an admin.",
    };
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
