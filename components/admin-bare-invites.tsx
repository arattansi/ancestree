"use client";

import { toast } from "sonner";

import { deleteInvite } from "@/app/actions/invites";
import { ConfirmButton } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/components/use-action";
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
  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unused bare links.
      </p>
    );
  }

  const urlFor = (token: string) => `${baseUrl}/join/${token}`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      toast.success("Invite link copied");
    } catch {
      toastError("Couldn't copy — select and copy the link manually");
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {invites.map((invite) => {
        const minted = `minted by ${invite.createdByName ?? "a former member"} on ${shortDate(invite.createdAt)}`;
        return (
          <li
            key={invite.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge invite={invite} />
              <span className="text-muted-foreground">
                Minted by {invite.createdByName ?? "a former member"} on{" "}
                {shortDate(invite.createdAt)}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={urlFor(invite.token)}
                aria-label="Bare invite link"
                className="font-mono text-xs"
              />
              {/* Nobody's name is on a bare link: it's told apart by who
                  made it, and when. */}
              <Button
                type="button"
                variant="outline"
                onClick={() => copy(invite.token)}
                aria-label={`Copy the link ${minted}`}
              >
                Copy
              </Button>
              <ConfirmButton
                variant="destructive"
                aria-label={`Delete the link ${minted}`}
                confirm={{
                  title: "Delete this link?",
                  description: consequence(invite),
                  confirmLabel: "Delete",
                  pendingLabel: "Deleting…",
                  onConfirm: () => deleteInvite(invite.id),
                }}
              >
                Delete
              </ConfirmButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Nobody's name is attached to a bare link, so the stakes are all in its state. */
function consequence(invite: BareInvite) {
  if (invite.status === "active" && !isExpired(invite)) {
    return "It stops working for anyone you’ve sent it to.";
  }
  return "It no longer works anyway.";
}

function isExpired(invite: BareInvite) {
  return invite.expiresAt ? new Date(invite.expiresAt) < new Date() : false;
}

function StatusBadge({ invite }: { invite: BareInvite }) {
  switch (invite.status) {
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
