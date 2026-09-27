"use client";

import * as React from "react";

import { localDay } from "@/lib/occasions";

// Told when the day may have turned: at the viewer's midnight, and when a tab
// that slept through it wakes up.
function subscribe(onChange: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 1, 0);
    timer = setTimeout(() => {
      onChange();
      arm();
    }, midnight.getTime() - now.getTime());
  };
  arm();
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * Today in the viewer's own time zone, `YYYY-MM-DD` (Step 57.1), turning over
 * at their midnight. `null` on the server and while hydrating: the server
 * doesn't know the viewer's day, so nothing that depends on it is drawn until
 * the browser does.
 */
export function useToday(): string | null {
  return React.useSyncExternalStore(subscribe, localDay, () => null);
}
