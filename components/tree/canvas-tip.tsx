"use client";

import * as React from "react";
import { Panel } from "@xyflow/react";

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

/**
 * The two things the canvas does on a click that nothing on screen mentions:
 * a person pulls their own tree out of the family, and a line lights up one
 * family's descendants or ancestors depending on which end you pick. Shown
 * until dismissed; the dismissal is remembered in this browser only.
 *
 * The server snapshot says "dismissed", so the tip never renders on the server
 * and appears after hydration only for people who haven't closed it.
 *
 * On My Family Tree a person lights their connection to the reader instead
 * (Step 97.1), and the tip says so.
 */
export function CanvasTip({ family = false }: { family?: boolean }) {
  const key = family ? FAMILY_DISMISSED_KEY : DISMISSED_KEY;
  const dismissed = React.useSyncExternalStore(
    subscribe,
    () => readDismissed(key),
    () => true,
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

  return (
    // Sized off the canvas, not the text: a centred panel only gets the half
    // of the canvas right of its anchor to shrink-wrap into, which on a phone
    // stacked the tip into a tall column. 7rem keeps it clear of the zoom
    // controls in the corner.
    <Panel
      position="bottom-center"
      className="w-[min(28rem,calc(100%-7rem))]"
    >
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-md">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {family
              ? "Tap anyone to see how you're connected."
              : "Tap anyone to see their own tree."}
          </span>{" "}
          On a line, tap near the parents for descendants, or near a child for
          ancestors.
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
    </Panel>
  );
}
