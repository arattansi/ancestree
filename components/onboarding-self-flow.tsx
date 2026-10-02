"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { claimSelfCandidate, findSelfCandidates } from "@/app/actions/onboarding";
import { AddPersonFlow } from "@/components/add-person-flow";
import { CandidateRow } from "@/components/candidate-row";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TreeMemberOption } from "@/components/relationship-picker";
import { useAction } from "@/components/use-action";
import type { Bloodline } from "@/lib/bloodline";
import { welcomeHref } from "@/lib/tree-links";
import {
  canSearchName,
  type OnboardingStart,
  type SelfCandidate,
} from "@/lib/self-match";

type Step = OnboardingStart["step"];

const ASK_NAME: OnboardingStart = {
  name: { first_name: "", last_name: "" },
  step: "name",
  candidates: [],
};

/**
 * First-run onboarding (Step 15). A new member types just their name; we look
 * for an unclaimed entry a relative already added — tolerating misspellings —
 * so they can take ownership of it instead of creating a duplicate. Only if
 * nothing fits do they fill in the full add-yourself form. When we already
 * know their name, the page has searched for it and the flow opens on what
 * it found (Step 30.7).
 */
export function OnboardingSelfFlow({
  treeId,
  isAdmin,
  members,
  start,
  bloodline = null,
}: {
  treeId: string;
  isAdmin: boolean;
  members: TreeMemberOption[];
  /** Where to open (`onboardingStart`); without it, on an empty name form. */
  start?: OnboardingStart | null;
  /** For the add form's blood-tie warning (Step 55). */
  bloodline?: Bloodline | null;
}) {
  const router = useRouter();
  const initial = start ?? ASK_NAME;
  const [step, setStep] = React.useState<Step>(initial.step);
  const [first, setFirst] = React.useState(initial.name.first_name);
  const [last, setLast] = React.useState(initial.name.last_name);
  const [candidates, setCandidates] = React.useState<SelfCandidate[]>(
    initial.candidates,
  );
  // The search and the claims are steps apart, so one handle; what goes
  // wrong shows on the step, by its buttons.
  const action = useAction({ inline: true });
  const error = action.error;

  function onSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!canSearchName(first, last)) {
      action.setError("Enter both your first and last name.");
      return;
    }
    action.run("search", () => findSelfCandidates(treeId, first, last), {
      onSuccess: (res) => {
        setCandidates(res.candidates);
        setStep("results");
      },
    });
  }

  function onClaim(candidate: SelfCandidate) {
    action.run(
      `claim:${candidate.id}`,
      () => claimSelfCandidate(treeId, candidate.id, first, last),
      {
        // A relative made it, so the welcome asks for what's missing (Step
        // 50). Busy until it's there.
        onSuccess: () => router.replace(welcomeHref()),
      },
    );
  }

  if (step === "add") {
    // A tree nobody is on yet opens here (Step 30.7): there's no one to
    // connect to, and nothing to search.
    const treeIsEmpty = members.length === 0;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-semibold">Add yourself</h2>
        <AddPersonFlow
          mode="self"
          treeId={treeId}
          isAdmin={isAdmin}
          members={members}
          initialName={{ first_name: first, last_name: last }}
          bloodline={bloodline}
        />
        {treeIsEmpty ? null : (
          <button
            type="button"
            className="self-start text-sm text-muted-foreground underline underline-offset-2"
            onClick={() => setStep(candidates.length > 0 ? "results" : "name")}
          >
            Back to the search
          </button>
        )}
      </div>
    );
  }

  if (step === "results") {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">
            {candidates.length > 0
              ? "Is one of these you?"
              : "We couldn't find you on the tree"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {candidates.length > 0
              ? "These entries were added by relatives and nobody has claimed them yet. Claiming one makes it your entry."
              : `Nothing on the tree matches "${first} ${last}" closely enough. Add yourself and connect to a relative instead.`}
          </p>
        </div>

        {candidates.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {candidates.map((c) => (
              <CandidateRow key={c.id} candidate={c}>
                <PendingButton
                  size="sm"
                  onClick={() => onClaim(c)}
                  pending={action.pendingKey === `claim:${c.id}`}
                  disabled={action.pending}
                  pendingLabel="claiming…"
                >
                  this is me
                </PendingButton>
              </CandidateRow>
            ))}
          </ul>
        ) : null}

        <FormError>{error}</FormError>

        <div className="flex flex-wrap gap-3">
          <Button
            variant={candidates.length > 0 ? "outline" : "default"}
            onClick={() => setStep("add")}
            disabled={action.pending}
          >
            {candidates.length > 0
              ? "none of these are me — add me"
              : "add myself to the tree"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              action.setError(null);
              setStep("name");
            }}
            disabled={action.pending}
          >
            change my name
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSearch} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">What&apos;s your name?</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ll check whether a relative has already added you. Spelling
          doesn&apos;t have to be exact.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-first">First name</Label>
          <Input
            id="onboarding-first"
            autoComplete="given-name"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="onboarding-last">Last name</Label>
          <Input
            id="onboarding-last"
            autoComplete="family-name"
            value={last}
            onChange={(e) => setLast(e.target.value)}
          />
        </div>
      </div>

      <FormError>{error}</FormError>

      <PendingButton
        type="submit"
        className="self-start"
        pending={action.pending}
        pendingLabel="searching…"
      >
        search the tree
      </PendingButton>
    </form>
  );
}
