import type * as React from "react";

import { RowCard } from "@/components/row-card";
import {
  candidateSummary,
  matchConfidence,
  type SelfCandidate,
} from "@/lib/self-match";

/**
 * An entry someone's name matches (Steps 29, 30.3, 41.1): its name, "close
 * match" when it's only close, what the tree says of it, and what can be
 * done with it — claim it as yourself, approve a request as it, or invite a
 * relative's ask as it.
 */
export function CandidateRow({
  candidate,
  children,
}: {
  candidate: SelfCandidate;
  /** Its button. */
  children: React.ReactNode;
}) {
  return (
    <RowCard layout="row">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <span className="truncate">{candidate.name}</span>
          {matchConfidence(candidate.score) === "close" ? (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              close match
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {candidateSummary(candidate)}
        </p>
      </div>
      {children}
    </RowCard>
  );
}
