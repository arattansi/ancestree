"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimPerson } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import type { ClaimCandidate } from "@/lib/claims";

/**
 * "Is this you?" prompt shown on the tree canvas when unclaimed entries match
 * the signed-in member's name. Claiming auto-approves and merges the entry the
 * member added for themselves into the one they pick (see `claim_person`), so
 * the list only comes while theirs is a placeholder nobody else has built on,
 * and "This is me" asks first, naming who moves (Step 36).
 */
export function ClaimSuggestions({
  candidates,
  notes,
}: {
  candidates: ClaimCandidate[];
  /** What claiming each candidate moves, by id (`mergeConfirmation`). */
  notes: ReadonlyMap<string, string>;
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState(false);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
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
    setConfirmingId(null);
    toast.success("Merged — this is now your entry.");
    router.refresh();
  }

  return (
    <div className="w-[calc(100vw-2rem)] max-w-72 rounded-xl sm:w-72 border border-border bg-card p-3 shadow-md">
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
        These entries match your name. If one is you, claim it and the entry
        you added for yourself merges into it.
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
            {confirmingId === c.id ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {notes.get(c.id)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onClaim(c.id)}
                    disabled={busyId !== null}
                  >
                    {busyId === c.id ? "Merging…" : "Yes, merge"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingId(null)}
                    disabled={busyId !== null}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button
                size="sm"
                className="self-start"
                onClick={() => setConfirmingId(c.id)}
                disabled={busyId !== null}
              >
                This is me
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
