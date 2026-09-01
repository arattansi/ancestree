"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { deleteInvite } from "@/app/actions/invites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BareInvite } from "@/lib/invites";

/**
 * Bare invite links on /admin — the ones minted without a recipient, so they
 * have no row in "Sent invites". Copyable (the whole point of a bare link is
 * that you send it yourself) and deletable.
 */
export function AdminBareInvites({
  invites,
  baseUrl,
}: {
  invites: BareInvite[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No bare links minted yet.
      </p>
    );
  }

  const urlFor = (token: string) => `${baseUrl}/join/${token}`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually");
    }
  }

  async function onDelete(invite: BareInvite) {
    if (!window.confirm(confirmTextFor(invite))) return;
    setBusyId(invite.id);
    const res = await deleteInvite(invite.id);
    setBusyId(null);
    router.refresh();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Link deleted.");
  }

  return (
    <ul className="flex flex-col gap-3">
      {invites.map((invite) => (
        <li
          key={invite.id}
          className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge invite={invite} />
            <span className="text-muted-foreground">
              Minted by {invite.createdByName ?? "a former member"} on{" "}
              {new Date(invite.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={urlFor(invite.token)}
              aria-label="Bare invite link"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => copy(invite.token)}
            >
              Copy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => onDelete(invite)}
            >
              {busyId === invite.id ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Nobody's name is attached to a bare link, so the stakes are all in its state. */
function confirmTextFor(invite: BareInvite) {
  if (invite.status === "accepted") {
    return "Delete this link? Someone has already joined with it and will stay a member — you just lose the record of the link. This cannot be undone.";
  }
  if (invite.status === "active" && !isExpired(invite)) {
    return "Delete this link? Anyone holding it — including anywhere you've already sent it — will no longer be able to join. This cannot be undone.";
  }
  return "Delete this link? It can no longer be used to join anyway. This cannot be undone.";
}

function isExpired(invite: BareInvite) {
  return invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
}

function StatusBadge({ invite }: { invite: BareInvite }) {
  switch (invite.status) {
    case "accepted":
      return <Badge>Used</Badge>;
    case "revoked":
      return <Badge variant="secondary">Revoked</Badge>;
    default:
      return (
        <Badge variant="secondary">
          {isExpired(invite) ? "Expired, unused" : "Unused"}
        </Badge>
      );
  }
}
