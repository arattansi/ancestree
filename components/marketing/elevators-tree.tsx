"use client";

import { Cake, Heart } from "lucide-react";
import * as React from "react";

import { bladeTop, LeafCard } from "@/components/tree/leaf-card";
import { SPOTLIGHT_BROWN } from "@/components/tree/spotlight-colours";
import {
  descentGeometry,
  leafBranchPath,
  leafLandX,
  roundedPolyline,
  siblingBracketPoints,
  type CardRect,
} from "@/lib/edge-geometry";
import {
  ELEVATORS_BASE_X,
  ELEVATORS_BOUNDS,
  ELEVATORS_BUBBLES,
  ELEVATORS_COUPLES,
  ELEVATORS_FAMILIES,
  ELEVATORS_FOCUS_Y,
  ELEVATORS_PEOPLE,
  ELEVATORS_SIBLINGS,
  ELEVATORS_UPCOMING,
  elevatorsPerson,
  type ElevatorsOccasion,
} from "@/lib/elevators-tree";
import { marketingEntry } from "@/lib/marketing-entry";
import { nativeLeaf } from "@/lib/native-leaf";
import { localDay, occasionDay, occasionTitle } from "@/lib/occasions";
import { NODE_H, NODE_W } from "@/lib/tree-dimensions";
import { cn } from "@/lib/utils";

const LEAVES = ELEVATORS_PEOPLE.map((p) => ({
  p,
  entry: marketingEntry(p),
  leaf: nativeLeaf({ city_of_birth: p.city, country_of_birth: p.country }),
}));

const cardOf = (id: string): CardRect => {
  const { x, y } = elevatorsPerson(id);
  return { x, y, w: NODE_W, h: NODE_H };
};

/**
 * Every line, routed as a spotlight routes them (`canvas-edges.tsx`): a
 * level line between partners, and from the middle of it a trunk down to
 * the children's bar, dropping over each leaf to just above its blade.
 * Sisters with no parents here get the bracket, dashed (`BRACKETS`).
 */
const LINES: string[] = [
  ...ELEVATORS_COUPLES.map(([a, b]) => {
    const [left, right] = [cardOf(a), cardOf(b)];
    const y = left.y + left.h / 2;
    return `M ${left.x + left.w},${y} L ${right.x},${y}`;
  }),
  ...ELEVATORS_FAMILIES.flatMap(({ parents, children }) => {
    const kids = children.map(cardOf);
    const descent = descentGeometry(
      parents.map(cardOf),
      Math.min(...kids.map((k) => k.y)),
      { leafy: true },
    );
    if (!descent) return [];
    const landXs = kids.length > 1 ? kids.map(leafLandX) : [];
    return kids.map((kid, i) => {
      const { leaf } = LEAVES.find(({ p }) => p.id === children[i])!;
      return leafBranchPath(descent, kid, bladeTop(leaf.shape), 10, landXs);
    });
  }),
];

const BRACKETS: string[] = ELEVATORS_SIBLINGS.map(([a, b]) =>
  roundedPolyline(siblingBracketPoints(cardOf(a), cardOf(b)), 10),
);

const { left, top, width, height } = ELEVATORS_BOUNDS;
/** The gap between the parents and me and you, from the top of the canvas,
 *  and the farther of the canvas's edges above or below it. */
const focusY = ELEVATORS_FOCUS_Y - top;
const reach = Math.max(focusY, height - focusY);

/** Narrower than this to fit everyone, it fits the height alone and
 *  keeps me and you in the middle, the rest cropped off the sides. */
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.15;

type Fit = { scale: number; focusX: number };

function fitInto(box: { width: number; height: number }): Fit {
  const tall = box.height / 2 / reach;
  const all = Math.min(box.width / width, tall);
  return all >= MIN_SCALE
    ? { scale: Math.min(MAX_SCALE, all), focusX: width / 2 }
    : {
        scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, tall)),
        focusX: ELEVATORS_BASE_X - left,
      };
}

/** Where a bubble's tail points at its leaf from: over the blade, right
 *  of where its branch lands, or under it, right of its account mark. */
const BUBBLE_AT = {
  over: { x: NODE_W * 0.62, y: 6 },
  under: { x: NODE_W * 0.72, y: NODE_H + 4 },
};

/**
 * What a relative just did, in a speech bubble by their leaf (Step 130).
 * It keeps its own size while the tree scales under it, so its words stay
 * readable, and is faded back as the leaves are, coming forward on hover.
 */
function Bubble({
  id,
  says,
  side,
  scale,
}: (typeof ELEVATORS_BUBBLES)[number] & { scale: number }) {
  const p = elevatorsPerson(id);
  const at = BUBBLE_AT[side];
  const over = side === "over";
  return (
    <div
      className="absolute hidden opacity-30 transition-opacity duration-300 hover:z-10 hover:opacity-100 md:block"
      style={{ left: p.x - left + at.x, top: p.y - top + at.y }}
    >
      <div
        className={cn(
          "absolute left-0 w-44 rounded-2xl border border-border bg-card px-3 py-2 text-xs leading-snug text-card-foreground shadow-md",
          over
            ? "bottom-2 origin-bottom-left rounded-bl-sm"
            : "top-2 origin-top-left rounded-tl-sm",
        )}
        style={{ transform: `scale(${1 / scale})` }}
      >
        {says}
        {/* The tail: a corner of the card, turned to point at the leaf. */}
        <span
          className={cn(
            "absolute left-3 size-2.5 rotate-45 border-border bg-card",
            over ? "-bottom-[5px] border-r border-b" : "-top-[5px] border-t border-l",
          )}
        />
      </div>
    </div>
  );
}

/** When it is, as the canvas's Upcoming says it: "today", " · Sat 3 Oct". */
function when(o: ElevatorsOccasion, now: Date): string {
  if (o.daysAway === 0) return " today";
  if (o.daysAway === 1) return " tomorrow";
  const day = new Date(now);
  day.setDate(day.getDate() + o.daysAway);
  return ` · ${occasionDay(localDay(day))}`;
}

/**
 * The canvas's **Upcoming** card (`components/tree/upcoming-feed.tsx`),
 * open, with the family's next few birthdays and anniversaries (Step 130):
 * a sample, so nothing in it is pressed. Each is named as their leaf is,
 * by how they're related, and faded back as the leaves are. Its days count from today, so it's drawn once
 * the browser has said what day that is.
 */
function Upcoming({ now }: { now: Date }) {
  return (
    <div className="absolute top-4 right-4 hidden w-64 flex-col gap-2 rounded-xl border border-border bg-card p-3 opacity-30 shadow-md transition-opacity duration-300 hover:opacity-100 lg:flex">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Cake className="size-3.5 text-muted-foreground" />
        Upcoming
      </p>
      <ul className="flex flex-col gap-0.5 border-t border-border pt-2">
        {ELEVATORS_UPCOMING.map((o) => {
          const people = o.people.map(elevatorsPerson);
          const Icon = o.kind === "anniversary" ? Heart : Cake;
          return (
            <li key={o.people.join("~")} className="flex items-center gap-2 px-1.5 py-1">
              <span className="flex shrink-0 -space-x-1.5">
                {people.map((p) => (
                  <span
                    key={p.id}
                    className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-card"
                  >
                    {p.first[0]}
                    {p.last[0].toUpperCase()}
                  </span>
                ))}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm leading-5 font-medium">
                  {people.map((p) => p.label).join(" & ")}
                </span>
                <span className="flex items-center gap-1 text-xs leading-4 text-muted-foreground">
                  <Icon className="size-3 shrink-0" />
                  <span className="truncate">
                    {occasionTitle({ ...o, date: "" })}
                    {when(o, now)}
                  </span>
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The marketing pages' backdrop (Step 107): the Elevators family
 * (`lib/elevators-tree.ts`) as a spotlight draws a family — the canvas's own
 * leaves and branches — faded back. Hovering a leaf brings it forward and
 * opens its card with the made-up name, as on the canvas. The gap between
 * the parents and me and you sits in the middle of the space it's given,
 * where a centred page puts its words, scaled so the whole family fits
 * around it (on a phone, as much as fits around me and you); shown once
 * it has been measured. Over it, as on a tree in use (Step 130): two
 * relatives' speech bubbles (from `md`) and the **Upcoming** card in the
 * top right corner (from `lg`, where everyone fits), clear of the menu
 * held open on the left.
 */
export function ElevatorsTree({ className }: { className?: string }) {
  const frame = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState<Fit | null>(null);
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => {
      const next = fitInto(el.getBoundingClientRect());
      setFit((was) =>
        was?.scale === next.scale && was.focusX === next.focusX ? was : next,
      );
    };
    measure();
    setNow(new Date());
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={frame} aria-hidden className={cn("overflow-hidden", className)}>
      <div
        className={cn(
          "absolute top-1/2 left-1/2 transition-opacity duration-700",
          fit === null && "opacity-0",
        )}
        style={{
          width,
          height,
          transformOrigin: `${fit?.focusX ?? width / 2}px ${focusY}px`,
          transform: `translate(${-(fit?.focusX ?? width / 2)}px, ${-focusY}px) scale(${fit?.scale ?? 1})`,
        }}
      >
        <svg
          viewBox={`${left} ${top} ${width} ${height}`}
          width={width}
          height={height}
          className="absolute inset-0 overflow-visible opacity-20"
        >
          {LINES.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={SPOTLIGHT_BROWN}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ))}
          {BRACKETS.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke={SPOTLIGHT_BROWN}
              strokeWidth={3}
              strokeDasharray="6 6"
              strokeLinecap="round"
            />
          ))}
        </svg>
        {LEAVES.map(({ p, entry, leaf }) => (
          <div
            key={p.id}
            className="absolute opacity-30 transition-opacity duration-300 hover:z-10 hover:opacity-100"
            style={{ left: p.x - left, top: p.y - top }}
          >
            <LeafCard
              person={entry}
              leaf={leaf}
              selected={false}
              isSelf={false}
              label={p.label}
            />
          </div>
        ))}
        {fit
          ? ELEVATORS_BUBBLES.map((b) => (
              <Bubble key={b.id} {...b} scale={fit.scale} />
            ))
          : null}
      </div>
      {/* Only where the whole family fits: cropped to me and you, the
          tree is too close under the card. */}
      {now && fit?.focusX === width / 2 ? <Upcoming now={now} /> : null}
    </div>
  );
}
