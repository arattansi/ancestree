import type { InviteHistoryItem } from "@/lib/invites";
import { DeleteInviteButton } from "@/components/delete-invite-button";
import { ResendInviteButton } from "@/components/resend-invite-button";
import { Badge } from "@/components/ui/badge";

/** "Sent invites" history on /admin — read-only apart from deleting a row. */
export function AdminInviteHistory({ items }: { items: InviteHistoryItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No invites sent yet.</p>
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
            <p className="text-muted-foreground">{item.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {item.source === "direct" ? "Sent directly" : "Requested"}
            </Badge>
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
 * costs: a link nobody has used yet dies with it, while one already accepted
 * only loses its paper trail — the member stays a member.
 */
function confirmTextFor(item: InviteHistoryItem) {
  const who = `${item.firstName} ${item.lastName}`;
  if (item.inviteStatus === "accepted") {
    return `Delete the record of ${who}'s invite? They've already joined and will stay a member — you just lose the history of how. This cannot be undone.`;
  }
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
    return <Badge variant="destructive">Approved, email failed</Badge>;
  }

  switch (item.inviteStatus) {
    case "accepted":
      return <Badge>Joined</Badge>;
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
