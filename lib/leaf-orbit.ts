/**
 * Where everything goes in the iPhone app's one-leaf view (Step 147): one
 * person as a leaf in the middle of the screen, and a circle for each of
 * their relatives one line away — parents in a row above, children in a row
 * below, spouses in a column to the left and siblings in a column to the
 * right (`lib/first-degree.ts` says who is which).
 *
 * The leaf keeps one size for a screen, so walking from leaf to leaf never
 * resizes it. Its stem reaches left to the spouses' column, and its tip
 * stops a gap short of the siblings'.
 *
 * Circles come in three sizes, named or bare; the largest at which every
 * group fits is used for all of them, so one family never mixes sizes. A
 * group that fits at none shows as many as there's room for, the last
 * circle standing in for the rest ("+3").
 *
 * The columns are as tall as the larger of the leaf and the longer column;
 * the rows sit outside that band, so a long row never runs into a column.
 * The leaf's height counts the room a maple's lobes take above and below
 * its box (`BLADE_OVERHANG`), whatever the leaf, so the rows keep their
 * places from leaf to leaf and never sit on a lobe (Step 150).
 * Everything is centred in the frame. Pure, so it is tested without a phone.
 */

import { BLADE_OVERHANG } from "@/lib/leaf-shapes";

export type OrbitSide = "parents" | "children" | "spouses" | "siblings";

export const ORBIT_SIDES: readonly OrbitSide[] = [
  "parents",
  "children",
  "spouses",
  "siblings",
];

export type OrbitGroups = Record<OrbitSide, readonly string[]>;

export type OrbitDot = {
  side: OrbitSide;
  /** The relative, or null for the circle standing in for the rest. */
  id: string | null;
  /** How many the "+n" circle stands for; 0 on a relative's circle. */
  more: number;
  /** The circle's centre. */
  x: number;
  y: number;
};

export type OrbitLayout = {
  /**
   * The leaf's box (`BOX_W` × `BOX_H` scaled), from its top left. Its blade
   * may stand `BLADE_OVERHANG` (scaled) above it and hang as far below.
   */
  leaf: { x: number; y: number; width: number; height: number };
  /** Every circle's diameter. */
  dot: number;
  /** Whether names show beside the circles. */
  named: boolean;
  dots: OrbitDot[];
};

/** The blade box's proportions (`lib/leaf-shapes.ts`). */
const LEAF_ASPECT = 150 / 208;
/** The height a leaf takes for its width, with its overhang top and bottom. */
const LEAF_REACH = (150 + 2 * BLADE_OVERHANG) / 208;

/** The circle sizes, largest first. */
export const DOT_SIZES = [
  { dot: 56, named: true },
  { dot: 44, named: true },
  { dot: 34, named: false },
] as const;

/** A name's line, under a circle (above one, in the parents' row). */
export const NAME_H = 18;
/** How wide a named circle's cell is: its name is wider than the circle. */
export const NAME_W = 72;
/** Between neighbouring circles. */
const GAP = 10;
/** From the frame's edges. */
export const EDGE = 12;
/** Between the leaf's band and the rows; between the tip and the siblings. */
const RING = 20;
const LEAF_MAX = 360;
const LEAF_MIN = 150;

type Size = (typeof DOT_SIZES)[number];

const cellW = (s: Size) => (s.named ? Math.max(s.dot, NAME_W) : s.dot);
const cellH = (s: Size) => s.dot + (s.named ? NAME_H : 0);

/** The leaf's width in a frame this wide (and this tall). */
export function leafWidth(width: number, height: number): number {
  // The stem runs to the middle of the spouses' column; the siblings'
  // column is whole, a gap past the tip.
  const across = width - 2 * EDGE - NAME_W * 1.5 - RING;
  // Room for a named row above and below.
  const tall = (height - 2 * EDGE - 2 * (cellH(DOT_SIZES[0]) + RING)) / LEAF_REACH;
  return Math.max(LEAF_MIN, Math.min(LEAF_MAX, across, tall));
}

/** How many of `n` circles get a place in `length`, the rest as "+n". */
function fit(ids: readonly string[], length: number, pitch: number) {
  const room = Math.max(1, Math.floor((length + GAP) / pitch));
  if (ids.length <= room) return { shown: [...ids], more: 0 };
  return { shown: ids.slice(0, room - 1), more: ids.length - (room - 1) };
}

/** Centres for `count` cells of `pitch` along a line, centred on `mid`. */
function along(count: number, pitch: number, mid: number): number[] {
  const start = mid - ((count - 1) * pitch) / 2;
  return Array.from({ length: count }, (_, i) => start + i * pitch);
}

export function orbitLayout(
  frame: { width: number; height: number },
  groups: OrbitGroups,
): OrbitLayout {
  const { width, height } = frame;
  const leafW = leafWidth(width, height);
  const leafH = leafW * LEAF_ASPECT;
  const reachH = leafW * LEAF_REACH;
  const has = (side: OrbitSide) => groups[side].length > 0;

  // The band the columns may take: the frame, less any row and its gap.
  const rowsH = (s: Size) =>
    (has("parents") ? cellH(s) + RING : 0) +
    (has("children") ? cellH(s) + RING : 0);
  const bandMax = (s: Size) => height - 2 * EDGE - rowsH(s);
  const rowMax = width - 2 * EDGE;
  const fits = (s: Size) => {
    const pitchX = cellW(s) + GAP;
    const pitchY = cellH(s) + GAP;
    const rowsFit = (["parents", "children"] as const).every(
      (side) => groups[side].length * pitchX - GAP <= rowMax,
    );
    const colsFit = (["spouses", "siblings"] as const).every(
      (side) => groups[side].length * pitchY - GAP <= bandMax(s),
    );
    return rowsFit && colsFit;
  };
  const size = DOT_SIZES.find(fits) ?? DOT_SIZES[DOT_SIZES.length - 1];
  const pitchX = cellW(size) + GAP;
  const pitchY = cellH(size) + GAP;

  const parents = fit(groups.parents, rowMax, pitchX);
  const children = fit(groups.children, rowMax, pitchX);
  const spouses = fit(groups.spouses, bandMax(size), pitchY);
  const siblings = fit(groups.siblings, bandMax(size), pitchY);
  const count = (g: { shown: string[]; more: number }) =>
    g.shown.length + (g.more ? 1 : 0);

  const colLen = (n: number) => (n ? n * pitchY - GAP : 0);
  const band = Math.max(reachH, colLen(count(spouses)), colLen(count(siblings)));
  const total =
    band +
    (count(parents) ? cellH(size) + RING : 0) +
    (count(children) ? cellH(size) + RING : 0);
  const top = Math.max(EDGE, (height - total) / 2);
  const bandTop = top + (count(parents) ? cellH(size) + RING : 0);
  const midY = bandTop + band / 2;

  const leafX = EDGE + NAME_W / 2;
  const leaf = { x: leafX, y: midY - leafH / 2, width: leafW, height: leafH };
  // Rows centre on the leaf's middle, where the web's descent lines land,
  // but never run off the frame.
  const rowMid = (n: number) => {
    const half = (n * pitchX - GAP) / 2;
    return Math.min(width - EDGE - half, Math.max(EDGE + half, leafX + leafW / 2));
  };

  const dots: OrbitDot[] = [];
  const place = (
    side: OrbitSide,
    group: { shown: string[]; more: number },
    at: (i: number, n: number) => { x: number; y: number },
  ) => {
    const n = count(group);
    group.shown.forEach((id, i) => dots.push({ side, id, more: 0, ...at(i, n) }));
    if (group.more) dots.push({ side, id: null, more: group.more, ...at(n - 1, n) });
  };
  // A parent's name is above their circle, so the line down to the leaf
  // never crosses it; everyone else's is below.
  const parentY = bandTop - RING - size.dot / 2;
  const childY = bandTop + band + RING + size.dot / 2;
  place("parents", parents, (i, n) => ({
    x: along(n, pitchX, rowMid(n))[i],
    y: parentY,
  }));
  place("children", children, (i, n) => ({
    x: along(n, pitchX, rowMid(n))[i],
    y: childY,
  }));
  // A column's cells hang their names below the circle: centre the cells,
  // not the circles, on the leaf.
  const colY = (i: number, n: number) =>
    along(n, pitchY, midY)[i] - (cellH(size) - size.dot) / 2;
  place("spouses", spouses, (i, n) => ({ x: leafX, y: colY(i, n) }));
  place("siblings", siblings, (i, n) => ({
    x: width - EDGE - NAME_W / 2,
    y: colY(i, n),
  }));

  return { leaf, dot: size.dot, named: size.named, dots };
}

type XY = { x: number; y: number };

/** A straight stretch of line, from (x1, y1) to (x2, y2). */
export type Segment = readonly [x1: number, y1: number, x2: number, y2: number];

/**
 * The lines from a leaf to its circles, as the web's canvas hangs children
 * off a descent bus: from where the group's lines leave the blade
 * (`anchors`, in the frame's points) to a bar alongside the group, and a
 * short drop from the bar to each circle. A crowd of relatives reads as one
 * family that way, where a fan of lines from one point would tangle.
 *
 * Every drop ends at a circle's centre and is drawn under it; a name never
 * sits on one (parents' names are above their circles, everyone else's
 * below, and the columns' bars run beside them). The spouses' bar crosses
 * the stem just right of their names, so with one spouse the stem alone
 * joins them.
 */
export function orbitLines(
  layout: OrbitLayout,
  anchors: Record<OrbitSide, XY>,
): Segment[] {
  const segments: Segment[] = [];
  const r = layout.dot / 2;
  for (const side of ORBIT_SIDES) {
    const dots = layout.dots.filter((d) => d.side === side);
    if (dots.length === 0) continue;
    const a = anchors[side];
    if (side === "parents" || side === "children") {
      // Just off the row, in the gap no column reaches into.
      const barY = side === "parents" ? dots[0].y + r + GAP : dots[0].y - r - GAP;
      const xs = [a.x, ...dots.map((d) => d.x)];
      segments.push([a.x, a.y, a.x, barY]);
      segments.push([Math.min(...xs), barY, Math.max(...xs), barY]);
      for (const d of dots) segments.push([d.x, barY, d.x, d.y]);
    } else {
      // Clear of the names under the circles: the siblings' bar halfway
      // from the tip, the spouses' just past the widest name, on the stem.
      const named = layout.named ? Math.max(r, NAME_W / 2) : r;
      const barX =
        side === "siblings" ? (a.x + dots[0].x - r) / 2 : dots[0].x + named + 4;
      const ys = [a.y, ...dots.map((d) => d.y)];
      if (side === "siblings") segments.push([a.x, a.y, barX, a.y]);
      segments.push([barX, Math.min(...ys), barX, Math.max(...ys)]);
      for (const d of dots) segments.push([barX, d.y, d.x, d.y]);
    }
  }
  // Nothing of no length: a lone relative in line with the leaf needs no bar.
  return segments.filter(([x1, y1, x2, y2]) => x1 !== x2 || y1 !== y2);
}
