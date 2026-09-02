import type { Metadata } from "next";
import Link from "next/link";

import { FamilyTree } from "@/components/tree/family-tree";
import { Button } from "@/components/ui/button";
import { getUser, requireSelfPerson } from "@/lib/auth";
import { listClaimCandidates, listNotifications } from "@/lib/claims";
import { listPanelSuggestions } from "@/lib/connection-suggestions.server";
import { getSharedTree, getTreeAnchors, getTreeGraph } from "@/lib/tree";

export const metadata: Metadata = {
  title: "Family tree",
  description: "The shared family tree canvas.",
};

export default async function TreePage() {
  const profile = await requireSelfPerson();
  const user = await getUser();
  const tree = await getSharedTree();

  if (!tree || !user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">No tree yet</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          An admin needs to set up the shared tree before it can be viewed.
        </p>
        <Button nativeButton={false} render={<Link href="/onboarding" />}>
          Get started
        </Button>
      </main>
    );
  }

  const [
    { people, relationships },
    claimCandidates,
    panelSuggestions,
    anchorIds,
    notifications,
  ] = await Promise.all([
    getTreeGraph(tree.id),
    listClaimCandidates(),
    listPanelSuggestions(tree.id, user.id, profile.role === "admin"),
    getTreeAnchors(),
    listNotifications(user.id),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      <FamilyTree
        people={people}
        relationships={relationships}
        treeId={tree.id}
        selfPersonId={profile.self_person_id}
        anchorIds={anchorIds}
        currentUserId={user.id}
        isAdmin={profile.role === "admin"}
        claimCandidates={claimCandidates}
        panelSuggestions={panelSuggestions}
        notifications={notifications}
      />
    </main>
  );
}
