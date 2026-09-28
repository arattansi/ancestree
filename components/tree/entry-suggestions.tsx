"use client";

import Link from "next/link";
import { toast } from "sonner";

import {
  dismissEntrySuggestion,
  restoreEntrySuggestion,
  withdrawEntrySuggestion,
} from "@/app/actions/suggestions";
import { ActionButton } from "@/components/action-button";
import { SuggestionAnswer } from "@/components/suggestion-answer";
import { SuggestionChanges } from "@/components/suggestion-changes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toastError } from "@/components/use-action";
import { UNREACHABLE } from "@/lib/action-feedback";
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
 * Dismissing a declined suggestion is cheap to put back, so it happens at
 * once and its toast has Undo, which returns it to the card (Step 74).
 */
function toastDismissed(suggestionId: string) {
  toast("Suggestion dismissed.", {
    action: {
      label: "Undo",
      onClick: () => {
        void restoreEntrySuggestion(suggestionId).then(
          (res) => res.error && toastError(res.error),
          () => toastError(UNREACHABLE),
        );
      },
    },
  });
}

/**
 * Suggested changes to this entry still waiting (Step 67). Someone who may
 * edit it sees everyone's, to accept or decline; whoever suggested one sees
 * their own, to withdraw, and after them the ones of theirs that were
 * declined, with why, to edit and resend (Step 72) or dismiss (Step 73),
 * which the toast can undo (Step 74). Nobody else sees any.
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
  if (suggestions.length === 0 && declined.length === 0) return null;

  // Withdraw and Dismiss take their suggestion off the card, which says so
  // itself; each is busy on its own until it has gone, and focus moves on to
  // the next one's (Step 70). Dismiss's toast is there for its Undo (Step 74).
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
              <ActionButton
                size="sm"
                variant="outline"
                className="self-start"
                action={() => withdrawEntrySuggestion(s.id)}
                pendingLabel="Withdrawing…"
                removesRow
              >
                Withdraw
              </ActionButton>
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
              <ActionButton
                size="sm"
                variant="ghost"
                action={() => dismissEntrySuggestion(d.id)}
                pendingLabel="Dismissing…"
                removesRow
                onSuccess={() => toastDismissed(d.id)}
              >
                Dismiss
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
