"use client";

import { deleteInvite } from "@/app/actions/invites";
import { ConfirmButton } from "@/components/confirm-dialog";
import type { ArchivedInvite } from "@/lib/invites";
import { shortDate } from "@/lib/short-date";

/**
 * "Archived invites" on /admin — ones that expired unused, kept on record
 * but out of the live lists. Nothing to do with them but delete for good.
 */
export function AdminArchivedInvites({ invites }: { invites: ArchivedInvite[] }) {
  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No archived invites.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">
              {invite.recipientName ??
                (invite.claimPersonName
                  ? `Invite to claim ${invite.claimPersonName}`
                  : "Bare link")}
            </p>
            <p className="text-muted-foreground">
              {[
                invite.email,
                `Sent by ${invite.createdByName ?? "a former member"}`,
                invite.expiresAt ? `expired ${shortDate(invite.expiresAt)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <ConfirmButton
              size="sm"
              variant="destructive"
              aria-label={`Delete the archived invite for ${describe(invite)}`}
              confirm={{
                title: `Delete the record of ${describe(invite)}?`,
                confirmLabel: "Delete",
                pendingLabel: "Deleting…",
                onConfirm: () => deleteInvite(invite.id),
              }}
            >
              Delete
            </ConfirmButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

function describe(invite: ArchivedInvite) {
  if (invite.recipientName) return `${invite.recipientName}’s invite`;
  if (invite.claimPersonName) return `the invite to claim ${invite.claimPersonName}`;
  return "this bare link";
}
