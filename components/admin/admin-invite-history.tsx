"use client";

import type { InviteHistoryItem } from "@/lib/invites";
import { DeleteInviteButton } from "@/components/admin/delete-invite-button";
import { ResendInviteButton } from "@/components/admin/resend-invite-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { isExpired } from "@/lib/expiry";
import { shortDate } from "@/lib/short-date";

/**
 * "Sent invites" history on the Root console — read-only apart from
 * resending or deleting a row. Its dates read the same everywhere
 * (`shortDate`, Step 77.4), as the bare and archived lists' do.
 */
export function AdminInviteHistory({ items }: { items: InviteHistoryItem[] }) {
  return (
    <RowList items={items} empty="No invites waiting on anyone." dense>
      {(item) => (
        <RowCard key={item.id} layout="split">
          <div>
            <p className="font-medium">
              {item.firstName} {item.lastName}
            </p>
            <p className="text-muted-foreground">
              {[item.email, sentBy(item)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {item.source === "direct" ? "Sent directly" : "Requested"}
            </Badge>
            {/* A founder invite doesn't join this tree; it plants their own. */}
            {item.foundsTree ? (
              <Badge variant="secondary">Starts a tree</Badge>
            ) : null}
            {/* Accepting claims an entry: sent from its card, or a request
                approved as it (Step 38). */}
            {item.claimsEntryName ? (
              <Badge variant="secondary">
                {item.claimsEntryName === `${item.firstName} ${item.lastName}`
                  ? "Claims their entry"
                  : `Claims ${item.claimsEntryName}`}
              </Badge>
            ) : null}
            <StatusBadge item={item} />
            {canResend(item) && (
              <ResendInviteButton
                id={item.id}
                name={`${item.firstName} ${item.lastName}`}
                email={item.email}
                failed={item.emailSent === false}
              />
            )}
            <DeleteInviteButton
              id={item.id}
              name={`${item.firstName} ${item.lastName}`}
              confirm={confirmFor(item)}
            />
          </div>
        </RowCard>
      )}
    </RowList>
  );
}

/**
 * Who sent it and when — for a request, who answered it. Invites go out from
 * every member's account page and from entries' cards too, so a Root can't
 * assume it was them (Step 38).
 */
function sentBy(item: InviteHistoryItem) {
  const verb =
    item.source === "direct"
      ? "Sent"
      : item.status === "declined"
        ? "Declined"
        : "Approved";
  const who = item.sentByName ?? "a former member";
  return item.reviewedAt
    ? `${verb} by ${who} on ${shortDate(item.reviewedAt)}`
    : `${verb} by ${who}`;
}

/** An invite is worth resending while it still exists and can still be used. */
function canResend(item: InviteHistoryItem) {
  return (
    item.status === "approved" &&
    item.inviteStatus === "active" &&
    !isExpired(item.expiresAt)
  );
}

/**
 * Deleting always removes the invite alongside the record, so say what that
 * costs: a link nobody has used yet dies with it. (A joined invite is never
 * here — joining deletes it.)
 */
function confirmFor(item: InviteHistoryItem) {
  const who = `${item.firstName} ${item.lastName}`;
  if (item.inviteStatus === "active") {
    return {
      title: `Delete ${who}’s invite?`,
      description: `The link sent to ${item.email} stops working.`,
    };
  }
  return { title: `Delete the record of ${who}’s invite?` };
}

function StatusBadge({ item }: { item: InviteHistoryItem }) {
  if (item.status === "declined") {
    return <Badge variant="secondary">Declined</Badge>;
  }

  if (item.emailSent === false) {
    return (
      <Badge variant="destructive">
        {item.source === "direct" ? "Email failed" : "Approved, email failed"}
      </Badge>
    );
  }

  switch (item.inviteStatus) {
    case "revoked":
      return <Badge variant="secondary">Revoked</Badge>;
    case "active": {
      const expired = isExpired(item.expiresAt);
      return (
        <Badge variant="secondary">{expired ? "Expired, unused" : "Sent, not yet used"}</Badge>
      );
    }
    default:
      return <Badge variant="secondary">Approved</Badge>;
  }
}
