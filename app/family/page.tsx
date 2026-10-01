import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyTree } from "@/components/tree/family-tree";
import { LEAF } from "@/lib/account-types";
import { getProfile } from "@/lib/auth";
import { readCurrentTreeId } from "@/lib/current-tree.server";
import { companionsShowing, MY_FAMILY_VIEW } from "@/lib/my-family";
import { loadMyFamily } from "@/lib/my-family.server";
import { getTreePets } from "@/lib/pets";
import {
  listOwnDeclinedSuggestions,
  listPendingSuggestions,
} from "@/lib/suggestions.server";
import { listMyTrees, requireTreeAccess } from "@/lib/tree-context";
import { treeHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "My Family Tree",
  description: "Everyone you're related to, from every tree you're on.",
};

/**
 * My Family Tree (Step 92.2): everyone the member is related to, gathered
 * from every tree they're a member of (`loadMyFamily`) and drawn on the
 * tree's own canvas, arranged around them. A view only: nothing is moved
 * or added on it. Each card's actions (Step 92.3) go to the card's own
 * tree, as who the member is there; adding goes to the tree they pick.
 *
 * Where a member lands, every visit (Step 92.5): signing in, the mark and
 * the home page come here.
 */
export default async function MyFamilyPage() {
  // Read together (Step 77.1); which tree is shown by default isn't asked,
  // since the view needs only the one switched to this visit, if any.
  const [profile, trees, chosenId] = await Promise.all([
    getProfile(),
    listMyTrees(),
    readCurrentTreeId(),
  ]);
  if (!profile?.self_person_id || trees.length === 0) {
    // Signed out, not a member yet, on no tree (unless visiting one), or
    // nothing of their own to arrange it around: wherever the canvas would
    // send them. The canvas never sends anyone here, so this can't loop.
    await requireTreeAccess();
    redirect(treeHref());
  }
  // Links to a tree switch to it unless it's the one switched to this visit
  // (`TreeTarget`), so going to a tree from here holds for the visit too.
  const currentTreeId = trees.some((t) => t.id === chosenId) ? chosenId : null;
  // Their companions are read beside the people, from the same trees, and
  // the suggested changes they can see (Step 67) as a tree's canvas reads
  // them: waiting ones to answer or their own, and their own declined.
  const [family, pets, changeSuggestions, declinedSuggestions] =
    await Promise.all([
      loadMyFamily(),
      getTreePets(trees.map((t) => t.id)),
      listPendingSuggestions(profile.auth_user_id),
      listOwnDeclinedSuggestions(profile.auth_user_id),
    ]);
  // Nothing to arrange it around yet (no entry of their own, or on none of
  // their trees): the canvas sends them where they'd add it.
  if (!family) redirect(treeHref());

  const shown = new Set(family.people.map((p) => p.id));
  return (
    <main className="flex flex-1 flex-col">
      <FamilyTree
        key={MY_FAMILY_VIEW}
        people={family.people}
        relationships={family.relationships}
        treeId={MY_FAMILY_VIEW}
        treeSlug=""
        selfPersonId={family.selfId}
        // Always arranged around them (Step 92).
        anchorIds={[family.selfId]}
        rootIds={[]}
        currentUserId={profile.auth_user_id}
        // Who they are is decided per card, on its own tree (`family`).
        isAdmin={false}
        role={LEAF.key}
        spokenForIds={family.spokenForIds}
        // No "This is me" here, nor a tree's implied connections.
        claimCandidates={[]}
        panelSuggestions={[]}
        pets={companionsShowing(pets, shown)}
        changeSuggestions={changeSuggestions.filter((s) =>
          shown.has(s.personId),
        )}
        declinedSuggestions={declinedSuggestions.filter((s) =>
          shown.has(s.personId),
        )}
        family={{
          trees: family.trees.map(({ id, name, mark, role, reach }) => ({
            id,
            name,
            mark,
            role,
            reach,
          })),
          currentTreeId,
          // Asked of the viewer only, here (Step 92.4).
          samePeople: family.samePeople,
        }}
      />
    </main>
  );
}
