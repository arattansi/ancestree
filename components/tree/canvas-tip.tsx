"use client";

import * as React from "react";

import { canvasTip } from "@/lib/first-canvas";

const DISMISSED_KEY = "ancestree:canvas-tip-dismissed";
// My Family Tree's says something else (Step 97.1), so it's closed apart.
const FAMILY_DISMISSED_KEY = "ancestree:family-tip-dismissed";

// Another tab dismissing the tip hides it here too.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readDismissed(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Storage blocked (private mode, site data off): show the tip, and let
    // the close button hide it for this visit.
    return false;
  }
}

// A finger rather than a mouse (Step 169): "Tap", not "Click".
const TOUCH = "(pointer: coarse)";

function subscribeToPointer(onChange: () => void) {
  const query = window.matchMedia(TOUCH);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The two things the canvas does on a click that nothing on screen mentions:
 * a person pulls their own tree out of the family, and a line lights up one
 * family's descendants or ancestors depending on which end you pick. Shown
 * until dismissed; the dismissal is remembered in this browser only.
 *
 * The server snapshot says "dismissed", so the tip never renders on the server
 * and appears after hydration only for people who haven't closed it.
 *
 * Drawn inside the canvas's bottom-centre panel, which sizes it.
 *
 * On My Family Tree a person lights their connection to the reader instead
 * (Step 97.1), and their own tree on a second tap (97.2): the tip says so.
 * It says "Click" with a mouse and "Tap" on a touch screen, and leaves the
 * lines out until the tree has the generations to show them on (Step 169).
 */
export function CanvasTip({
  family = false,
  generations,
}: {
  family?: boolean;
  /** How many generations the canvas draws. */
  generations: number;
}) {
  const key = family ? FAMILY_DISMISSED_KEY : DISMISSED_KEY;
  const dismissed = React.useSyncExternalStore(
    subscribe,
    () => readDismissed(key),
    () => true,
  );
  const touch = React.useSyncExternalStore(
    subscribeToPointer,
    () => window.matchMedia(TOUCH).matches,
    () => false,
  );
  const [closed, setClosed] = React.useState(false);
  if (dismissed || closed) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Nowhere to remember it; closing still hides it for this visit.
    }
    setClosed(true);
  }

  const tip = canvasTip({ family, touch, generations });
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-md">
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">{tip.lead}</span>
        {tip.lines ? ` ${tip.lines}` : null}
      </p>
      <button
        type="button"
        className="relative tap-target text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Dismiss tip"
      >
        ✕
      </button>
    </div>
  );
}
