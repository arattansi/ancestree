import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyTree } from "@/components/tree/family-tree";
import { LEAF } from "@/lib/account-types";
import { companionsShowing, MY_FAMILY_VIEW } from "@/lib/my-family";
import { loadMyFamily } from "@/lib/my-family.server";
import { getTreePets } from "@/lib/pets";
import { listMyTrees, requireTreeAccess } from "@/lib/tree-context";
import { treeHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "My Family Tree",
  description: "Everyone you're related to, from every tree you're on.",
};

/**
 * My Family Tree (Step 92.2): everyone the member is related to, gathered
 * from every tree they're a member of (`loadMyFamily`) and drawn on the
 * tree's own canvas, arranged around them. A view only: nothing is moved,
 * added or edited here yet — each card's actions come with Step 92.3, and
 * each acts on the card's own tree.
 */
export default async function MyFamilyPage() {
  // Signed out, or a member of no tree: wherever the canvas would send them.
  const access = await requireTreeAccess();
  const profile =
    access.kind === "member" ? access.membership.profile : access.visit.profile;
  const trees = await listMyTrees();
  // Their companions are read beside the people, from the same trees.
  const [family, pets] = await Promise.all([
    loadMyFamily(),
    getTreePets(trees.map((t) => t.id)),
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
        isAdmin={false}
        // Nothing is offered on the view that a type would decide.
        role={LEAF.key}
        spokenForIds={[]}
        claimCandidates={[]}
        panelSuggestions={[]}
        pets={companionsShowing(pets, shown)}
        family={{
          trees: family.trees.map(({ id, name, mark }) => ({ id, name, mark })),
          currentTreeId:
            access.kind === "member" ? access.membership.tree.id : null,
        }}
      />
    </main>
  );
}
