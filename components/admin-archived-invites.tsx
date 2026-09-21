"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteInvite } from "@/app/actions/invites";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { Button } from "@/components/ui/button";
import { LEAF } from "@/lib/account-types";
import type { ArchivedInvite } from "@/lib/invites";

/**
 * "Archived invites" on /admin — ones that expired unused, kept on record
 * but out of the live lists. Nothing to do with them but delete for good.
 */
export function AdminArchivedInvites({ invites }: { invites: ArchivedInvite[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No archived invites.</p>
    );
  }

  async function onDelete(invite: ArchivedInvite) {
    if (
      !window.confirm(
        `Delete the record of ${describe(invite)}? The link already stopped working when it expired. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusyId(invite.id);
    const res = await deleteInvite(invite.id);
    setBusyId(null);
    router.refresh();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Deleted.");
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
                invite.expiresAt ? `expired ${formatDate(invite.expiresAt)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {invite.joinsAs === LEAF.key ? (
              <AccountTypeBadge role={invite.joinsAs} />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => onDelete(invite)}
              aria-label={`Delete the archived invite for ${describe(invite)}`}
            >
              {busyId === invite.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function describe(invite: ArchivedInvite) {
  if (invite.recipientName) return `${invite.recipientName}'s invite`;
  if (invite.claimPersonName) return `the invite to claim ${invite.claimPersonName}`;
  return "this bare link";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
