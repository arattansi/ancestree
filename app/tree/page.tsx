import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FamilyTree } from "@/components/tree/family-tree";
import { Button } from "@/components/ui/button";
import { LEAF } from "@/lib/account-types";
import { getSpokenForEntryIds } from "@/lib/branch.server";
import { listClaimInvites } from "@/lib/claim-invites.server";
import { listClaimCandidates } from "@/lib/claims";
import { auditTreeConnections } from "@/lib/connection-suggestions.server";
import { getGettingStarted, isFounder } from "@/lib/first-tree.server";
import { getTreePets } from "@/lib/pets";
import {
  listOwnDeclinedSuggestions,
  listPendingSuggestions,
} from "@/lib/suggestions.server";
import {
  getRootEntryIds,
  getTreeAnchors,
  getTreeGraph,
  loadTreePeople,
  placedIds,
} from "@/lib/tree";
import { requireTreeAccess } from "@/lib/tree-context";
import { onboardingHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "family",
  description: "The family tree canvas.",
};

export default async function TreePage() {
  const access = await requireTreeAccess();

  // A visitor (Step 25.4): the canvas, read-only, with hidden entries blurred.
  if (access.kind === "visitor") {
    const { tree } = access.visit;
    const [{ people, relationships }, anchorIds, pets] = await Promise.all([
      getTreeGraph(tree.id),
      getTreeAnchors(tree.id),
      getTreePets(tree.id),
    ]);
    return (
      <main className="flex flex-1 flex-col">
        <FamilyTree
          // One canvas per tree: a switch that doesn't remount the page
          // mustn't carry the camera or who's open across (Step 77.3).
          key={tree.id}
          people={people}
          relationships={relationships}
          treeId={tree.id}
          treeSlug={tree.slug}
          selfPersonId={access.visit.profile.self_person_id}
          anchorIds={anchorIds}
          rootIds={[]}
          currentUserId={access.visit.profile.auth_user_id}
          isAdmin={false}
          // Read-only, so the type offers nothing; the narrowest all the same.
          role={LEAF.key}
          spokenForIds={[]}
          claimCandidates={[]}
          panelSuggestions={[]}
          pets={pets}
          readOnly
          visitorNote={`You’re viewing ${tree.name} from another tree: read-only, and some entries may be hidden.`}
        />
      </main>
    );
  }

  const { tree, profile, role, isRoot } = access.membership;

  // Their own entry has to be on this tree before they work on it.
  const selfPersonId = profile.self_person_id;
  if (!selfPersonId) redirect(onboardingHref());

  // Everything the canvas needs is asked for at once (Step 77.1); what reads
  // the same rows shares one read of them. Whether their entry is on this
  // tree is read off the tree's own people, and decided once all is in.
  const graph = getTreeGraph(tree.id, undefined, { withAccountTypes: true });
  const [
    placedPeople,
    { people, relationships },
    claimCandidates,
    panelSuggestions,
    anchorIds,
    rootIds,
    pets,
    spokenFor,
    claimInvites,
    changeSuggestions,
    declinedSuggestions,
    gettingStarted,
  ] = await Promise.all([
    loadTreePeople(tree.id),
    graph,
    listClaimCandidates(),
    auditTreeConnections(tree.id),
    getTreeAnchors(tree.id),
    getRootEntryIds(tree.id),
    getTreePets(tree.id),
    getSpokenForEntryIds(profile.auth_user_id, tree.id),
    // Who has invited whom to claim their entry, for the cards (Step 38).
    listClaimInvites(tree.id, { userId: profile.auth_user_id, isRoot }),
    // Suggested changes waiting on an answer (Step 67), and the viewer's
    // own that were declined (Step 72).
    listPendingSuggestions(profile.auth_user_id),
    listOwnDeclinedSuggestions(profile.auth_user_id),
    // The founder's "Getting started" list (Step 29), off the same graph.
    isFounder(access.membership)
      ? getGettingStarted(
          access.membership,
          graph.then((g) => g.relationships),
        )
      : null,
  ]);
  if (!placedIds(placedPeople).includes(selfPersonId)) {
    redirect(onboardingHref());
  }
  // Only this canvas's: a suggestion can be on an entry on another tree.
  const shown = new Set(people.map((p) => p.id));

  if (people.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">The tree is empty</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add yourself first, then connect relatives to build out the tree.
        </p>
        <Button nativeButton={false} render={<Link href={onboardingHref()} />}>
          Add yourself
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <FamilyTree
        // One canvas per tree (Step 77.3), as above.
        key={tree.id}
        people={people}
        relationships={relationships}
        treeId={tree.id}
        treeSlug={tree.slug}
        selfPersonId={selfPersonId}
        anchorIds={anchorIds}
        rootIds={rootIds}
        currentUserId={profile.auth_user_id}
        isAdmin={isRoot}
        role={role}
        spokenForIds={[...spokenFor]}
        claimCandidates={claimCandidates}
        panelSuggestions={panelSuggestions}
        pets={pets}
        gettingStarted={gettingStarted}
        claimInvites={claimInvites}
        changeSuggestions={changeSuggestions.filter((s) =>
          shown.has(s.personId),
        )}
        declinedSuggestions={declinedSuggestions.filter((s) =>
          shown.has(s.personId),
        )}
      />
    </main>
  );
}
