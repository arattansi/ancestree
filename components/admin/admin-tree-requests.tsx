"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  approveTreeRequest,
  declineTreeRequest,
  deleteTreeRequest,
} from "@/app/actions/tree-requests";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { useAction } from "@/components/use-action";
import { refocusAfterRemoval } from "@/components/use-focus-return";
import { shortDate } from "@/lib/short-date";
import type { TreeRequestItem } from "@/lib/tree-requests.server";

function fullName(r: TreeRequestItem): string {
  return `${r.firstName} ${r.lastName}`.trim();
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
  const open = requests.filter((r) => r.status === "pending");
  const answered = requests.filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <RowList items={open} empty="No requests to start a tree.">
        {(r) => <OpenRequest key={r.id} treeId={treeId} request={r} />}
      </RowList>

      {answered.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Answered ({answered.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {answered.map((r) => (
              <RowCard key={r.id} layout="split">
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
                  <DeleteRequestButton request={r} />
                </div>
              </RowCard>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * A request waiting on an answer, with its own calls: answering one doesn't
 * hold up the others. Answered, it moves down to Answered, and focus goes on
 * to the next request.
 */
function OpenRequest({
  treeId,
  request: r,
}: {
  treeId: string;
  request: TreeRequestItem;
}) {
  const action = useAction();

  function onApprove(event: React.MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    action.run("approve", () => approveTreeRequest(r.id, treeId), {
      // The email is out of sight: say it went, or that it didn't.
      success: (res) => {
        if (!res.emailed) return null;
        return r.kind === "member"
          ? `Approved. ${fullName(r)} can start a tree now, and we emailed ${r.email}.`
          : `Approved. A founder invite is on its way to ${r.email}.`;
      },
      onSuccess: (res) => {
        refocusAfterRemoval(button);
        if (res.emailed) return;
        const why = res.emailError ? ` (${res.emailError})` : "";
        toast.warning(
          r.kind === "member"
            ? `Approved. ${fullName(r)} will see it in their inbox, but the email didn’t send${why}.`
            : `Approved, but the invite email didn’t send${why}. Resend it from Sent Invites.`,
        );
      },
    });
  }

  function onDecline(event: React.MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    action.run("decline", () => declineTreeRequest(r.id), {
      onSuccess: () => refocusAfterRemoval(button),
    });
  }

  return (
    <RowCard>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{fullName(r)}</p>
        <KindBadge request={r} />
      </div>
      <p className="text-muted-foreground">
        {r.email} · {shortDate(r.createdAt)}
      </p>
      <div className="flex flex-wrap gap-2">
        <PendingButton
          size="sm"
          pending={action.pendingKey === "approve"}
          disabled={action.pending}
          pendingLabel="Approving…"
          onClick={onApprove}
        >
          {r.kind === "member" ? "Approve" : "Approve & send invite"}
        </PendingButton>
        <PendingButton
          size="sm"
          variant="outline"
          pending={action.pendingKey === "decline"}
          disabled={action.pending}
          pendingLabel="Declining…"
          onClick={onDecline}
        >
          Decline
        </PendingButton>
        <DeleteRequestButton request={r} disabled={action.pending} />
      </div>
    </RowCard>
  );
}

function DeleteRequestButton({
  request: r,
  disabled,
}: {
  request: TreeRequestItem;
  disabled?: boolean;
}) {
  return (
    <ConfirmButton
      size="sm"
      variant="destructive"
      disabled={disabled}
      aria-label={`Delete the request from ${fullName(r)}`}
      confirm={{
        ...deleteConfirm(r),
        confirmLabel: "Delete",
        pendingLabel: "Deleting…",
        onConfirm: () => deleteTreeRequest(r.id),
      }}
    >
      Delete
    </ConfirmButton>
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
function deleteConfirm(r: TreeRequestItem): { title: string; description?: string } {
  const who = fullName(r);
  if (r.status === "pending") {
    return {
      title: `Delete ${who}’s request?`,
      description: "It leaves no record, so they can ask again.",
    };
  }
  if (r.status === "approved" && r.kind === "member") {
    return {
      title: `Delete ${who}’s approved request?`,
      description: "If they haven’t started their tree, they’ll have to ask again.",
    };
  }
  if (r.status === "approved" && r.inviteOut) {
    return {
      title: `Delete ${who}’s request?`,
      description: `The invite sent to ${r.email} stops working.`,
    };
  }
  return { title: `Delete the record of ${who}’s request?` };
}
