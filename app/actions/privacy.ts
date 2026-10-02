"use server";

import { redirect } from "next/navigation";

import { deleteAccountOf } from "@/lib/account-deletion.server";
import { getSessionUser, requireProfile } from "@/lib/auth";
import { albumPhotosOf, removeUnusedAlbumPhotos } from "@/lib/file-cleanup.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";
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
  if (!membership) return { error: notRoot };

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
    storiesHere,
    storiesOnPeople,
    reportsHere,
    reportsOnOwn,
    albumTags,
    albumHere,
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
    // Stories (Step 88.3): those told here, and the approved ones about
    // anyone the tree shows, which its members read wherever they were told.
    db.from("stories").select("*").eq("tree_id", treeId),
    personIds.length
      ? db.from("stories").select("*").eq("status", "approved").in("person_id", personIds)
      : Promise.resolve({ data: [], error: null }),
    // Reports (Step 88.2): those raised here, and those on the tree's own
    // entries, which its Roots see wherever they were raised.
    db.from("entry_reports").select("*").eq("tree_id", treeId),
    db.from("entry_reports").select("*, people!inner(tree_id)").eq("people.tree_id", treeId),
    // The album (Step 88.5): who's in which photo, for anyone the tree
    // shows, and the photos added here.
    personIds.length
      ? db.from("album_tags").select("*").in("person_id", personIds)
      : Promise.resolve({ data: [], error: null }),
    db.from("album_photos").select("*").eq("tree_id", treeId),
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
    storiesHere,
    storiesOnPeople,
    reportsHere,
    reportsOnOwn,
    albumTags,
    albumHere,
    notifications,
    pets,
    petCompanions,
    petComments,
  ].find((r) => r.error)?.error;
  if (firstError) return { error: "Could not read every table. Try again." };

  const stories = [
    ...new Map(
      [...(storiesHere.data ?? []), ...(storiesOnPeople.data ?? [])].map(
        (s) => [s.id, s],
      ),
    ).values(),
  ];
  // Their comments (Step 88.4); not their public links, which are keys.
  const storyComments = stories.length
    ? await db
        .from("story_comments")
        .select("*")
        .in(
          "story_id",
          stories.map((s) => s.id),
        )
    : { data: [], error: null };
  if (storyComments.error) return { error: "Could not read every table. Try again." };
  // Who each is credited to (Step 99).
  const storyCredits = stories.length
    ? await db
        .from("story_credits")
        .select("*")
        .in(
          "story_id",
          stories.map((s) => s.id),
        )
    : { data: [], error: null };
  if (storyCredits.error) return { error: "Could not read every table. Try again." };

  // The photos they're in that were added on other trees.
  const here = new Set((albumHere.data ?? []).map((p) => p.id));
  const elsewhere = [
    ...new Set((albumTags.data ?? []).map((t) => t.photo_id).filter((id) => !here.has(id))),
  ];
  const albumElsewhere = elsewhere.length
    ? await db.from("album_photos").select("*").in("id", elsewhere)
    : { data: [], error: null };
  if (albumElsewhere.error) return { error: "Could not read every table. Try again." };

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
      stories,
      story_comments: storyComments.data ?? [],
      story_credits: storyCredits.data ?? [],
      entry_reports: [
        ...new Map(
          [
            ...(reportsHere.data ?? []),
            ...(reportsOnOwn.data ?? []).map(({ people: _home, ...r }) => r),
          ].map((r) => [r.id, r]),
        ).values(),
      ],
      album_photos: [...(albumHere.data ?? []), ...(albumElsewhere.data ?? [])],
      album_tags: albumTags.data ?? [],
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
 * Permanently remove a person entry, its relationship edges, stories and
 * album tags (via cascade), and its stored photo, story recordings and the
 * album photos nobody else is in (Step 88.5). A Root of the entry's home
 * tree may remove any entry — right-to-erasure requests come through here.
 * Since Step 22.3 a Branch or a Leaf may remove an unclaimed entry they
 * added, as long as nobody else has hung a connection, story, photo or
 * companion on it and no other tree shows it (`private.can_delete_person`,
 * enforced by the `people_delete` policy).
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

  // The album photos they're in and their stories' recordings, some of
  // which the viewer can't see (a photo or a story waiting on the person),
  // so the service role reads where they are (Step 90). Removed only once
  // the delete has gone through, and a photo only once nobody is in it.
  const db = createAdminClient();
  const album = await albumPhotosOf([personId]);
  const { data: recordings } = await db
    .from("stories")
    .select("audio_path")
    .eq("person_id", personId)
    .not("audio_path", "is", null);

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

  await removeUnusedAlbumPhotos(album ?? []);

  const audioPaths = (recordings ?? []).flatMap((r) =>
    r.audio_path ? [r.audio_path] : [],
  );
  if (audioPaths.length) await db.storage.from("stories").remove(audioPaths);

  revalidateTreePages();
  return {};
}

const NOT_YOURS_TO_DELETE =
  "Someone else has added to this entry — a connection, story, photo or companion — or another tree shows it, so only a Root can remove it now. Ask a Root.";

export type DeleteAccountInput = {
  /**
   * Per tree where the member is the only Root: who takes over as Root there
   * (Step 25). Keyed by tree id.
   */
  successors?: Record<string, string>;
};

/**
 * Permanently delete the signed-in member's own account (`deleteAccountOf`):
 * what they added stays, handed to a Root of each tree, and where they are
 * the only Root they name a successor, whom they make a Root themselves.
 */
export async function deleteAccount(
  input?: DeleteAccountInput | string,
): Promise<{ error?: string }> {
  await requireProfile();
  const user = await getSessionUser();
  if (!user) return { error: "You are not signed in." };

  // The pre-Step-25 form passed one successor for the one tree.
  const successors: Record<string, string> =
    typeof input === "string" ? { "*": input } : input?.successors ?? {};

  const supabase = await createClient();
  const { error } = await deleteAccountOf(user.id, successors, {
    kind: "self",
    promote: async (treeId, successorId) => {
      const { data, error } = await supabase.rpc("set_member_role", {
        p_tree: treeId,
        p_user: successorId,
        p_role: "admin",
      });
      return !error && data === "admin";
    },
  });
  if (error) return { error };

  await supabase.auth.signOut();
  revalidateTreePages();
  redirect("/?deleted=1");
}
