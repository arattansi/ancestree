"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveInviteRequest,
  declineInviteRequest,
} from "@/app/actions/invite-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PendingInviteRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
};

export function AdminInviteRequests({
  requests,
}: {
  requests: PendingInviteRequest[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [links, setLinks] = React.useState<Record<string, string>>({});

  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No invite requests to review.
      </p>
    );
  }

  async function onApprove(id: string) {
    setBusyId(id);
    const res = await approveInviteRequest(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    // Deliberately no router.refresh() here: the row has to stay on screen so
    // the admin can copy the freshly minted link.
    if (res.url) setLinks((prev) => ({ ...prev, [id]: res.url! }));
    toast.success("Approved — copy the link and send it on.");
  }

  async function onDecline(id: string) {
    setBusyId(id);
    const res = await declineInviteRequest(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Request declined.");
    router.refresh();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually");
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {requests.map((r) => {
        const link = links[r.id];
        return (
          <li
            key={r.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
          >
            <p className="font-medium">
              {r.firstName} {r.lastName}
            </p>
            <p className="text-muted-foreground">
              {r.email} ·{" "}
              {new Date(r.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            {link ? (
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={link}
                  aria-label={`Invite link for ${r.firstName} ${r.lastName}`}
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={() => copy(link)}>
                  Copy
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => onApprove(r.id)}
                >
                  {busyId === r.id ? "Working…" : "Approve & mint link"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => onDecline(r.id)}
                >
                  Decline
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
