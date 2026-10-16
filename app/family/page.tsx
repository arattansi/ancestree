import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FamilyTree } from "@/components/tree/family-tree";
import { LEAF } from "@/lib/account-types";
import { getProfile } from "@/lib/auth";
import { readCurrentTreeId } from "@/lib/current-tree.server";
import {
  foundedCurrentTree,
  getFamilyGettingStarted,
} from "@/lib/first-tree.server";
import { companionsShowing, MY_FAMILY_VIEW } from "@/lib/my-family";
import { loadMyFamily } from "@/lib/my-family.server";
import { getTreePets } from "@/lib/pets";
import {
  listOwnDeclinedSuggestions,
  listPendingSuggestions,
} from "@/lib/suggestions.server";
import { listMyTrees, requireTreeAccess } from "@/lib/tree-context";
import { treeCanvasHref, treeHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "My Family Tree",
  description: "Your blood relatives, and who married in, from every tree you're on.",
};

/**
 * My Family Tree (Step 92.2): the member's own family tree — their blood
 * relatives, and whoever married in as pills (Step 94) — gathered from
 * every tree they're a member of (`loadMyFamily`) and drawn on the
 * tree's own canvas, arranged around them. A view only: nothing is moved
 * or added on it. Each card's actions (Step 92.3) go to the card's own
 * tree, as who the member is there; adding goes to the tree they pick.
 *
 * Where a member lands, every visit (Step 92.5): signing in, the mark and
 * the home page come here. So does joining a tree (Step 131), with
 * `?joined=` naming it for the view to offer, and the end of a founder's
 * first run (Step 169), with `?planted=` naming the tree they've started;
 * the "Getting started" list of the tree they're looking at shows here as
 * on its canvas, a founder's (Step 169) or a joiner's (Step 170).
 */
export default async function MyFamilyPage({
  searchParams,
}: PageProps<"/family">) {
  // Read together (Step 77.1); which tree is shown by default isn't asked,
  // since the view needs only the one switched to this visit, if any.
  const [profile, trees, chosenId, { joined, planted }] = await Promise.all([
    getProfile(),
    listMyTrees(),
    readCurrentTreeId(),
    searchParams,
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
  // them: waiting ones to answer or their own, and their own declined. And
  // the "Getting started" list of the tree they're looking at: what's left
  // of its first run, for its founder (Step 169), or their next steps, for
  // a member who joined it (Step 170).
  const familyGraph = loadMyFamily();
  const [
    family,
    pets,
    changeSuggestions,
    declinedSuggestions,
    own,
    gettingStarted,
  ] = await Promise.all([
    familyGraph,
    getTreePets(trees.map((t) => t.id)),
    listPendingSuggestions(profile.auth_user_id),
    listOwnDeclinedSuggestions(profile.auth_user_id),
    foundedCurrentTree(trees),
    getFamilyGettingStarted(familyGraph),
  ]);
  // Nothing to arrange it around yet (no entry of their own, or on none of
  // their trees): the canvas sends them where they'd add it. The canvas
  // itself, since a bare /tree with nothing picked comes back here.
  if (!family) redirect(treeCanvasHref());

  // The tree they've just joined (Step 131: the welcome, onboarding and an
  // accepted invite land here), when it's one of theirs.
  const joinedTree =
    typeof joined === "string"
      ? (family.trees.find((t) => t.id === joined) ?? null)
      : null;

  // The tree a founder's first run has just ended on (Step 169): theirs,
  // and the one the run's links go to.
  const plantedTree =
    own && planted === own.tree.id
      ? (trees.find((t) => t.id === own.tree.id) ?? null)
      : null;

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
        gettingStarted={gettingStarted}
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
          // Pills, not cards (Step 94), but their spouse a card (94.1).
          marriedIn: family.marriedIn,
          spouseIds: family.spouseIds,
          // Just joined (Step 131): the view offers that tree.
          joined: joinedTree
            ? { id: joinedTree.id, name: joinedTree.name }
            : null,
          // Just planted (Step 169): how big it is, and invite family.
          planted: plantedTree
            ? {
                id: plantedTree.id,
                name: plantedTree.name,
                people: plantedTree.personCount,
              }
            : null,
        }}
      />
    </main>
  );
}
