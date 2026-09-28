"use client";

import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";

import {
  dismissEntrySuggestion,
  withdrawEntrySuggestion,
} from "@/app/actions/suggestions";
import { SuggestionAnswer } from "@/components/suggestion-answer";
import { SuggestionChanges } from "@/components/suggestion-changes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  answeredLine,
  suggestionRows,
  type DeclinedSuggestion,
  type EntrySuggestion,
  type SuggestionColumns,
} from "@/lib/suggestions";
import { timeAgo } from "@/lib/time-ago";
import { suggestChangeHref } from "@/lib/tree-links";

/**
 * Suggested changes to this entry still waiting (Step 67). Someone who may
 * edit it sees everyone's, to accept or decline; whoever suggested one sees
 * their own, to withdraw, and after them the ones of theirs that were
 * declined, with why, to edit and resend (Step 72) or dismiss (Step 73).
 * Nobody else sees any.
 */
export function EntrySuggestions({
  suggestions,
  declined = [],
  entry,
}: {
  suggestions: EntrySuggestion[];
  /** The viewer's own that were declined, newest first. */
  declined?: DeclinedSuggestion[];
  /** The entry as it stands, to show what each would change. */
  entry: SuggestionColumns;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (suggestions.length === 0 && declined.length === 0) return null;

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

  async function dismiss(id: string) {
    setBusyId(id);
    const res = await dismissEntrySuggestion(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Dismissed.");
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
            {s.mine ? (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                disabled={busyId === s.id}
                onClick={() => withdraw(s.id)}
              >
                Withdraw
              </Button>
            ) : (
              <SuggestionAnswer suggestionId={s.id} />
            )}
          </li>
        ))}
        {declined.map((d) => (
          <li
            key={d.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">You</span>
              <Badge variant="secondary">Declined</Badge>
              <span className="text-xs text-muted-foreground">
                {timeAgo(d.declinedAt)}
              </span>
            </div>
            {/* The change as it was suggested, against the entry then. */}
            <SuggestionChanges rows={suggestionRows(d.changes, d.before)} />
            {d.note ? (
              <p className="whitespace-pre-wrap text-muted-foreground">
                {d.note}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {answeredLine({
                status: "declined",
                decidedBy: d.declinedBy,
                declineReason: d.declineReason,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                nativeButton={false}
                render={<Link href={suggestChangeHref(d.personId, d.id)} />}
                size="sm"
                variant="outline"
              >
                Edit and resend
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId === d.id}
                onClick={() => dismiss(d.id)}
              >
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
