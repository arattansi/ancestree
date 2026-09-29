"use client";

import * as React from "react";

import { clearNotifications } from "@/app/actions/claims";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { NotificationItem } from "@/lib/claims";

/**
 * Clears a list of notifications, once asked. A placement request still
 * waiting on an answer stays: it's the one kind of item with nowhere else to
 * answer it.
 *
 * Once nothing's left to clear the button goes, so focus moves to the
 * heading it sits beside rather than drop to the page (Step 70).
 */
export function ClearNotificationsButton({
  items,
  onOpenChange,
}: {
  items: NotificationItem[];
  /** Its question opens or closes, for a dropdown to stay open meanwhile. */
  onOpenChange?: (open: boolean) => void;
}) {
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const heading = React.useRef<Element | null>(null);
  const cleared = React.useRef(false);
  const setTrigger = React.useCallback((element: HTMLButtonElement | null) => {
    trigger.current = element;
    if (element) heading.current = element.previousElementSibling;
  }, []);

  const clearable = items.filter((n) => !n.placementId).map((n) => n.id);
  if (clearable.length === 0) return null;

  // Where focus goes as the question closes: back to this button, unless
  // clearing took the button away with the items.
  function finalFocus() {
    if (!cleared.current && trigger.current?.isConnected) return true;
    const target = heading.current;
    if (!(target instanceof HTMLElement)) return true;
    // Somewhere for focus to land, not a stop for Tab.
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    return target;
  }

  return (
    <ConfirmDialog
      title="Clear notifications?"
      description={
        clearable.length < items.length
          ? "Requests waiting on your answer stay."
          : undefined
      }
      confirmLabel="Clear"
      pendingLabel="Clearing…"
      onConfirm={() => clearNotifications(clearable)}
      onSuccess={() => {
        cleared.current = true;
      }}
      onOpenChange={onOpenChange}
      finalFocus={finalFocus}
      trigger={
        <Button
          ref={setTrigger}
          type="button"
          size="xs"
          variant="ghost"
          className="relative tap-target"
          onClick={() => {
            cleared.current = false;
          }}
        >
          Clear
        </Button>
      }
    />
  );
}
