import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FamilyTree } from "@/components/tree/family-tree";
import { Button } from "@/components/ui/button";
import { getSpokenForEntryIds } from "@/lib/branch.server";
import { listClaimCandidates } from "@/lib/claims";
import { auditTreeConnections } from "@/lib/connection-suggestions.server";
import { getTreePets } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";
import { getRootEntryIds, getTreeAnchors, getTreeGraph } from "@/lib/tree";
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
          people={people}
          relationships={relationships}
          treeId={tree.id}
          treeSlug={tree.slug}
          selfPersonId={access.visit.profile.self_person_id}
          anchorIds={anchorIds}
          rootIds={[]}
          currentUserId={access.visit.profile.auth_user_id}
          isAdmin={false}
          role="leaf"
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
  if (!profile.self_person_id) redirect(onboardingHref());
  const supabase = await createClient();
  const { data: placed } = await supabase
    .from("tree_placements")
    .select("id")
    .eq("tree_id", tree.id)
    .eq("person_id", profile.self_person_id)
    .eq("status", "active")
    .maybeSingle();
  if (!placed) redirect(onboardingHref());

  const [
    { people, relationships },
    claimCandidates,
    panelSuggestions,
    anchorIds,
    rootIds,
    pets,
    spokenFor,
  ] = await Promise.all([
    getTreeGraph(tree.id, undefined, { withAccountTypes: true }),
    listClaimCandidates(),
    auditTreeConnections(tree.id),
    getTreeAnchors(tree.id),
    getRootEntryIds(tree.id),
    getTreePets(tree.id),
    getSpokenForEntryIds(profile.auth_user_id),
  ]);

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
        people={people}
        relationships={relationships}
        treeId={tree.id}
        treeSlug={tree.slug}
        selfPersonId={profile.self_person_id}
        anchorIds={anchorIds}
        rootIds={rootIds}
        currentUserId={profile.auth_user_id}
        isAdmin={isRoot}
        role={role}
        spokenForIds={[...spokenFor]}
        claimCandidates={claimCandidates}
        panelSuggestions={panelSuggestions}
        pets={pets}
      />
    </main>
  );
}
