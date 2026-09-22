"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { clearNotifications } from "@/app/actions/claims";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/lib/claims";

/**
 * Clears a list of notifications. A placement request still waiting on an
 * answer stays: it's the one kind of item with nowhere else to answer it.
 */
export function ClearNotificationsButton({
  items,
  className,
}: {
  items: NotificationItem[];
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const clearable = items.filter((n) => !n.placementId).map((n) => n.id);
  if (clearable.length === 0) return null;

  async function onClear() {
    setBusy(true);
    const res = await clearNotifications(clearable);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      clearable.length < items.length
        ? "Cleared. Requests waiting on your answer are kept."
        : "Notifications cleared.",
    );
    router.refresh();
  }

  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={onClear}
      disabled={busy}
      className={className}
    >
      {busy ? "Clearing…" : "Clear"}
    </Button>
  );
}
