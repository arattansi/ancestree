"use client";

import { resolveClaim } from "@/app/actions/claims";
import { ConfirmButton } from "@/components/confirm-dialog";
import { RowCard, RowList } from "@/components/row-card";
import type { DisputedClaim } from "@/lib/claims";

export function AdminDisputedClaims({ claims }: { claims: DisputedClaim[] }) {
  return (
    <RowList items={claims} empty="No disputed claims to review.">
      {(c) => {
        const claim = c.claimantName
          ? `${c.claimantName}’s claim to ${c.personName}`
          : `the claim to ${c.personName}`;
        return (
          <RowCard key={c.id}>
            <p className="font-medium">{c.personName}</p>
            <p className="text-muted-foreground">
              Claimed by {c.claimantName ?? "a member"} · disputed by{" "}
              {c.creatorName ?? "the entry's creator"}
            </p>
            {c.reason ? (
              <p className="rounded bg-muted px-2 py-1 text-xs">
                &ldquo;{c.reason}&rdquo;
              </p>
            ) : null}
            <div className="flex gap-2">
              <ConfirmButton
                size="sm"
                confirm={{
                  title: `Uphold ${claim}?`,
                  destructive: false,
                  confirmLabel: "Uphold claim",
                  pendingLabel: "Upholding…",
                  onConfirm: () => resolveClaim(c.id, "uphold"),
                }}
              >
                Uphold claim
              </ConfirmButton>
              <ConfirmButton
                size="sm"
                variant="outline"
                confirm={{
                  title: `Reverse ${claim}?`,
                  // `resolve_claim` hands the entry back to whoever added
                  // it, and unlinks it from the claimant.
                  description: `${c.personName} goes back to ${c.creatorName ?? "whoever added it"}.`,
                  confirmLabel: "Reverse claim",
                  pendingLabel: "Reversing…",
                  onConfirm: () => resolveClaim(c.id, "reverse"),
                }}
              >
                Reverse claim
              </ConfirmButton>
            </div>
          </RowCard>
        );
      }}
    </RowList>
  );
}
