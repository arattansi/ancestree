"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimPerson } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import type { ClaimCandidate } from "@/lib/claims";

/**
 * "Is this you?" prompt shown on the tree canvas when unclaimed entries match
 * the signed-in member's name. Claiming auto-approves (see `claim_person`).
 */
export function ClaimSuggestions({
  candidates,
}: {
  candidates: ClaimCandidate[];
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (dismissed || candidates.length === 0) return null;

  async function onClaim(id: string) {
    setBusyId(id);
    const res = await claimPerson(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Claimed — this is now your entry.");
    router.refresh();
  }

  return (
    <div className="w-72 rounded-xl border border-border bg-card p-3 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">Is one of these you?</p>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        These entries match your name. Claim yours to take ownership.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {candidates.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-1.5 rounded-md border border-border p-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[c.lifespan, c.birthplace].filter(Boolean).join(" · ") ||
                  "No other details"}
              </p>
            </div>
            <Button
              size="sm"
              className="self-start"
              onClick={() => onClaim(c.id)}
              disabled={busyId !== null}
            >
              {busyId === c.id ? "Claiming…" : "This is me"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
