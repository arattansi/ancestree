"use client";

import * as React from "react";
import { Panel } from "@xyflow/react";

import { cn } from "@/lib/utils";

/** Who the pointer is over, held outside the canvas's own state. */
export type HoverStore = {
  get: () => string | null;
  set: (id: string | null) => void;
  subscribe: (onChange: () => void) => () => void;
};

/**
 * One per canvas. A pointer crossing the cards changes only this, so it
 * draws the pill again and never the canvas (Step 87's render budget).
 */
export function useHoverStore(): HoverStore {
  const [store] = React.useState<HoverStore>(() => {
    let current: string | null = null;
    const listeners = new Set<() => void>();
    return {
      get: () => current,
      set: (id) => {
        if (id === current) return;
        current = id;
        for (const listener of listeners) listener();
      },
      subscribe: (onChange) => {
        listeners.add(onChange);
        return () => listeners.delete(onChange);
      },
    };
  });
  return store;
}

/** Room kept between the pill and the one in the middle. */
const GAP = 12;

/**
 * Level with the pill in the middle of the canvas's foot, centre to
 * centre; where the two would touch (a long "…'s tree" beside an open
 * sheet), just above that row instead. Measured each time it shows, as
 * the middle pill comes and goes and changes width.
 */
function placeBesideMiddle(pill: HTMLElement) {
  pill.style.translate = "";
  const middle = pill
    .closest(".react-flow")
    ?.querySelector(".react-flow__panel.bottom.center");
  const lead = middle?.firstElementChild;
  if (!middle || !lead) return;
  const own = pill.getBoundingClientRect();
  const beside = lead.getBoundingClientRect();
  const dy =
    own.left - beside.right >= GAP
      ? beside.top + beside.height / 2 - (own.top + own.height / 2)
      : middle.getBoundingClientRect().top - GAP / 2 - own.bottom;
  pill.style.translate = `0 ${Math.round(dy)}px`;
}

/** What the pill says about someone: their name, then a few facts. */
export type HoverSummary = { name: string; detail: string | null };

/**
 * Whoever is under the pointer while they're off a spotlight's line, in a
 * soft pill at the bottom right, level with the pill naming what's lit
 * (Step 97.3; `placeBesideMiddle`). Off the line nothing grows or lights on hover, which pulled
 * the eye away from the line; this names them without covering anything.
 *
 * `describe` answers only for someone still off the line, so a click that
 * lights them, or a spotlight that moves onto them, puts the pill away.
 */
export function OffSpotlightPill({
  store,
  describe,
  className,
}: {
  store: HoverStore;
  describe: (id: string) => HoverSummary | null;
  className?: string;
}) {
  const id = React.useSyncExternalStore(store.subscribe, store.get, () => null);
  const summary = id ? describe(id) : null;
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    if (ref.current) placeBesideMiddle(ref.current);
  }, [summary?.name, summary?.detail]);
  if (!summary) return null;
  return (
    <Panel
      position="bottom-right"
      // Only where there is a pointer to hover with, and room beside the
      // pills in the middle.
      className={cn("pointer-events-none max-sm:hidden", className)}
    >
      <div
        ref={ref}
        aria-hidden
        className="max-w-72 animate-in truncate rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm duration-150 fade-in-0"
      >
        <span className="font-medium text-foreground/80">{summary.name}</span>
        {summary.detail ? ` · ${summary.detail}` : null}
      </div>
    </Panel>
  );
}

/** Whether this device has a pointer that hovers (no finger's tap). */
export function canHover(): boolean {
  return window.matchMedia("(hover: hover)").matches;
}
