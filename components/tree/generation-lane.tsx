"use client";

import * as React from "react";
import { useStore, type ReactFlowState } from "@xyflow/react";

import { countOf } from "@/lib/plural";
import { cn } from "@/lib/utils";
import {
  laneTitleFit,
  laneTitleLeft,
  type GenerationBand,
} from "@/lib/generation-lanes";

/**
 * A generation lane behind the cards: alternating tint plus a label naming the
 * row relative to the founders ("Grandparents · b. 1930s"). This is what makes
 * a large chart scannable — you can find a generation without tracing edges.
 */
export function GenerationLane({
  band,
  minX,
  maxX,
  faded,
}: {
  band: GenerationBand;
  minX: number;
  maxX: number;
  /** A tree has been pulled out; these lanes belong to the one left behind. */
  faded?: boolean;
}) {
  // Legible at any zoom (Step 32): magnified back to life size when the canvas
  // is zoomed out, rising clear of its row's cards (`laneTitleFit`).
  const zoom = useStore((state: ReactFlowState) => state.transform[2]);
  const title = laneTitleFit(zoom);
  // And in view along the row (32.3): pinned inside the canvas's left edge
  // once the lane's start is panned off it (`laneTitleLeft`), which needs the
  // canvas x of that edge and the title's own width.
  const viewLeft = useStore(
    (state: ReactFlowState) => -state.transform[0] / state.transform[2],
  );
  const titleRef = React.useRef<HTMLDivElement>(null);
  const [titleWidth, setTitleWidth] = React.useState(0);
  React.useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    // Layout width, before the magnification: a font arriving late moves it.
    const measure = () => setTitleWidth(el.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const titleLeft = laneTitleLeft({
    laneLeft: minX,
    laneWidth: maxX - minX,
    viewLeft,
    zoom,
    width: titleWidth * title.scale,
  });
  return (
    <div
      className={cn(
        "pointer-events-none absolute transition-opacity duration-500",
        faded && "opacity-20",
      )}
      style={{
        transform: `translate(${minX}px, ${band.y}px)`,
        width: maxX - minX,
        height: band.height,
      }}
    >
      <div
        className={cn(
          "size-full rounded-2xl border border-border/30",
          band.generation % 2 === 0 ? "bg-muted/25" : "bg-transparent",
        )}
      />
      <div
        ref={titleRef}
        className="absolute flex origin-top-left items-baseline gap-2 text-xs leading-none whitespace-nowrap"
        style={{
          left: titleLeft,
          top: title.top,
          transform: `scale(${title.scale})`,
        }}
      >
        <span className="font-medium text-muted-foreground">{band.label}</span>
        {band.sublabel ? (
          <span className="text-muted-foreground/60">{band.sublabel}</span>
        ) : null}
        <span className="text-muted-foreground/50">
          {countOf(band.count, "person", "people")}
        </span>
      </div>
    </div>
  );
}
