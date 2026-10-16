import Link from "next/link";
import { redirect } from "next/navigation";

import { AddPersonFlow } from "@/components/add-person-flow";
import { BringYourself } from "@/components/first-tree/bring-yourself";
import { FamilyStep } from "@/components/first-tree/family-step";
import { FirstTreeProgress } from "@/components/first-tree/first-tree-progress";
import { InviteStep } from "@/components/first-tree/invite-step";
import { NameStep } from "@/components/first-tree/name-step";
import { PageColumn } from "@/components/page-column";
import {
  isFirstTreeStep,
  namePrefill,
  openingStep,
  reachableStep,
  stepAfter,
  stepFromAddress,
  type FirstTreeStep,
} from "@/lib/first-tree";
import { loadFirstTree, loadInviteStep } from "@/lib/first-tree.server";
import { getSiteUrl } from "@/lib/site-url";
import type { TreeMembership } from "@/lib/tree-context";
import { onboardingStepHref, plantedFamilyHref } from "@/lib/tree-links";
import { suggestedTreeName } from "@/lib/tree-names";

/**
 * Where a step's Continue goes: the next step, or after the last My Family
 * Tree (Step 169), their own leaves, which offers to invite family onto the
 * tree they've just planted.
 */
function hrefAfter(step: FirstTreeStep, treeId: string): string {
  const next = stepAfter(step);
  return next ? onboardingStepHref(next) : plantedFamilyHref(treeId);
}

/**
 * A founder's first run on the tree they've just started (Step 29), one
 * step at a time: themselves and their close family on one screen (Step
 * 161), who'll help (which is where the account types are introduced),
 * then the tree's name (Step 124). It ends on My Family Tree, their own
 * leaves (Step 169). Everything but their own entry can be skipped; the
 * "Getting started" list there and on the canvas keeps what's left.
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
  // The invite step's lists are read beside the rest when it's the step
  // asked for, which is always the step shown (Step 162).
  const [data, inviting] = await Promise.all([
    loadFirstTree(membership, { withBring: isFirstTreeStep(asked) }),
    asked === "invite" ? loadInviteStep(membership) : null,
  ]);
  const { state, founder } = data;
  // Always on a step's own address, so a refresh after sending an invite
  // or adding someone stays on that step rather than re-picking where to
  // open — sending an invite would otherwise jump straight back to family.
  // `?step=you`, from before Step 161, is the family step now.
  const wanted = stepFromAddress(asked);
  if (!wanted || wanted !== asked) {
    redirect(onboardingStepHref(wanted ?? openingStep(state)));
  }
  const step = reachableStep(wanted, state);
  const next = hrefAfter(step, tree.id);
  // Adding themselves, or bringing their entry across, stays on the family
  // step: its other places open once they're in.
  const familyHref = onboardingStepHref("family");

  return (
    // The invite step is wider, for "Who Can Do What" beside its form; the
    // family step, for its little tree with the founder's form in the middle.
    <PageColumn
      width={step === "invite" ? "5xl" : step === "family" ? "3xl" : undefined}
    >
      <FirstTreeProgress current={step} state={state} />

      {step === "family" ? (
        <>
          <StepHeading
            // True once there's a tree on the screen to say it of.
            eyebrow={state.selfPlaced ? undefined : "Your tree is planted"}
            title="Your Closest Family"
            lead={
              state.selfPlaced
                ? "Start with the people closest to you."
                : founder
                  ? `You already have an entry${founder.homeTreeName ? ` on ${founder.homeTreeName}` : ""}. Bring it across — it stays one entry on both trees.`
                  : "Start with you."
            }
          />
          <FamilyStep
            treeId={tree.id}
            founder={founder}
            addYourself={
              founder ? (
                <BringYourself
                  treeId={tree.id}
                  treeName={tree.name}
                  entry={founder}
                  nextHref={familyHref}
                />
              ) : (
                <AddPersonFlow
                  mode="self"
                  treeId={tree.id}
                  isAdmin
                  members={[]}
                  initialName={namePrefill(profile.display_name)}
                  doneHref={familyHref}
                />
              )
            }
            family={data.family}
            bring={data.bring}
            doneHref={next}
          />
        </>
      ) : null}

      {step === "invite" ? (
        <>
          <StepHeading
            title="Build It Together"
            lead="Invite the relatives who know your family best."
          />
          <InviteStep
            treeId={tree.id}
            treeName={tree.name}
            invites={data.invites}
            invited={state.invited}
            added={inviting?.added ?? []}
            familyLink={inviting?.familyLink ?? null}
            baseUrl={getSiteUrl()}
            nextHref={next}
          />
        </>
      ) : null}

      {step === "name" ? (
        <>
          <StepHeading
            title="Name Your Tree"
            lead="You can change it later."
          />
          <NameStep
            treeId={tree.id}
            // Named as the founder added themselves (Step 168); a tree still
            // on its default name, which nothing gave a family name, is
            // offered one here.
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

      {/* Not on the last step, whose own button opens the tree. Where the
          run ends, as the last step's button does (Step 169). */}
      {state.selfPlaced && stepAfter(step) ? (
        <p className="text-sm text-muted-foreground">
          <Link
            href={plantedFamilyHref(tree.id)}
            className="underline underline-offset-4"
          >
            Go to your tree
          </Link>{" "}
          — the rest can wait.
        </p>
      ) : null}
    </PageColumn>
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
