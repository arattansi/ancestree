"use client";

import { deleteInvite } from "@/app/actions/invites";
import { ConfirmButton } from "@/components/confirm-dialog";
import { RowCard, RowList } from "@/components/row-card";
import type { ArchivedInvite } from "@/lib/invites";
import { shortDate } from "@/lib/short-date";

/**
 * "Archived invites" on the Root console — ones that expired unused, kept
 * on record but out of the live lists. Nothing to do with them but delete
 * for good.
 */
export function AdminArchivedInvites({ invites }: { invites: ArchivedInvite[] }) {
  return (
    <RowList items={invites} empty="No archived invites." dense>
      {(invite) => (
        <RowCard key={invite.id} layout="split">
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
        </RowCard>
      )}
    </RowList>
  );
}

function describe(invite: ArchivedInvite) {
  if (invite.recipientName) return `${invite.recipientName}’s invite`;
  if (invite.claimPersonName) return `the invite to claim ${invite.claimPersonName}`;
  return "this bare link";
}
