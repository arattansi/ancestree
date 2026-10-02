"use client";

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
  ELEVATORS_COUPLES,
  ELEVATORS_FAMILIES,
  ELEVATORS_FOCUS_Y,
  ELEVATORS_PEOPLE,
  ELEVATORS_SIBLINGS,
  elevatorsPerson,
  type ElevatorsPerson,
} from "@/lib/elevators-tree";
import { nativeLeaf } from "@/lib/native-leaf";
import type { TreeGraphPerson } from "@/lib/tree";
import { NODE_H, NODE_W } from "@/lib/tree-dimensions";
import { cn } from "@/lib/utils";

/** An entry as the canvas would load it: everything but the name left out. */
function asEntry(p: ElevatorsPerson): TreeGraphPerson {
  return {
    id: p.id,
    first_name: p.first,
    middle_name: null,
    preferred_name: null,
    maiden_name: p.maiden,
    last_name: p.last,
    date_of_birth: null,
    date_of_death: null,
    date_of_birth_precision: "day",
    date_of_death_precision: "day",
    birth_month: null,
    birth_day: null,
    date_of_birth_circa: false,
    date_of_death_circa: false,
    city_of_birth: p.city,
    country_of_birth: p.country,
    place_id_birth: null,
    place_id_death: null,
    is_deceased: false,
    place_of_death: null,
    sex: null,
    email: null,
    email_visible: false,
    birth_place_historical: null,
    death_place_historical: null,
    lineage_type: null,
    photo_path: null,
    photo_crop: null,
    pos_x: null,
    pos_y: null,
    pos_dx: null,
    pos_dy: null,
    owner_user_id: "",
    created_by: "",
    home_tree_id: "",
    placeholder_number: null,
    is_home: true,
    hidden_from_visitors: false,
    blurred: false,
    basic: false,
    approval: "none",
    asked_of: null,
    photo_url: null,
    photo_card_url: null,
    open_report_count: 0,
    claim_status: null,
    claim_id: null,
    account_type: p.account,
    joined_by: null,
  };
}

const LEAVES = ELEVATORS_PEOPLE.map((p) => ({
  p,
  entry: asEntry(p),
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

/**
 * The marketing pages' backdrop (Step 107): the Elevators family
 * (`lib/elevators-tree.ts`) as a spotlight draws a family — the canvas's own
 * leaves and branches — faded back. Hovering a leaf brings it forward and
 * opens its card with the made-up name, as on the canvas. The gap between
 * the parents and me and you sits in the middle of the space it's given,
 * where a centred page puts its words, scaled so the whole family fits
 * around it (on a phone, as much as fits around me and you); shown once
 * it has been measured.
 */
export function ElevatorsTree({ className }: { className?: string }) {
  const frame = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState<Fit | null>(null);

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
      </div>
    </div>
  );
}
