"use client";

import * as React from "react";

import {
  INK_ASPECT,
  inkUpTo,
  replayTimeline,
  strokePath,
  type InkBox,
  type InkStroke,
} from "@/lib/card-ink";
import { cn } from "@/lib/utils";

/** The drawing's own units: a box 100 high. */
const HEIGHT = 100;

function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

/** How long a box's ink takes to write out again, for the box after it to wait. */
export function replayLength(strokes: readonly InkStroke[] | null | undefined): number {
  return strokes ? replayTimeline(strokes).duration : 0;
}

/**
 * Ink on a card (Step 217.4): a drawing in its square, or a name signed by
 * hand in its strip, filled as `lib/card-ink.ts` outlines each stroke, in
 * the text's colour. `replay` writes it out again as it was drawn, `delay`
 * ms after it's drawn on the page; with less motion asked for, it's simply
 * there.
 */
export function InkDrawing({
  box,
  strokes,
  label,
  replay = false,
  delay = 0,
  className,
}: {
  box: InkBox;
  strokes: readonly InkStroke[];
  /** Said to a screen reader: "Ada’s drawing". */
  label: string;
  replay?: boolean;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const width = HEIGHT * INK_ASPECT[box];
  const timeline = React.useMemo(() => replayTimeline(strokes), [strokes]);
  const playing = replay && !reduced && timeline.duration > 0;
  // How far into writing it out again, from the first frame; null before it.
  const [at, setAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now + delay;
      const ms = now - start;
      setAt(ms);
      if (ms < timeline.duration) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, delay, timeline]);

  const ms = playing ? (at ?? -1) : Infinity;
  const done = ms >= timeline.duration;
  const shown = done ? timeline.strokes : inkUpTo(timeline.strokes, ms);
  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label={label}
      className={cn("block text-foreground", box === "draw" ? "aspect-square" : "aspect-[4/1]", className)}
    >
      {shown.map((stroke, i) => {
        const writing = !done && i === shown.length - 1 && stroke.length < timeline.strokes[i].length;
        return <path key={i} d={strokePath(stroke, box, width, HEIGHT, !writing)} fill="currentColor" />;
      })}
    </svg>
  );
}
