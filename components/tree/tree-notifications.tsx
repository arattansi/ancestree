"use client";

import { Bell } from "lucide-react";
import * as React from "react";

import { NotificationsList } from "@/components/notifications-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/lib/claims";

/**
 * The signed-in member's in-app notifications, reachable from the tree canvas
 * itself — a bell in the top-right panel that drops down the same list the
 * account page shows. Opening it clears the unread badge.
 */
export function TreeNotifications({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = React.useState(false);
  const [seen, setSeen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const unread = seen ? 0 : items.filter((n) => !n.readAt).length;

  React.useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    setOpen((v) => {
      if (!v) setSeen(true);
      return !v;
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={toggle}
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <Badge variant="destructive" className="ml-1.5">
            {unread}
          </Badge>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 mt-2 max-h-[60vh] w-[min(20rem,80vw)] overflow-y-auto rounded-lg border border-border bg-card p-3 text-left shadow-md">
          <p className="mb-2 font-heading text-sm font-medium">Notifications</p>
          <NotificationsList items={items} />
        </div>
      ) : null}
    </div>
  );
}
