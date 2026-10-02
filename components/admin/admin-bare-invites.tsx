"use client";

import { deleteInvite } from "@/app/actions/invites";
import { ConfirmButton } from "@/components/confirm-dialog";
import { copyText } from "@/components/copy-text";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isExpired } from "@/lib/expiry";
import type { BareInvite } from "@/lib/invites";
import { shortDate } from "@/lib/short-date";
import { inviteHref } from "@/lib/sign-in-links";

/**
 * Bare invite links on the Root console — the ones minted without a
 * recipient, so they have no row in "Sent invites". Copyable (the whole
 * point of a bare link is that you send it yourself) and deletable.
 */
export function AdminBareInvites({
  invites,
  baseUrl,
}: {
  invites: BareInvite[];
  baseUrl: string;
}) {
  const urlFor = (token: string) => `${baseUrl}${inviteHref(token)}`;

  function copy(token: string) {
    void copyText(urlFor(token), { copied: "Invite link copied" });
  }

  return (
    <RowList items={invites} empty="No unused bare links.">
      {(invite) => {
        const minted = `minted by ${invite.createdByName ?? "a former member"} on ${shortDate(invite.createdAt)}`;
        return (
          <RowCard key={invite.id}>
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
                copy
              </Button>
              <ConfirmButton
                variant="destructive"
                aria-label={`Delete the link ${minted}`}
                confirm={{
                  title: "Delete this link?",
                  description: consequence(invite),
                  confirmLabel: "delete",
                  pendingLabel: "deleting…",
                  onConfirm: () => deleteInvite(invite.id),
                }}
              >
                delete
              </ConfirmButton>
            </div>
          </RowCard>
        );
      }}
    </RowList>
  );
}

/** Nobody's name is attached to a bare link, so the stakes are all in its state. */
function consequence(invite: BareInvite) {
  if (invite.status === "active" && !isExpired(invite.expiresAt)) {
    return "It stops working for anyone you’ve sent it to.";
  }
  return "It no longer works anyway.";
}

function StatusBadge({ invite }: { invite: BareInvite }) {
  switch (invite.status) {
    case "revoked":
      return <Badge variant="secondary">Revoked</Badge>;
    default:
      return (
        <Badge variant="secondary">
          {isExpired(invite.expiresAt) ? "Expired, unused" : "Unused"}
        </Badge>
      );
  }
}
