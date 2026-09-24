"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveTreeRequest,
  declineTreeRequest,
  deleteTreeRequest,
} from "@/app/actions/tree-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TreeRequestItem } from "@/lib/tree-requests.server";

function fullName(r: TreeRequestItem): string {
  return `${r.firstName} ${r.lastName}`.trim();
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Requests to start a tree (Step 28), on a beta reviewer's admin console:
 * members asking from the home page or their trees page, and sign-ups from
 * the waitlist. Approving a member lets them start one; approving a sign-up
 * sends a founder invite from `treeId`, the tree whose console this is.
 */
export function AdminTreeRequests({
  treeId,
  requests,
}: {
  treeId: string;
  requests: TreeRequestItem[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const open = requests.filter((r) => r.status === "pending");
  const answered = requests.filter((r) => r.status !== "pending");

  async function call<T extends { error?: string }>(
    id: string,
    action: () => Promise<T>,
  ): Promise<T | null> {
    setBusyId(id);
    try {
      return await action();
    } catch {
      // Never strand the row on "Working…": a rejected action (a stale action
      // id after a deploy, a dropped connection) has to be recoverable.
      toast.error("Couldn't reach the server — reload the page and try again.");
      return null;
    } finally {
      setBusyId(null);
      router.refresh();
    }
  }

  async function onApprove(r: TreeRequestItem) {
    const res = await call(r.id, () => approveTreeRequest(r.id, treeId));
    if (!res) return;
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const why = res.emailError ? ` (${res.emailError})` : "";
    if (r.kind === "member") {
      if (res.emailed) {
        toast.success(`Approved. ${fullName(r)} can start a tree now, and we emailed ${r.email}.`);
      } else {
        toast.warning(
          `Approved. ${fullName(r)} will see it in their inbox, but the email didn’t send${why}.`,
        );
      }
    } else if (res.emailed) {
      toast.success(`Approved. A founder invite is on its way to ${r.email}.`);
    } else {
      toast.warning(
        `Approved, but the invite email didn’t send${why}. Resend it from Sent Invites.`,
      );
    }
  }

  async function onDecline(r: TreeRequestItem) {
    const res = await call(r.id, () => declineTreeRequest(r.id));
    if (!res) return;
    if (res.error) toast.error(res.error);
    else toast.success("Request declined.");
  }

  async function onDelete(r: TreeRequestItem) {
    if (!window.confirm(deleteWarning(r))) return;
    const res = await call(r.id, () => deleteTreeRequest(r.id));
    if (!res) return;
    if (res.error) toast.error(res.error);
    else toast.success("Deleted.");
  }

  return (
    <div className="flex flex-col gap-4">
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No requests to start a tree.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{fullName(r)}</p>
                <KindBadge request={r} />
              </div>
              <p className="text-muted-foreground">
                {r.email} · {shortDate(r.createdAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => onApprove(r)}
                >
                  {busyId === r.id
                    ? "Working…"
                    : r.kind === "member"
                      ? "Approve"
                      : "Approve & send invite"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId !== null}
                  onClick={() => onDecline(r)}
                >
                  Decline
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busyId !== null}
                  onClick={() => onDelete(r)}
                  aria-label={`Delete the request from ${fullName(r)}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {answered.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Answered ({answered.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {answered.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1.5 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{fullName(r)}</p>
                  <p className="text-muted-foreground">
                    {r.email}
                    {r.reviewedAt ? ` · ${shortDate(r.reviewedAt)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <KindBadge request={r} />
                  <AnswerBadges request={r} />
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId !== null}
                    onClick={() => onDelete(r)}
                    aria-label={`Delete the request from ${fullName(r)}`}
                  >
                    {busyId === r.id ? "Deleting…" : "Delete"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function KindBadge({ request }: { request: TreeRequestItem }) {
  return (
    <Badge variant="secondary">
      {request.kind === "member" ? "Member" : "Waitlist"}
    </Badge>
  );
}

function AnswerBadges({ request: r }: { request: TreeRequestItem }) {
  if (r.status === "declined") return <Badge variant="secondary">Declined</Badge>;
  return (
    <>
      <Badge variant="secondary">Approved</Badge>
      {r.emailSent === false ? (
        <Badge variant="destructive">Email failed</Badge>
      ) : null}
      {r.kind === "waitlist" && r.inviteOut ? (
        <Badge variant="secondary">Invite not yet used</Badge>
      ) : null}
    </>
  );
}

/** Say what deleting costs, which depends on how far the request got. */
function deleteWarning(r: TreeRequestItem): string {
  const who = fullName(r);
  if (r.status === "pending") {
    return `Delete ${who}’s request? It leaves no record, so they can ask again.`;
  }
  if (r.status === "approved" && r.kind === "member") {
    return `Delete ${who}’s approved request? If they haven’t started their tree, they’ll have to ask again.`;
  }
  if (r.status === "approved" && r.inviteOut) {
    return `Delete ${who}’s request? The invite sent to ${r.email} stops working.`;
  }
  return `Delete the record of ${who}’s request?`;
}
