"use client";

import * as React from "react";

// Opt-in, and keyed on being *shown*: pets are off until somebody asks for
// them, and nothing a browser remembered before that rule can count as asking.
const SHOWN_KEY = "ancestree:companions-shown";

// The `storage` event only reaches *other* tabs, so this tab's own listeners
// are told by hand.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Where the choice lives when storage is blocked: this visit only. */
let fallbackShown = false;

function readShown(): boolean {
  try {
    return window.localStorage.getItem(SHOWN_KEY) === "1";
  } catch {
    return fallbackShown;
  }
}

/**
 * Whether pets and companions are drawn on the canvas. Off to begin with, for
 * everyone; switched on, it is remembered in this browser until it is switched
 * back, the same way the canvas tip's dismissal is.
 *
 * The server snapshot says "hidden", which is also the default, so the canvas
 * only changes after hydration for someone who has switched them on.
 */
export function useShowCompanions(): [boolean, (shown: boolean) => void] {
  const shown = React.useSyncExternalStore(subscribe, readShown, () => false);
  const setShown = React.useCallback((next: boolean) => {
    fallbackShown = next;
    try {
      if (next) window.localStorage.setItem(SHOWN_KEY, "1");
      else window.localStorage.removeItem(SHOWN_KEY);
    } catch {
      // Nowhere to remember it; the choice still holds for this visit.
    }
    for (const notify of listeners) notify();
  }, []);
  return [shown, setShown];
}
