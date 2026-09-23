import Link from "next/link";
import { redirect } from "next/navigation";

import { AddPersonFlow } from "@/components/add-person-flow";
import { BringYourself } from "@/components/first-tree/bring-yourself";
import { FamilyStep } from "@/components/first-tree/family-step";
import { FirstTreeProgress } from "@/components/first-tree/first-tree-progress";
import { InviteStep } from "@/components/first-tree/invite-step";
import { NameStep } from "@/components/first-tree/name-step";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  isFirstTreeStep,
  namePrefill,
  openingStep,
  reachableStep,
  stepAfter,
  type FirstTreeState,
  type FirstTreeStep,
} from "@/lib/first-tree";
import { loadFirstTree } from "@/lib/first-tree.server";
import type { TreeMembership } from "@/lib/tree-context";
import { onboardingStepHref, treeHref } from "@/lib/tree-links";
import { suggestedTreeName } from "@/lib/tree-names";

/** Where a step's Continue goes: the next step, or the canvas after the last. */
function hrefAfter(step: FirstTreeStep, state: FirstTreeState): string {
  const next = stepAfter(step, state);
  return next ? onboardingStepHref(next) : treeHref();
}

/**
 * A founder's first run on the tree they've just started (Step 29), one
 * step at a time: invite who'll help (which is where the account types are
 * introduced), their own entry, the tree's name, then their close family.
 * Everything but their own entry can be skipped; the canvas's "Getting
 * started" list keeps what's left.
 */
export async function FirstTreeOnboarding({
  membership,
  asked,
}: {
  membership: TreeMembership;
  /** `?step=` from the address; anything else opens where they left off. */
  asked?: string;
}) {
  const { tree, profile } = membership;
  const data = await loadFirstTree(membership);
  const { state, founder } = data;
  // Always on a step's own address, so a refresh after sending an invite
  // or adding someone stays on that step rather than re-picking where to
  // open — sending an invite would otherwise jump straight on to `you`.
  if (!isFirstTreeStep(asked)) redirect(onboardingStepHref(openingStep(state)));
  const step = reachableStep(asked, state);
  const next = hrefAfter(step, state);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <FirstTreeProgress current={step} state={state} />

      {step === "invite" ? (
        <>
          <StepHeading
            eyebrow="Your tree is planted"
            title="Build It Together"
            lead="The people who know your family best can help it grow. Everyone you invite joins with an account type, which decides what they can do on the tree."
          />
          <InviteStep
            treeId={tree.id}
            invites={data.invites}
            founderEntry={
              state.selfPlaced ? "here" : founder ? "elsewhere" : "none"
            }
            nextHref={next}
          />
        </>
      ) : null}

      {step === "you" ? (
        <>
          <StepHeading
            title="Start With You"
            lead={
              founder && !founder.placedHere
                ? `You already have an entry${founder.homeTreeName ? ` on ${founder.homeTreeName}` : ""}. Bring it across: it stays one entry, shown on both trees, so a change to your details shows on both.`
                : "Your entry is where the tree grows from: everyone you add connects back to you."
            }
          />
          {founder?.placedHere ? (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {founder.name}
                  </span>{" "}
                  is on {tree.name}.
                </p>
                <Button nativeButton={false} render={<Link href={next} />}>
                  Continue
                </Button>
              </CardContent>
            </Card>
          ) : founder ? (
            <BringYourself
              treeId={tree.id}
              treeName={tree.name}
              entry={founder}
              nextHref={hrefAfter("you", { ...state, selfPlaced: true })}
            />
          ) : (
            <Card>
              <CardContent>
                <AddPersonFlow
                  mode="self"
                  treeId={tree.id}
                  isAdmin
                  members={[]}
                  initialName={namePrefill(profile.display_name)}
                  doneHref={hrefAfter("you", { ...state, selfPlaced: true })}
                />
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {step === "name" ? (
        <>
          <StepHeading
            title="Name Your Tree"
            lead="Everyone you invite sees it, so call it what your family calls itself. You can change it any time from the admin view of your account."
          />
          <NameStep
            treeId={tree.id}
            initialName={
              state.defaultName
                ? (suggestedTreeName(
                    { maidenName: founder?.maidenName, lastName: founder?.lastName },
                    data.otherTreeNames,
                  ) ?? tree.name)
                : tree.name
            }
            currentName={tree.name}
            nextHref={next}
          />
        </>
      ) : null}

      {step === "family" && founder ? (
        <>
          <StepHeading
            title="Your Closest Family"
            lead="Start with the people around you. Each one takes their place on the tree as you add them — everyone else you can add from the tree itself."
          />
          <FamilyStep
            treeId={tree.id}
            founder={founder}
            family={data.family}
            bring={data.bring}
            waiting={data.waiting}
            doneHref={next}
          />
        </>
      ) : null}

      {state.selfPlaced && step !== "family" ? (
        <p className="text-sm text-muted-foreground">
          <Link href={treeHref()} className="underline underline-offset-4">
            Go to your tree
          </Link>{" "}
          — the rest can wait.
        </p>
      ) : null}
    </main>
  );
}

function StepHeading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: string;
  lead: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {eyebrow ? (
        <p className="text-sm font-medium text-canopy">{eyebrow}</p>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{lead}</p>
    </div>
  );
}
