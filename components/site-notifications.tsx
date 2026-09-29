"use client";

import { Bell } from "lucide-react";
import * as React from "react";

import { ClearNotificationsButton } from "@/components/clear-notifications-button";
import { CloseOnNavigate } from "@/components/close-on-navigate";
import { useHeaderCounts } from "@/components/header-counts";
import {
  NOTIFICATIONS_READ_EVENT,
  NotificationsList,
} from "@/components/notifications-list";
import { NavCount } from "@/components/site-nav-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotificationItem } from "@/lib/claims";
import { unreadShown } from "@/lib/header-counts";

/**
 * The signed-in member's in-app notifications, reachable from the header on
 * every page — a bell just past Account that drops down the same list the
 * account page shows. Its count comes with the header's (Step 77.2); the
 * list is read when it's opened, so no page carries it. Opening it clears
 * the unread badge, and so does the account page's list marking them read
 * (Step 61); once a button in it has led somewhere, it closes rather than
 * hang over the page it led to.
 */
export function SiteNotifications() {
  const { counts, drawn } = useHeaderCounts();
  const [open, setOpen] = React.useState(false);
  // Clear's question is open over the panel: a click or Escape there is
  // the dialog's, not a reason to close the panel under it.
  const [asking, setAsking] = React.useState(false);
  // Seen up to when: opening the bell, or a list marking them read, covers
  // what's there then. One that arrives later counts.
  const [seenUpTo, setSeenUpTo] = React.useState(0);
  const [items, setItems] = React.useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const bellRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const unread = unreadShown(counts, seenUpTo);

  React.useEffect(() => {
    function onRead(event: Event) {
      const upTo = (event as CustomEvent<number>).detail;
      setSeenUpTo((cur) => Math.max(cur, upTo));
    }
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
  }, []);

  // The list, read while the panel is open: on opening, again when the page
  // is drawn again (an answer given in it, a save elsewhere), and when
  // something new arrives. What was there stays up meanwhile.
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/notifications", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`notifications ${res.status}`);
        const body = (await res.json()) as { items: NotificationItem[] };
        setItems(body.items);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, drawn, counts.latestUnreadAt, attempt]);

  React.useEffect(() => {
    if (!open || asking) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Focus in the panel would go with it, to the page's start: it goes
      // back to the bell instead (Step 70).
      if (panelRef.current?.contains(document.activeElement)) {
        bellRef.current?.focus();
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, asking]);

  function toggle() {
    setOpen((v) => {
      if (!v) setSeenUpTo((cur) => Math.max(cur, counts.latestUnreadAt));
      return !v;
    });
    setAsking(false);
    setFailed(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={bellRef}
        size="sm"
        variant="ghost"
        className="relative tap-target"
        onClick={toggle}
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <NavCount variant="destructive">{unread}</NavCount>
        ) : null}
      </Button>

      {open ? (
        <div
          ref={panelRef}
          // A link to where they already are — "View on tree" for whoever is
          // open — changes no address for it to close by (Step 77.3).
          onClick={(event) => {
            const link = (event.target as Element).closest("a[href]");
            if (
              link instanceof HTMLAnchorElement &&
              link.href === window.location.href
            )
              setOpen(false);
          }}
          className="absolute top-full right-0 z-50 mt-2 max-h-[70vh] w-[min(22rem,90vw)] overflow-y-auto rounded-lg border border-border bg-card p-3 text-left shadow-md"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            {/* Focus lands here once Clear has gone with the items. */}
            <p tabIndex={-1} className="font-heading text-sm font-medium">
              Notifications
            </p>
            {items ? (
              <ClearNotificationsButton items={items} onOpenChange={setAsking} />
            ) : null}
          </div>
          <React.Suspense fallback={null}>
            <CloseOnNavigate onNavigate={() => setOpen(false)} />
          </React.Suspense>
          {items ? (
            <NotificationsList
              items={items}
              showTree
              currentTreeId={counts.currentTreeId}
            />
          ) : failed ? (
            <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              <p role="alert">Couldn’t load them.</p>
              <Button
                size="xs"
                variant="ghost"
                className="relative tap-target"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div aria-busy="true" className="flex flex-col gap-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <span className="sr-only">Loading notifications</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
