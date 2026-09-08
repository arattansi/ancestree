"use client";

import * as React from "react";
import { toast } from "sonner";

import { resolveImpliedConnection } from "@/app/actions/people";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    ? "Confirming flags the pair for an admin to merge by hand — nothing is deleted or joined automatically."
    : null;
}

export function ConnectionPrompt({
  suggestion,
  onResolved,
}: {
  suggestion: PanelSuggestion;
  onResolved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function resolve(resolution: "accepted" | "dismissed") {
    setBusy(true);
    const res = await resolveImpliedConnection({
      subjectPersonId: suggestion.subjectPersonId,
      relatedPersonId: suggestion.relatedPersonId,
      suggestedType: suggestion.suggestedType,
      sources: [suggestion.source, ...suggestion.alsoFrom],
      resolution,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      resolution === "dismissed"
        ? "Thanks — we won't ask again."
        : suggestion.suggestedType === "duplicate_check"
          ? "Flagged for an admin to merge."
          : "Connection added.",
    );
    onResolved();
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
        <Button size="sm" disabled={busy} onClick={() => resolve("accepted")}>
          {acceptLabel(suggestion)}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => resolve("dismissed")}
        >
          No
        </Button>
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
  return (
    <ul className="flex flex-col gap-3">
      {suggestions.map((s) => (
        <ConnectionPrompt key={s.id} suggestion={s} onResolved={onResolved} />
      ))}
    </ul>
  );
}
