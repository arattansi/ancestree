"use client";

import * as React from "react";
import { useStoreApi } from "@xyflow/react";

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
  // is zoomed out, rising clear of its row's cards (`laneTitleFit`). And in
  // view along the row (32.3): pinned inside the canvas's left edge once the
  // lane's start is panned off it (`laneTitleLeft`), which needs the canvas x
  // of that edge and the title's own width.
  //
  // Placed straight onto the element as the camera moves, and only when the
  // answer changes (Step 102): drawn by React, every lane rendered and every
  // title restyled on each frame of a pan or zoom, even sitting still at its
  // inset.
  const store = useStoreApi();
  const titleRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    // Layout width, before the magnification: a font arriving late moves it.
    let width = el.offsetWidth;
    let placed = "";
    const place = () => {
      const [x, , zoom] = store.getState().transform;
      const title = laneTitleFit(zoom);
      const left = laneTitleLeft({
        laneLeft: minX,
        laneWidth: maxX - minX,
        viewLeft: -x / zoom,
        zoom,
        width: width * title.scale,
      });
      const next = `${left} ${title.top} ${title.scale}`;
      if (next === placed) return;
      placed = next;
      // A transform alone, not left and top: moving it costs no layout.
      el.style.transform = `translate(${left}px, ${title.top}px) scale(${title.scale})`;
    };
    place();
    const unsubscribe = store.subscribe(place);
    const observer = new ResizeObserver(() => {
      width = el.offsetWidth;
      place();
    });
    observer.observe(el);
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [store, minX, maxX]);
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
        className="absolute top-0 left-0 flex origin-top-left items-baseline gap-2 text-xs leading-none whitespace-nowrap"
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
