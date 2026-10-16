import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FirstTreeOnboarding } from "@/components/first-tree/first-tree-onboarding";
import { OnboardingSelfFlow } from "@/components/onboarding-self-flow";
import { PageColumn } from "@/components/page-column";
import { FormPageSkeleton } from "@/components/page-skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { namePrefill } from "@/lib/first-tree";
import { isFounder } from "@/lib/first-tree.server";
import { getBloodline } from "@/lib/growth-rights.server";
import { isPlacedOn } from "@/lib/placements.server";
import { onboardingStart } from "@/lib/self-match.server";
import { listTreeMembers } from "@/lib/tree";
import { currentAccess, requireTreeMember } from "@/lib/tree-context";
import { treeHref } from "@/lib/tree-links";
import { welcomeTitle } from "@/lib/welcome";

export async function generateMetadata(): Promise<Metadata> {
  const access = await currentAccess();
  if (access?.kind === "member" && isFounder(access.membership)) {
    return {
      title: "start your tree",
      description: "Add yourself and your closest family, then invite who'll help.",
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
  // through adding themselves and their close family, inviting and naming
  // it (Steps 29, 161), and they can come back to any step from the canvas.
  if (isFounder(membership)) {
    const { step } = await searchParams;
    const asked = typeof step === "string" ? step : undefined;
    // Each step reads behind its own boundary (Step 77.3): moving to
    // another shows its shape at once rather than leaving the last one up.
    return (
      <Suspense
        key={asked ?? ""}
        fallback={
          <FormPageSkeleton
            label="Loading the step…"
            // As wide as the step that shows: the family step, unless asked
            // for another (`FirstTreeOnboarding`).
            width={
              asked === "invite" ? "5xl" : asked === "name" ? undefined : "3xl"
            }
          />
        }
      >
        <FirstTreeOnboarding membership={membership} asked={asked} />
      </Suspense>
    );
  }

  const hasOwnEntryElsewhere = !!profile.self_person_id;
  // All asked for at once (Step 77.1). Already on this tree: nothing to
  // find. A member who has an entry on another tree but not this one is
  // placed here by the tree's Root, not by adding themselves twice — so they
  // are sent to the canvas as well. Any invite they accept brings it with
  // them (Steps 30.9 and 41.3), so the card below is for one a Root has
  // since taken off this tree. The bloodline lets the form warn of a missing
  // blood tie before submit (Step 55), and the name they joined by starts
  // the search below; someone with an entry elsewhere needs neither.
  const [placed, members, bloodline] = await Promise.all([
    profile.self_person_id
      ? isPlacedOn(tree.id, profile.self_person_id)
      : false,
    listTreeMembers(tree.id),
    hasOwnEntryElsewhere ? null : getBloodline(tree.id),
    hasOwnEntryElsewhere ? null : getUser(),
  ]);
  if (placed) redirect(treeHref());
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
    <PageColumn>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {/* "Welcome, Leila", as the welcome greets them next (Step 161). */}
          {welcomeTitle({
            first_name: namePrefill(profile.display_name).first_name,
          })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {/* Onboarding opens on adding themselves here (Step 30.7), and only a
              Root may add the first person. */}
          {members.length === 0
            ? isRoot
              ? `${tree.name} is empty so far. Start it with your own entry.`
              : `${tree.name} is empty so far. You can add yourself once whoever runs it has added the first person.`
            : `Let’s find you on ${tree.name} — or add you to it.`}
        </p>
      </div>

      {hasOwnEntryElsewhere ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            You already have your own entry on another tree. Whoever runs{" "}
            {tree.name} can bring it onto this one, so there is only ever one
            of you.
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
    </PageColumn>
  );
}
