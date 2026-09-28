"use client";

import * as React from "react";

import { claimPerson } from "@/app/actions/claims";
import { ConfirmButton } from "@/components/confirm-dialog";
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
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || candidates.length === 0) return null;

  return (
    <div className="w-[calc(100vw-2rem)] max-w-72 rounded-xl sm:w-72 border border-border bg-card p-3 shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">Is one of these you?</p>
        <button
          type="button"
          className="relative tap-target text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setDismissed(true)}
        >
          Dismiss
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        These match your name. Claim yours and your own entry merges into it.
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
            <ConfirmButton
              size="sm"
              className="self-start"
              confirm={{
                // Several may be listed: the question names which.
                title: `Make ${c.name} your entry?`,
                description: notes.get(c.id),
                confirmLabel: "Yes, merge",
                pendingLabel: "Merging…",
                onConfirm: () => claimPerson(c.id),
                success: "Merged — this is now your entry.",
              }}
            >
              This is me
            </ConfirmButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
