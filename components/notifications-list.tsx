"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { disputeClaim, markNotificationsRead } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NotificationItem } from "@/lib/claims";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function NotificationsList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [disputingId, setDisputingId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const hasUnread = items.some((n) => !n.readAt);

  React.useEffect(() => {
    if (hasUnread) void markNotificationsRead();
  }, [hasUnread]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No notifications yet.</p>
    );
  }

  async function onDispute(claimId: string) {
    setBusy(true);
    const res = await disputeClaim(claimId, reason);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Dispute sent to an admin.");
    setDisputingId(null);
    setReason("");
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((n) => (
        <li
          key={n.id}
          className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <p className={n.readAt ? "text-muted-foreground" : "font-medium"}>
              {n.body}
            </p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(n.createdAt)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {n.personId ? (
              <Button
                nativeButton={false}
                render={<Link href="/tree" />}
                size="sm"
                variant="ghost"
              >
                View on tree
              </Button>
            ) : null}

            {n.canDispute && n.claimId ? (
              disputingId === n.id ? null : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDisputingId(n.id);
                    setReason("");
                  }}
                >
                  Dispute this claim
                </Button>
              )
            ) : null}
          </div>

          {disputingId === n.id && n.claimId ? (
            <div className="flex flex-col gap-2 rounded-md border border-border p-2">
              <label
                htmlFor={`reason-${n.id}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Why is this claim wrong? (optional)
              </label>
              <Input
                id={`reason-${n.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="This isn't the same person…"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => onDispute(n.claimId as string)}
                >
                  {busy ? "Sending…" : "Send dispute"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDisputingId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
