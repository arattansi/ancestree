"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveTreeCanvasRequest,
  declineTreeCanvasRequest,
} from "@/app/actions/tree-canvas-requests";
import type { PendingCanvasRequest } from "@/lib/growth-rights.server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin queue for members the bloodline gate refused who asked for a canvas of
 * their own (Step 14.1). Approving mints the tree, copies their entry onto it,
 * and bridges back through the relative they married.
 */
export function AdminCanvasRequests({
  requests,
  multiTreeEnabled,
}: {
  requests: PendingCanvasRequest[];
  /** Provisioning works either way; without the flag the canvas is not yet
   *  rendered, which the admin should know before approving. */
  multiTreeEnabled: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [names, setNames] = React.useState<Record<string, string>>({});

  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No canvas requests to review.
      </p>
    );
  }

  async function onApprove(id: string) {
    setBusyId(id);
    const res = await approveTreeCanvasRequest(id, { treeName: names[id] });
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Canvas created and bridged to the family tree.");
    router.refresh();
  }

  async function onDecline(id: string) {
    setBusyId(id);
    const res = await declineTreeCanvasRequest(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Request declined.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!multiTreeEnabled ? (
        <p className="text-sm text-muted-foreground">
          Multi-tree rendering is off, so an approved canvas is provisioned but
          not yet visible to the member. Turn on
          <code className="mx-1">NEXT_PUBLIC_ENABLE_MULTI_TREE</code>
          to show it.
        </p>
      ) : null}

      <ul className="space-y-4">
        {requests.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border p-4">
            <div>
              <p className="font-medium">{r.requesterName}</p>
              <p className="text-sm text-muted-foreground">
                {r.bridgeName
                  ? `Bridges to ${r.bridgeName} through their marriage.`
                  : "No partner on the tree to bridge to — connect their marriage first."}
              </p>
            </div>

            {r.note ? (
              <p className="text-sm italic text-muted-foreground">
                &ldquo;{r.note}&rdquo;
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Name for the new canvas"
                placeholder="Name the canvas (optional)"
                className="max-w-xs"
                value={names[r.id] ?? ""}
                onChange={(e) =>
                  setNames((prev) => ({ ...prev, [r.id]: e.target.value }))
                }
              />
              <Button
                onClick={() => onApprove(r.id)}
                disabled={busyId === r.id || !r.bridgeName}
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                onClick={() => onDecline(r.id)}
                disabled={busyId === r.id}
              >
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
