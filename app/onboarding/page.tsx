import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingSelfFlow } from "@/components/onboarding-self-flow";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { listTreeMembers } from "@/lib/tree";
import { requireTreeMember } from "@/lib/tree-context";
import { treeHref } from "@/lib/tree-links";

export const metadata: Metadata = {
  title: "find yourself",
  description:
    "Claim the entry a relative already added for you, or add your own.",
};

export default async function OnboardingPage() {
  const { tree, profile, type, isRoot } = await requireTreeMember();

  // Already on this tree: nothing to find. A member who has an entry on
  // another tree but not this one is placed here by the tree's Root, not by
  // adding themselves twice — so they are sent to the canvas as well.
  if (profile.self_person_id) {
    const supabase = await createClient();
    const { data: placed } = await supabase
      .from("tree_placements")
      .select("id")
      .eq("tree_id", tree.id)
      .eq("person_id", profile.self_person_id)
      .eq("status", "active")
      .maybeSingle();
    if (placed) redirect(treeHref());
  }

  const members = await listTreeMembers(tree.id);
  const hasOwnEntryElsewhere = !!profile.self_person_id;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {members.length === 0
            ? `${tree.name} is empty so far. Start it with your own entry.`
            : `Let’s find you on ${tree.name} — or add you to it.`}
        </p>
      </div>

      {hasOwnEntryElsewhere ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            You already have your own entry on another tree. A Root of{" "}
            {tree.name} can bring it onto this one from their admin page, so
            there is only ever one of you.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <OnboardingSelfFlow
              treeId={tree.id}
              isAdmin={isRoot}
              members={members}
              // A Leaf may add their own entry and nothing else (Step 18.2).
              selfOnly={!type.addRelatives}
            />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
