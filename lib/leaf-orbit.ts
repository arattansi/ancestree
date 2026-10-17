/**
 * Where everything goes in the iPhone app's one-leaf view (Steps 147,
 * 179.2): one person as a leaf in the middle of the screen, and a gray pill
 * for each of their relatives one line away — parents in a row above,
 * children in a row below, spouses in a column to the left and siblings in a
 * column to the right (`lib/first-degree.ts` says who is which).
 *
 * The leaf keeps one size for a screen, so walking from leaf to leaf never
 * resizes it: it takes what the two columns of the largest pills leave, so
 * it is no bigger than the family around it (Aalim, Step 179.2: "the leaf
 * proportions are too big"). Its stem ends a gap short of the spouses'
 * pills, and its box a gap short of the siblings'.
 *
 * Pills come in three sizes; the largest at which every group fits is used
 * for all of them, so one family never mixes sizes. A group that fits at
 * none shows as many as there's room for, the last pill standing in for the
 * rest ("+3").
 *
 * The columns are as tall as the larger of the leaf and the longer column;
 * the rows sit outside that band, so a long row never runs into a column.
 * The leaf's height counts the room a maple's lobes take above and below
 * its box (`BLADE_OVERHANG`), whatever the leaf, so the rows keep their
 * places from leaf to leaf and never sit on a lobe (Step 150).
 * Everything is centred in the frame. Pure, so it is tested without a phone.
 *
 * A row with nobody in it can hold a dashed pill asking for the leaf's first
 * parent or child (Step 187, `lib/leaf-adds.ts` says where): it takes a
 * relative's place, in the middle of its row, and the row its room.
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

export type OrbitPill = {
  side: OrbitSide;
  /** The relative, or null for the pill standing in for the rest. */
  id: string | null;
  /** How many the "+n" pill stands for; 0 on a relative's pill. */
  more: number;
  /**
   * The dashed pill asking for the row's first relative (Step 187): no id,
   * nothing more.
   */
  add?: true;
  /** The pill's centre. */
  x: number;
  y: number;
};

export type OrbitLayout = {
  /**
   * The leaf's box (`BOX_W` × `BOX_H` scaled), from its top left. Its blade
   * may stand `BLADE_OVERHANG` (scaled) above it and hang as far below.
   */
  leaf: { x: number; y: number; width: number; height: number };
  /** Every pill's size. */
  pill: PillSize;
  pills: OrbitPill[];
};

export type PillSize = { width: number; height: number };

/** The blade box's proportions (`lib/leaf-shapes.ts`). */
const LEAF_ASPECT = 150 / 208;
/** The height a leaf takes for its width, with its overhang top and bottom. */
const LEAF_REACH = (150 + 2 * BLADE_OVERHANG) / 208;

/** The pill sizes, largest first. The web's pill is 120 × 36. */
export const PILL_SIZES: readonly PillSize[] = [
  { width: 96, height: 32 },
  { width: 86, height: 30 },
  { width: 76, height: 28 },
];

/** Between neighbouring pills. */
const GAP = 8;
/** From the frame's edges. */
export const EDGE = 12;
/**
 * Between the leaf's band and the rows: room for the bar the row's lines
 * branch from, halfway, with its rounded corners.
 */
const ROW_RING = 28;
/** Between the leaf's box and the siblings' pills. */
const SIDE_RING = 16;
/** Between the stem's start and the spouses' pills. */
const STEM_GAP = 16;
const LEAF_MAX = 220;
// An iPhone SE (375 points) leaves 123 between the columns; an iPhone
// 15 (393), 141.
const LEAF_MIN = 120;

/** The leaf's width in a frame this wide (and this tall). */
export function leafWidth(width: number, height: number): number {
  const pill = PILL_SIZES[0];
  const across = width - 2 * EDGE - 2 * pill.width - STEM_GAP - SIDE_RING;
  // Room for a row above and below.
  const tall =
    (height - 2 * EDGE - 2 * (pill.height + ROW_RING)) / LEAF_REACH;
  return Math.max(LEAF_MIN, Math.min(LEAF_MAX, across, tall));
}

/** Where the leaf's box starts: the spouses' column, then the stem's gap. */
const LEAF_LEFT = EDGE + PILL_SIZES[0].width + STEM_GAP;

/** How many of `n` pills get a place in `length`, the rest as "+n". */
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
  /** Which rows, when empty, ask for a first relative (Step 187). */
  adds?: { parents: boolean; children: boolean },
): OrbitLayout {
  const { width, height } = frame;
  const leafW = leafWidth(width, height);
  const leafH = leafW * LEAF_ASPECT;
  const reachH = leafW * LEAF_REACH;
  const leafX = LEAF_LEFT;
  const asks = (side: "parents" | "children") =>
    groups[side].length === 0 && !!adds?.[side];
  const has = (side: "parents" | "children") => groups[side].length > 0 || asks(side);

  // The band the columns may take: the frame, less any row and its gap.
  const rowsH = (s: PillSize) =>
    (has("parents") ? s.height + ROW_RING : 0) +
    (has("children") ? s.height + ROW_RING : 0);
  const bandMax = (s: PillSize) => height - 2 * EDGE - rowsH(s);
  const rowMax = width - 2 * EDGE;
  const fits = (s: PillSize) => {
    const pitchX = s.width + GAP;
    const pitchY = s.height + GAP;
    const rowsFit = (["parents", "children"] as const).every(
      (side) => groups[side].length * pitchX - GAP <= rowMax,
    );
    const colsFit = (["spouses", "siblings"] as const).every(
      (side) => groups[side].length * pitchY - GAP <= bandMax(s),
    );
    return rowsFit && colsFit;
  };
  const size = PILL_SIZES.find(fits) ?? PILL_SIZES[PILL_SIZES.length - 1];
  const pitchX = size.width + GAP;
  const pitchY = size.height + GAP;

  const parents = { ...fit(groups.parents, rowMax, pitchX), add: asks("parents") };
  const children = { ...fit(groups.children, rowMax, pitchX), add: asks("children") };
  const spouses = fit(groups.spouses, bandMax(size), pitchY);
  const siblings = fit(groups.siblings, bandMax(size), pitchY);
  const count = (g: { shown: string[]; more: number; add?: boolean }) =>
    g.shown.length + (g.more ? 1 : 0) + (g.add ? 1 : 0);

  const colLen = (n: number) => (n ? n * pitchY - GAP : 0);
  const band = Math.max(reachH, colLen(count(spouses)), colLen(count(siblings)));
  const total =
    band +
    (count(parents) ? size.height + ROW_RING : 0) +
    (count(children) ? size.height + ROW_RING : 0);
  const top = Math.max(EDGE, (height - total) / 2);
  const bandTop = top + (count(parents) ? size.height + ROW_RING : 0);
  const midY = bandTop + band / 2;

  const leaf = { x: leafX, y: midY - leafH / 2, width: leafW, height: leafH };
  // Rows centre on the leaf's middle, where the web's descent lines land,
  // but never run off the frame.
  const rowMid = (n: number) => {
    const half = (n * pitchX - GAP) / 2;
    return Math.min(width - EDGE - half, Math.max(EDGE + half, leafX + leafW / 2));
  };

  const pills: OrbitPill[] = [];
  const place = (
    side: OrbitSide,
    group: { shown: string[]; more: number; add?: boolean },
    at: (i: number, n: number) => { x: number; y: number },
  ) => {
    const n = count(group);
    group.shown.forEach((id, i) => pills.push({ side, id, more: 0, ...at(i, n) }));
    if (group.more) pills.push({ side, id: null, more: group.more, ...at(n - 1, n) });
    if (group.add) pills.push({ side, id: null, more: 0, add: true, ...at(0, 1) });
  };
  const parentY = bandTop - ROW_RING - size.height / 2;
  const childY = bandTop + band + ROW_RING + size.height / 2;
  place("parents", parents, (i, n) => ({
    x: along(n, pitchX, rowMid(n))[i],
    y: parentY,
  }));
  place("children", children, (i, n) => ({
    x: along(n, pitchX, rowMid(n))[i],
    y: childY,
  }));
  // Spouses' pills end a gap short of the stem's start; siblings' start a gap
  // past the leaf's box. Both columns centre on the leaf's middle.
  place("spouses", spouses, (i, n) => ({
    x: leafX - STEM_GAP - size.width / 2,
    y: along(n, pitchY, midY)[i],
  }));
  place("siblings", siblings, (i, n) => ({
    x: leafX + leafW + SIDE_RING + size.width / 2,
    y: along(n, pitchY, midY)[i],
  }));

  return { leaf, pill: size, pills };
}

type XY = { x: number; y: number };

/** One relative's line: from the leaf to the near edge of their pill. */
export type OrbitLine = {
  side: OrbitSide;
  /** Whose pill it reaches; null for the "+n" pill. */
  id: string | null;
  /** It reaches the dashed pill asking for a first relative (Step 187). */
  add?: true;
  /** Corners, in order: across and down only, never on a slant. */
  points: XY[];
};

/**
 * The lines from a leaf to its pills, as the web's canvas hangs children off
 * a descent bus (`lib/edge-geometry.ts`): from where the group's lines leave
 * the blade (`anchors`, in the frame's points) to a bar halfway to the group,
 * along the bar, and on to the pill's near edge. Each relative's line is a
 * polyline of its own, so the phone rounds its corners as the web does
 * (`roundedPolyline`), and where a group's lines part at the bar they branch
 * like a flow chart's.
 *
 * A row's bar runs halfway between the leaf's band and the row; the
 * siblings' halfway between the tip and their pills; the spouses' halfway
 * between their pills and the stem's start.
 */
export function orbitLines(
  layout: OrbitLayout,
  anchors: Record<OrbitSide, XY>,
): OrbitLine[] {
  const lines: OrbitLine[] = [];
  const { width: w, height: h } = layout.pill;
  for (const side of ORBIT_SIDES) {
    const pills = layout.pills.filter((p) => p.side === side);
    if (pills.length === 0) continue;
    const a = anchors[side];
    for (const p of pills) {
      let points: XY[];
      if (side === "parents") {
        const edge = p.y + h / 2;
        const barY = edge + ROW_RING / 2;
        points = [a, { x: a.x, y: barY }, { x: p.x, y: barY }, { x: p.x, y: edge }];
      } else if (side === "children") {
        const edge = p.y - h / 2;
        const barY = edge - ROW_RING / 2;
        points = [a, { x: a.x, y: barY }, { x: p.x, y: barY }, { x: p.x, y: edge }];
      } else if (side === "siblings") {
        const edge = p.x - w / 2;
        const barX = (a.x + edge) / 2;
        points = [a, { x: barX, y: a.y }, { x: barX, y: p.y }, { x: edge, y: p.y }];
      } else {
        const edge = p.x + w / 2;
        const barX = (a.x + edge) / 2;
        points = [a, { x: barX, y: a.y }, { x: barX, y: p.y }, { x: edge, y: p.y }];
      }
      lines.push({
        side,
        id: p.id,
        ...(p.add ? { add: true as const } : {}),
        points: tidyPolyline(points),
      });
    }
  }
  return lines;
}

/** No repeated corners, and none in the middle of a straight run. */
export function tidyPolyline(points: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (
      prev &&
      last &&
      ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))
    ) {
      out.pop();
    }
    out.push(p);
  }
  return out;
}
