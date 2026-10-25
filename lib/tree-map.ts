/**
 * A whole tree on a phone (Step 206): everyone on it as a small gray pill,
 * seated exactly where the web's canvas seats their card
 * (`lib/tree-layout.ts`, the same anchors, couples, rows and blocks), so the
 * tree's shape on the phone is the tree's shape on the desktop. Each pill
 * sits in the middle of the slot its card would fill, and the lines run as
 * the canvas's do: a couple's children hang off a bar under the gap between
 * them (`descentGeometry`), partners are joined level (`lateralGeometry`,
 * dashed when divorced), and siblings with no parent on the tree share a
 * bracket (`siblingBracketPoints`). Everything is in the canvas's own units;
 * the phone scales the lot to fit its screen. Pure, so it is tested without
 * a phone.
 */

import { ownRoots } from "@/lib/branch";
import {
  descentGeometry,
  descentRoute,
  lateralGeometry,
  siblingBracketPoints,
  type CardRect,
} from "@/lib/edge-geometry";
import { NODE_H, NODE_W, type XY } from "@/lib/tree-dimensions";
import { layoutTree, type LayoutPerson, type LayoutRelationship } from "@/lib/tree-layout";

/** A pill's size in canvas units: most of its card's slot, so names read. */
export const MAP_PILL_W = 176;
export const MAP_PILL_H = 48;

export type MapPill = {
  id: string;
  /** The pill's centre. */
  x: number;
  y: number;
};

export type MapLine = {
  kind: "descent" | "spouse" | "bracket";
  points: XY[];
  /** A former marriage. */
  dashed?: boolean;
};

export type TreeMap = {
  pills: MapPill[];
  lines: MapLine[];
  /** Around every pill, in canvas units. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export type MapInput = {
  people: readonly LayoutPerson[];
  lines: readonly (LayoutRelationship & { is_divorced?: boolean })[];
  /** The tree's bloodline anchors, as the web centres its canvas on them. */
  anchorIds: readonly string[];
  /** The member's own entry: whose Roots the tree is centred on. */
  selfId: string | null;
};

const EMPTY: TreeMap = {
  pills: [],
  lines: [],
  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
};

/** The pill in the middle of a card's slot, as a rectangle. */
export function pillRect(slot: XY): CardRect {
  return {
    x: slot.x + (NODE_W - MAP_PILL_W) / 2,
    y: slot.y + (NODE_H - MAP_PILL_H) / 2,
    w: MAP_PILL_W,
    h: MAP_PILL_H,
  };
}

/**
 * Whom the layout centres on: the anchors the member is blood to, as the
 * web's canvas does (`ownRoots`), else every anchor on the tree, else the
 * member themself, else whoever comes first.
 */
export function mapAnchors(input: MapInput): string[] {
  const ids = new Set(input.people.map((p) => p.id));
  const anchors = input.anchorIds.filter((id) => ids.has(id));
  if (anchors.length > 0 && input.selfId && ids.has(input.selfId)) {
    const own = ownRoots(input.selfId, anchors, input.lines);
    if (own.length > 0) return own;
  }
  if (anchors.length > 0) return anchors;
  if (input.selfId && ids.has(input.selfId)) return [input.selfId];
  return input.people[0] ? [input.people[0].id] : [];
}

export function treeMap(input: MapInput): TreeMap {
  if (input.people.length === 0) return EMPTY;
  const ids = new Set(input.people.map((p) => p.id));
  const lines = input.lines.filter((l) => ids.has(l.from_person) && ids.has(l.to_person));
  const layout = layoutTree([...input.people], lines, { anchorIds: mapAnchors(input) });

  const rects = new Map<string, CardRect>();
  for (const p of input.people) {
    const slot = layout.positions.get(p.id);
    if (slot) rects.set(p.id, pillRect(slot));
  }

  const out: MapLine[] = [];

  // A couple's children off one bar, each child's branch dropping onto the
  // middle of its pill; a lone child straight down.
  for (const union of layout.unions) {
    const parents = union.parents.flatMap((id) => rects.get(id) ?? []);
    const children = union.children.flatMap((id) => rects.get(id) ?? []);
    if (parents.length === 0 || children.length === 0) continue;
    const top = Math.min(...children.map((c) => c.y));
    const descent = descentGeometry(parents, top);
    if (!descent) continue;
    const landXs = children.map((c) => c.x + c.w / 2);
    for (const child of children) {
      const landX = child.x + child.w / 2;
      out.push({
        kind: "descent",
        points: [...descentRoute(descent, landX, landXs), { x: landX, y: child.y }],
      });
    }
  }

  // Partners, level, from one pill's end to the other's.
  for (const l of lines) {
    if (l.type !== "spouse") continue;
    const a = rects.get(l.from_person);
    const b = rects.get(l.to_person);
    if (!a || !b) continue;
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const lateral = lateralGeometry(left, right);
    const points: XY[] = lateral.jogged
      ? [
          { x: left.x + left.w, y: left.y + left.h / 2 },
          { x: (left.x + left.w + right.x) / 2, y: left.y + left.h / 2 },
          { x: (left.x + left.w + right.x) / 2, y: right.y + right.h / 2 },
          { x: right.x, y: right.y + right.h / 2 },
        ]
      : [
          { x: left.x + left.w, y: lateral.y },
          { x: right.x, y: lateral.y },
        ];
    out.push({ kind: "spouse", points, dashed: !!l.is_divorced || undefined });
  }

  // Siblings seated together without a parent on the tree (Steps 125, 126).
  for (const [a, b] of layout.siblingBrackets) {
    const ra = rects.get(a);
    const rb = rects.get(b);
    if (!ra || !rb) continue;
    out.push({ kind: "bracket", points: siblingBracketPoints(ra, rb, [false, false]) });
  }

  const pills: MapPill[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, r] of rects) {
    pills.push({ id, x: r.x + r.w / 2, y: r.y + r.h / 2 });
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  for (const line of out) {
    for (const p of line.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { pills, lines: out, bounds: { minX, minY, maxX, maxY } };
}

/**
 * The zoom at which the whole tree fits a screen, with a margin, and where
 * its top left goes so the tree sits in the middle: the map's opening view.
 */
export function fitMap(
  map: TreeMap,
  screen: { width: number; height: number },
  margin = 24,
  zoom: { min: number; max: number } = { min: 0.08, max: 0.9 },
): { zoom: number; x: number; y: number } {
  const w = Math.max(1, map.bounds.maxX - map.bounds.minX);
  const h = Math.max(1, map.bounds.maxY - map.bounds.minY);
  const fit = Math.min((screen.width - 2 * margin) / w, (screen.height - 2 * margin) / h);
  const z = Math.min(zoom.max, Math.max(zoom.min, fit));
  return {
    zoom: z,
    x: (screen.width - w * z) / 2 - map.bounds.minX * z,
    y: (screen.height - h * z) / 2 - map.bounds.minY * z,
  };
}

/**
 * Where the map's top left goes so `at` (canvas units) sits in the middle of
 * the screen at `zoom`: the view when it opens on whoever was on the leaf.
 */
export function centreOn(
  at: XY,
  zoom: number,
  screen: { width: number; height: number },
): { x: number; y: number } {
  return { x: screen.width / 2 - at.x * zoom, y: screen.height / 2 - at.y * zoom };
}

/**
 * Keep the tree on the screen: however far it's dragged, at least `keep`
 * points of it stay in view on each side.
 */
export function clampOffset(
  offset: XY,
  map: TreeMap,
  zoom: number,
  screen: { width: number; height: number },
  keep = 80,
): XY {
  const left = map.bounds.minX * zoom;
  const right = map.bounds.maxX * zoom;
  const top = map.bounds.minY * zoom;
  const bottom = map.bounds.maxY * zoom;
  return {
    x: Math.min(screen.width - keep - left, Math.max(keep - right, offset.x)),
    y: Math.min(screen.height - keep - top, Math.max(keep - bottom, offset.y)),
  };
}
