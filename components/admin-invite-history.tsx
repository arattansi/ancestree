import type { InviteHistoryItem } from "@/lib/invites";
import { Badge } from "@/components/ui/badge";

/** "Sent invites" history on /admin — read-only, no client state needed. */
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
          </div>
        </li>
      ))}
    </ul>
  );
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
      const expired = item.expiresAt ? new Date(item.expiresAt) < new Date() : false;
      return (
        <Badge variant="secondary">{expired ? "Expired, unused" : "Sent, not yet used"}</Badge>
      );
    }
    default:
      return <Badge variant="secondary">Approved</Badge>;
  }
}
