"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  decideEntrySuggestion,
  withdrawEntrySuggestion,
} from "@/app/actions/suggestions";
import { SuggestionChanges } from "@/components/suggestion-changes";
import { Button } from "@/components/ui/button";
import {
  suggestionRows,
  type EntrySuggestion,
  type SuggestionColumns,
} from "@/lib/suggestions";
import { timeAgo } from "@/lib/time-ago";

/**
 * Suggested changes to this entry still waiting (Step 67). Someone who may
 * edit it sees everyone's, to accept or decline; whoever suggested one sees
 * their own, to withdraw. Nobody else sees any.
 */
export function EntrySuggestions({
  suggestions,
  entry,
}: {
  suggestions: EntrySuggestion[];
  /** The entry as it stands, to show what each would change. */
  entry: SuggestionColumns;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (suggestions.length === 0) return null;

  async function answer(id: string, accept: boolean) {
    setBusyId(id);
    const res = await decideEntrySuggestion(id, accept);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(accept ? "Accepted." : "Declined.");
  }

  async function withdraw(id: string) {
    setBusyId(id);
    const res = await withdrawEntrySuggestion(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Withdrawn.");
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="suggestions-heading"
    >
      <h2 id="suggestions-heading" className="text-sm font-semibold">
        Suggested changes
      </h2>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {s.mine ? "You" : s.suggesterName}
              </span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(s.createdAt)}
              </span>
            </div>
            <SuggestionChanges rows={suggestionRows(s.changes, entry)} />
            {s.note ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {s.note}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {s.mine ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === s.id}
                  onClick={() => withdraw(s.id)}
                >
                  Withdraw
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    disabled={busyId === s.id}
                    onClick={() => answer(s.id, true)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === s.id}
                    onClick={() => answer(s.id, false)}
                  >
                    Decline
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
