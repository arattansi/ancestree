import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { FirstTreeOnboarding } from "@/components/first-tree/first-tree-onboarding";
import { OnboardingSelfFlow } from "@/components/onboarding-self-flow";
import { Card, CardContent } from "@/components/ui/card";
import { isFounder } from "@/lib/first-tree.server";
import { getBloodline } from "@/lib/growth-rights.server";
import { onboardingStart } from "@/lib/self-match.server";
import { createClient } from "@/lib/supabase/server";
import { listTreeMembers } from "@/lib/tree";
import { currentAccess, requireTreeMember } from "@/lib/tree-context";
import { treeHref } from "@/lib/tree-links";

export async function generateMetadata(): Promise<Metadata> {
  const access = await currentAccess();
  if (access?.kind === "member" && isFounder(access.membership)) {
    return {
      title: "start your tree",
      description: "Invite who'll help, add yourself and your closest family.",
    };
  }
  return {
    title: "find yourself",
    description:
      "Claim the entry a relative already added for you, or add your own.",
  };
}

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const membership = await requireTreeMember();
  const { tree, profile, isRoot } = membership;

  // The tree's founder has nobody to find: their first run walks them
  // through inviting, adding themselves, naming it and their close family
  // (Step 29), and they can come back to any step from the canvas.
  if (isFounder(membership)) {
    const { step } = await searchParams;
    return (
      <FirstTreeOnboarding
        membership={membership}
        asked={typeof step === "string" ? step : undefined}
      />
    );
  }

  // Already on this tree: nothing to find. A member who has an entry on
  // another tree but not this one is placed here by the tree's Root, not by
  // adding themselves twice — so they are sent to the canvas as well. Any
  // invite they accept brings it with them (Steps 30.9 and 41.3), so the
  // card below is for one a Root has since taken off this tree.
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

  const hasOwnEntryElsewhere = !!profile.self_person_id;
  // The bloodline lets the form warn of a missing blood tie before submit
  // (Step 55); someone with an entry elsewhere adds nobody here.
  const [members, bloodline] = await Promise.all([
    listTreeMembers(tree.id),
    hasOwnEntryElsewhere ? null : getBloodline(tree.id),
  ]);
  // The name they joined by, and the search for it, before the page renders:
  // it opens on what the search found, not an empty form (Step 30.7).
  const start = hasOwnEntryElsewhere
    ? null
    : await onboardingStart({
        treeId: tree.id,
        displayName: profile.display_name,
        treeHasEntries: members.length > 0,
      });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {/* Onboarding opens on adding themselves here (Step 30.7), and only a
              Root may add the first person. */}
          {members.length === 0
            ? isRoot
              ? `${tree.name} is empty so far. Start it with your own entry.`
              : `${tree.name} is empty so far. Once a Root has added the first person, you can add yourself.`
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
              start={start}
              bloodline={bloodline}
            />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
