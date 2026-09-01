"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveInviteRequest,
  declineInviteRequest,
} from "@/app/actions/invite-requests";
import { DeleteInviteButton } from "@/components/delete-invite-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PendingInviteRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
};

type Approved = { url: string; emailed: boolean };

export function AdminInviteRequests({
  requests,
}: {
  requests: PendingInviteRequest[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [approved, setApproved] = React.useState<Record<string, Approved>>({});

  if (requests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No invite requests to review.
      </p>
    );
  }

  async function onApprove(id: string, email: string) {
    setBusyId(id);
    const res = await approveInviteRequest(id);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    // Deliberately no router.refresh() here: the row has to stay on screen so
    // the admin can see the outcome and copy the link as a fallback.
    if (res.url) {
      setApproved((prev) => ({ ...prev, [id]: { url: res.url!, emailed: !!res.emailed } }));
    }
    if (res.emailed) {
      toast.success(`Approved — invite emailed to ${email}.`);
    } else {
      toast.warning(
        `Approved, but the email didn't send${res.emailError ? ` (${res.emailError})` : ""} — copy the link below and send it yourself.`,
      );
    }
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
        const result = approved[r.id];
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
            {result ? (
              <div className="flex flex-col gap-2">
                <p className={result.emailed ? "text-muted-foreground" : "text-destructive"}>
                  {result.emailed
                    ? `Invite emailed to ${r.email}.`
                    : "Couldn't email this invite — send the link yourself:"}
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={result.url}
                    aria-label={`Invite link for ${r.firstName} ${r.lastName}`}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={() => copy(result.url)}>
                    Copy
                  </Button>
                </div>
                <div>
                  <DeleteInviteButton
                    id={r.id}
                    name={`${r.firstName} ${r.lastName}`}
                    confirmText={`Delete this record and kill the invite link you just sent ${r.email}? If they haven't used it yet, it will stop working. This cannot be undone.`}
                  />
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => onApprove(r.id, r.email)}
                >
                  {busyId === r.id ? "Working…" : "Approve & send invite"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => onDecline(r.id)}
                >
                  Decline
                </Button>
                <DeleteInviteButton
                  id={r.id}
                  name={`${r.firstName} ${r.lastName}`}
                  disabled={busyId !== null}
                  confirmText={`Delete ${r.firstName} ${r.lastName}'s invite request outright? Unlike declining, it leaves no record and they can ask again. This cannot be undone.`}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
