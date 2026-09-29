"use client";

import * as React from "react";

import { resolveImpliedConnection } from "@/app/actions/people";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { PendingButton } from "@/components/pending-button";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/use-action";
import { refocusAfterRemoval } from "@/components/use-focus-return";

/**
 * The one place a derived connection candidate is answered — used by the person
 * panel and by the review queue, so both explain themselves the same way.
 *
 * There is no "skip for now": a candidate nobody answers simply stays open and
 * comes back next time. Only yes and no are recorded, because the ledger's job
 * is to stop the engine re-asking a question that has been settled.
 */

/** What accepting this candidate will actually do, in the member's words. */
function acceptLabel(s: PanelSuggestion): string {
  if (s.suggestedType === "spouse") return "Yes, they're partners";
  if (s.suggestedType === "parent") return "Yes, add the parent";
  if (s.suggestedType === "duplicate_check") return "Yes, same person";
  return "Yes";
}

/**
 * A confirmed duplicate can't be merged — the app has no merge. Saying so on
 * the button is better than implying something happens that doesn't.
 */
function acceptHint(s: PanelSuggestion): string | null {
  return s.suggestedType === "duplicate_check"
    ? "Yes flags them for a Root to merge by hand."
    : null;
}

export function ConnectionPrompt({
  suggestion,
  onAnswer,
  onResolved,
}: {
  suggestion: PanelSuggestion;
  /** Takes it off the list at once; a failed answer puts it back. */
  onAnswer: (id: string) => void;
  onResolved: () => void;
}) {
  // Its own handle, so answering one prompt leaves the others free (Step 70).
  const action = useAction();

  function resolve(resolution: "accepted" | "dismissed", button: HTMLElement) {
    // It leaves the list at once, and the next prompt takes focus.
    refocusAfterRemoval(button);
    action.run(
      resolution,
      async () => {
        onAnswer(suggestion.id);
        return resolveImpliedConnection({
          subjectPersonId: suggestion.subjectPersonId,
          relatedPersonId: suggestion.relatedPersonId,
          suggestedType: suggestion.suggestedType,
          sources: [suggestion.source, ...suggestion.alsoFrom],
          resolution,
        });
      },
      {
        // A toast only for what the prompt's leaving doesn't say: a
        // connection added shows on the tree itself.
        success:
          resolution === "dismissed"
            ? "Thanks — we won't ask again."
            : suggestion.suggestedType === "duplicate_check"
              ? "Flagged for a Root to merge."
              : undefined,
        onSuccess: onResolved,
      },
    );
  }

  const hint = acceptHint(suggestion);

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm">{suggestion.reason}</p>
        {suggestion.confidence === "medium" ? (
          <Badge variant="outline" className="shrink-0 text-xs font-normal">
            worth checking
          </Badge>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        <PendingButton
          size="sm"
          pending={action.pendingKey === "accepted"}
          disabled={action.pending}
          onClick={(e) => resolve("accepted", e.currentTarget)}
        >
          {acceptLabel(suggestion)}
        </PendingButton>
        <PendingButton
          size="sm"
          variant="outline"
          pending={action.pendingKey === "dismissed"}
          disabled={action.pending}
          onClick={(e) => resolve("dismissed", e.currentTarget)}
        >
          No
        </PendingButton>
      </div>
    </li>
  );
}

export function ConnectionPromptList({
  suggestions,
  onResolved,
}: {
  suggestions: PanelSuggestion[];
  onResolved: () => void;
}) {
  // An answered prompt leaves at once, and comes back to its place if the
  // answer fails (Step 70).
  const [shown, hide] = React.useOptimistic(
    suggestions,
    (list, id: string) => list.filter((s) => s.id !== id),
  );
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((s) => (
        <ConnectionPrompt
          key={s.id}
          suggestion={s}
          onAnswer={hide}
          onResolved={onResolved}
        />
      ))}
    </ul>
  );
}
