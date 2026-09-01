"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { claimSelfCandidate, findSelfCandidates } from "@/app/actions/onboarding";
import { AddPersonFlow } from "@/components/add-person-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TreeMemberOption } from "@/components/relationship-picker";
import {
  candidateSummary,
  canSearchName,
  matchConfidence,
  type SelfCandidate,
} from "@/lib/self-match";

type Step = "name" | "results" | "add";

/**
 * First-run onboarding (Step 15). A new member types just their name; we look
 * for an unclaimed entry a relative already added — tolerating misspellings —
 * so they can take ownership of it instead of creating a duplicate. Only if
 * nothing fits do they fill in the full add-yourself form.
 */
export function OnboardingSelfFlow({
  treeId,
  isAdmin,
  members,
}: {
  treeId: string;
  isAdmin: boolean;
  members: TreeMemberOption[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("name");
  const [first, setFirst] = React.useState("");
  const [last, setLast] = React.useState("");
  const [candidates, setCandidates] = React.useState<SelfCandidate[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onSearch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!canSearchName(first, last)) {
      setError("Enter both your first and last name.");
      return;
    }

    setSearching(true);
    const res = await findSelfCandidates(first, last);
    setSearching(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    setCandidates(res.candidates);
    setStep("results");
  }

  async function onClaim(candidate: SelfCandidate) {
    setError(null);
    setClaimingId(candidate.id);
    const res = await claimSelfCandidate(candidate.id, first, last);
    setClaimingId(null);

    if (res.error) {
      setError(res.error);
      return;
    }
    toast.success("Welcome back — that entry is yours now.");
    router.replace("/tree");
    router.refresh();
  }

  if (step === "add") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Add yourself</h2>
          <p className="text-sm text-muted-foreground">
            You&apos;ll pick how you connect to someone already on the tree — and
            can add any missing relatives in between.
          </p>
        </div>
        <AddPersonFlow
          mode="self"
          treeId={treeId}
          isAdmin={isAdmin}
          members={members}
          initialName={{ first_name: first, last_name: last }}
        />
        <button
          type="button"
          className="self-start text-sm text-muted-foreground underline underline-offset-2"
          onClick={() => setStep(candidates.length > 0 ? "results" : "name")}
        >
          Back to the search
        </button>
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
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{c.name}</span>
                    {matchConfidence(c.score) === "close" ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        close match
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {candidateSummary(c)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => onClaim(c)}
                  disabled={claimingId !== null}
                >
                  {claimingId === c.id ? "Claiming…" : "This is me"}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <Button
            variant={candidates.length > 0 ? "outline" : "default"}
            onClick={() => setStep("add")}
            disabled={claimingId !== null}
          >
            {candidates.length > 0
              ? "None of these are me — add me"
              : "Add myself to the tree"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setStep("name");
            }}
            disabled={claimingId !== null}
          >
            Change my name
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" className="self-start" disabled={searching}>
        {searching ? "Searching…" : "Search the tree"}
      </Button>
    </form>
  );
}
