"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { resolveClaim } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import type { DisputedClaim } from "@/lib/claims";

export function AdminDisputedClaims({ claims }: { claims: DisputedClaim[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (claims.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No disputed claims to review.
      </p>
    );
  }

  async function onResolve(id: string, action: "uphold" | "reverse") {
    setBusyId(id);
    const res = await resolveClaim(id, action);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      action === "uphold" ? "Claim upheld." : "Claim reversed.",
    );
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-3">
      {claims.map((c) => (
        <li
          key={c.id}
          className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
        >
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
            <Button
              size="sm"
              disabled={busyId !== null}
              onClick={() => onResolve(c.id, "uphold")}
            >
              {busyId === c.id ? "Working…" : "Uphold claim"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busyId !== null}
              onClick={() => onResolve(c.id, "reverse")}
            >
              Reverse claim
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
