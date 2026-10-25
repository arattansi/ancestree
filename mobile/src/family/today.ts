import * as React from "react";
import { AppState } from "react-native";

import { localDay } from "@/lib/occasions";

// Told when the day may have turned: at the member's midnight, and when the
// app comes back from the background, having slept through it.
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
  const app = AppState.addEventListener("change", (state) => {
    if (state === "active") onChange();
  });
  return () => {
    clearTimeout(timer);
    app.remove();
  };
}

/**
 * Today in the member's own time zone, `YYYY-MM-DD`, turning over at their
 * midnight: the web's `useToday` (Step 57.1) for the phone, which knows the
 * day from the start (Step 205).
 */
export function useToday(): string {
  return React.useSyncExternalStore(subscribe, localDay);
}
