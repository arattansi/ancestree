"use client";

import type { InviteHistoryItem } from "@/lib/invites";
import { DeleteInviteButton } from "@/components/delete-invite-button";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { Badge } from "@/components/ui/badge";

/**
 * "Sent invites" history on /admin — read-only apart from resending or
 * deleting a row. A client component so its dates read in the viewer's own
 * locale and time zone, as the bare and archived lists' do.
 */
export function AdminInviteHistory({ items }: { items: InviteHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No invites waiting on anyone.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
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
              confirmText={confirmTextFor(item)}
            />
          </div>
        </li>
      ))}
    </ul>
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
    ? `${verb} by ${who} on ${formatDate(item.reviewedAt)}`
    : `${verb} by ${who}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** An invite is worth resending while it still exists and can still be used. */
function canResend(item: InviteHistoryItem) {
  return (
    item.status === "approved" &&
    item.inviteStatus === "active" &&
    !isExpired(item)
  );
}

function isExpired(item: InviteHistoryItem) {
  return item.expiresAt ? new Date(item.expiresAt) < new Date() : false;
}

/**
 * Deleting always removes the invite alongside the record, so say what that
 * costs: a link nobody has used yet dies with it. (A joined invite is never
 * here — joining deletes it.)
 */
function confirmTextFor(item: InviteHistoryItem) {
  const who = `${item.firstName} ${item.lastName}`;
  if (item.inviteStatus === "active") {
    return `Delete ${who}'s invite? The link emailed to ${item.email} stops working immediately. This cannot be undone.`;
  }
  return `Delete the record of ${who}'s invite? This cannot be undone.`;
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
      const expired = isExpired(item);
      return (
        <Badge variant="secondary">{expired ? "Expired, unused" : "Sent, not yet used"}</Badge>
      );
    }
    default:
      return <Badge variant="secondary">Approved</Badge>;
  }
}
