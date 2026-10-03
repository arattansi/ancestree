/**
 * How the canvas's lines run between live cards (Step 77.6, moved out of
 * `lib/tree-layout.ts`): a descent from a couple's junction down to each
 * child, a leaf's stem, a sibling bracket and a marriage. Pure: the renderer
 * and the layout engine both read it, so they agree before anything moves.
 */

import { COUPLE_GAP, ROW_GAP, type XY } from "@/lib/tree-dimensions";

/** A card's live rectangle on the canvas, as the renderer currently sees it. */
export type CardRect = { x: number; y: number; w: number; h: number };

/**
 * Where a descent line leaves its parents, the bus its siblings share, and the
 * height the trunk jogs at to meet that bus in the middle (`null`: no room).
 */
export type Descent = {
  startX: number;
  startY: number;
  busY: number;
  stepY: number | null;
};

export type DescentOptions = {
  /**
   * The parents are drawn as leaves rather than cards. A leaf's blade fills
   * its box and overhangs it, so there is no clear edge to leave from except
   * the stem.
   */
  leafy?: boolean;
};

/**
 * Where a couple's descent line starts and where it bends, given the parents'
 * *current* rectangles and the child's current top edge.
 *
 * The canvas calls this on every render with live positions, so the trunk
 * follows the parents as they are dragged instead of staying where the initial
 * layout put it. Kept pure and separate from the renderer so the awkward cases
 * — a lone parent, partners dragged apart, a child pulled up under its parents
 * — are unit-testable.
 */
export function descentGeometry(
  parents: CardRect[],
  childTop: number,
  options: DescentOptions = {},
): Descent | null {
  if (parents.length === 0) return null;

  // A couple's line leaves from the middle of the gap between them: their
  // centres' midpoint when they're the same width, but a card beside a pill
  // (My Family Tree, Step 94) would put that inside the card.
  const [left, right] = [...parents].sort((a, b) => a.x - b.x);
  const startX =
    parents.length === 2
      ? (left.x + left.w + right.x) / 2
      : parents.reduce((sum, r) => sum + r.x + r.w / 2, 0) / parents.length;
  const bottom = Math.max(...parents.map((r) => r.y + r.h));

  // Normally the line starts on the spouse line, in the gap between partners.
  // If that point would land on top of a card — a lone parent, or partners
  // dragged apart far enough that their midpoint sits over one of them — it
  // has to move off the card, and where to depends on what the card is.
  //
  // A rectangle can be left from underneath: below the bottom edge is empty
  // canvas. A leaf cannot — the blade overhangs the box top and bottom and
  // fills it corner to corner, so a line leaving the bottom sets off through
  // the silhouette. The one strip of a leaf card that is never painted is the
  // one to the left of the stem, so a leaf is left the way it is entered: at
  // the stem root, where the branch it hangs on already reaches.
  const overlapsACard = parents.some((r) => startX > r.x && startX < r.x + r.w);
  const stem = options.leafy
    ? parents.reduce((a, b) => (a.x <= b.x ? a : b))
    : null;
  const startY = overlapsACard
    ? stem
      ? stem.y + stem.h / 2
      : bottom
    : parents.reduce((sum, r) => sum + r.y + r.h / 2, 0) / parents.length;

  // Half a row-gap below the parents puts every sibling on one shared bus.
  // A child dragged up close underneath gets a midpoint bend instead, so the
  // bus never ends up below the child it is feeding.
  const busY =
    childTop > bottom + ROW_GAP ? bottom + ROW_GAP / 2 : (bottom + childTop) / 2;

  return {
    startX: overlapsACard && stem ? stem.x : startX,
    startY,
    busY,
    stepY: stepHeight(bottom, busY),
  };
}

/**
 * The trunk's jog runs a quarter-gap below the parents: clear of the bus at
 * half the gap, and of a spotlight's sibling bracket a quarter-gap above the
 * children's row. Squeezed by a child dragged up close, it sits halfway to the
 * bus instead; with too little room for two rounded corners, there is no jog.
 */
function stepHeight(bottom: number, busY: number): number | null {
  const room = busY - bottom;
  if (room >= ROW_GAP / 2) return bottom + ROW_GAP / 4;
  return room >= MIN_STEP_ROOM ? bottom + room / 2 : null;
}

/** Below this much drop from the parents to the bus, the trunk runs straight. */
const MIN_STEP_ROOM = 8;

/**
 * Past this sideways distance a trunk jogs to its bus's midpoint; within it,
 * the jog would be a smudge, so the trunk drops straight.
 */
const STEP_THRESHOLD = 1;

/**
 * The shared head of every descent line out of one union: down out of the
 * parents, sideways at `stepY` to the midpoint of the siblings' bar, down to
 * the bar, and along it to above `landX`, where this child's line drops off.
 *
 * `landXs` are where *every* sibling in the union drops off the bar — this
 * child included — read from their current cards, so the midpoint follows a
 * drag. Every child of a union computes the same trunk, step and bar from the
 * same inputs, so the faint lines overlap exactly instead of doubling.
 *
 * A lone child, or a trunk already within a pixel of the middle, gets today's
 * single bend at the bus: no jog.
 */
export function descentRoute(
  descent: Descent,
  landX: number,
  landXs: number[],
): XY[] {
  const start = { x: descent.startX, y: descent.startY };
  const land = { x: landX, y: descent.busY };
  const step = trunkStep(descent, landXs);
  if (!step) return [start, { x: start.x, y: descent.busY }, land];
  return [
    start,
    { x: start.x, y: step.y },
    { x: step.midX, y: step.y },
    { x: step.midX, y: descent.busY },
    land,
  ];
}

/** Where the trunk jogs to meet its bar in the middle, or null for no jog. */
export function trunkStep(
  descent: Descent,
  landXs: number[],
): { y: number; midX: number } | null {
  if (landXs.length < 2 || descent.stepY === null) return null;
  // Strictly between the trunk's start and the bus, or it is no step at all.
  if (descent.stepY <= descent.startY || descent.stepY >= descent.busY)
    return null;
  const midX = (Math.min(...landXs) + Math.max(...landXs)) / 2;
  if (Math.abs(midX - descent.startX) < STEP_THRESHOLD) return null;
  return { y: descent.stepY, midX };
}

/** Where a leaf's stem meets the branch it hangs on: the card's left edge. */
export const stemPoint = (card: CardRect): XY => ({
  x: card.x,
  y: card.y + card.h / 2,
});

/**
 * How far to the left of a leaf a sibling bracket drops before turning in
 * along the stem. Half the gap a couple leaves between one blade's tip and
 * the next one's stem root, so the drop lands in the middle of the only clear
 * channel there is — clear of the leaf beside it as well as the one it feeds.
 */
export const STEM_LANE = COUPLE_GAP / 2 + 2;

/**
 * How far short of a leaf a descent line stops. The name sits inside the
 * blade, so a line that reached the outline would read as running into it;
 * this leaves a clear gap above the highest point of the leaf — about 6px
 * once the blade's outline and the line's round cap have taken their share.
 */
export const LEAF_LINE_GAP = 10;

/**
 * The branch from a couple down to one leaf: down out of the parents, along
 * the bus their children share, and straight down over the middle of the leaf
 * — stopping `LEAF_LINE_GAP` above the top of its blade, so it never lands on
 * the blade or the name inside it.
 *
 * `bladeTop` is where this leaf's blade starts, measured down from the top of
 * its card: negative for a shape whose lobes stand above the card box, as a
 * maple's do. A child dragged up so close that its blade reaches the bus gets
 * no drop at all — the line ends on the bus above it rather than climbing.
 */
export function leafBranchPath(
  descent: Descent,
  child: CardRect,
  bladeTop: number,
  radius = 10,
  /** Every sibling's landing on the bus, this one's included: see `descentRoute`. */
  landXs: number[] = [],
): string {
  const x = leafLandX(child);
  const y = Math.max(descent.busY, child.y + bladeTop - LEAF_LINE_GAP);
  return roundedPolyline(
    [...descentRoute(descent, x, landXs), { x, y }],
    radius,
  );
}

/** Where a branch drops off the bus onto a leaf: over the middle of it. */
export const leafLandX = (card: CardRect) => card.x + card.w / 2;

/**
 * How far above a row a sibling bracket runs: a quarter of the row gap, well
 * under the half-gap bus that parents hang their children from, so a bracket
 * can never be read as — or run along — a shared parents' line.
 */
export const BRACKET_RISE = ROW_GAP / 4;

/**
 * The bracket joining two siblings who share no parent on the tree (Step
 * 19.3): a stored "sibling of" row whose parents were never entered. With no
 * parents there is no bus to hang them from, so they get a short one of their
 * own, just above the row, arriving at each end as a real sibling bus does:
 * at a leaf, up out of its stem lane; at a card, straight up from the middle
 * of its top (the tree's own bracket, Step 125). `leaves` says which ends are
 * leaves, `a`'s first.
 */
export function siblingBracketPoints(
  a: CardRect,
  b: CardRect,
  leaves: readonly [boolean, boolean] = [true, true],
): XY[] {
  const flip = a.x > b.x;
  const [left, right] = flip ? [b, a] : [a, b];
  const [leftLeaf, rightLeaf] = flip ? [leaves[1], leaves[0]] : leaves;
  const y = Math.min(left.y, right.y) - BRACKET_RISE;
  const leg = (card: CardRect, leaf: boolean): XY[] => {
    if (!leaf) {
      const x = card.x + card.w / 2;
      return [{ x, y: card.y }, { x, y }];
    }
    const stem = stemPoint(card);
    return [
      stem,
      { x: card.x - STEM_LANE, y: stem.y },
      { x: card.x - STEM_LANE, y },
    ];
  };
  return [...leg(left, leftLeaf), ...leg(right, rightLeaf).reverse()];
}

/**
 * An orthogonal run of points as an SVG path with rounded corners. Duplicate
 * and collinear points are dropped, so a leg that collapses to nothing leaves
 * no stray corner behind.
 */
export function roundedPolyline(points: XY[], radius: number): string {
  const pts: XY[] = [];
  for (const p of points) {
    const last = pts[pts.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = pts[pts.length - 2];
    // Three in a line: the middle one is not a corner, so drop it.
    if (
      prev &&
      last &&
      ((prev.x === last.x && last.x === p.x) ||
        (prev.y === last.y && last.y === p.y))
    ) {
      pts.pop();
    }
    pts.push(p);
  }
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const corner = pts[i];
    const before = pts[i - 1];
    const after = pts[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(corner.x - before.x, corner.y - before.y) / 2,
      Math.hypot(corner.x - after.x, corner.y - after.y) / 2,
    );
    const towards = (to: XY) => {
      const len = Math.hypot(to.x - corner.x, to.y - corner.y) || 1;
      return {
        x: corner.x + ((to.x - corner.x) / len) * r,
        y: corner.y + ((to.y - corner.y) / len) * r,
      };
    };
    const inbound = towards(before);
    const outbound = towards(after);
    d += ` L ${inbound.x},${inbound.y} Q ${corner.x},${corner.y} ${outbound.x},${outbound.y}`;
  }
  const end = pts[pts.length - 1];
  return `${d} L ${end.x},${end.y}`;
}

/** A lateral (spouse) line: a horizontal run, or an orthogonal jog. */
export type Lateral = { y: number; jogged: boolean };

/**
 * Where the line between two partners should sit vertically.
 *
 * A lateral connection reads as a connection only when it is level — a line
 * that slopes a few pixels between two cards looks like a mistake rather than a
 * marriage. When both cards' centres agree (the normal case, since every card
 * is the same height) the line is horizontal through those centres. When a
 * partner has been dragged or nudged out of line, the renderer steps around it
 * at right angles instead of drawing a diagonal.
 */
export function lateralGeometry(a: CardRect, b: CardRect): Lateral {
  const centreA = a.y + a.h / 2;
  const centreB = b.y + b.h / 2;
  // Sub-pixel differences come from rounding, not from intent.
  const jogged = Math.abs(centreA - centreB) > 1;
  return { y: (centreA + centreB) / 2, jogged };
}
