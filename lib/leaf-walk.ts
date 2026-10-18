/**
 * How far the iPhone app's leaf view moves when it walks from one leaf to
 * the next (Step 186), so a walk reads as moving through one tree rather
 * than swapping screens: tap a parent and the scene slides down until the
 * parent's pill sits where their leaf will be, and the grandparents' blurred
 * ghosts above it (Step 184) come into focus as the new leaf's parent pills.
 * A child slides it up, a spouse (on the left) right, a sibling (on the
 * right) left, and back slides it the way it came.
 *
 * The move is the one that carries the person walked to from where they
 * were drawn (a pill, or a ghost) to the middle of their own leaf. When
 * they weren't drawn (someone behind a "+n" pill), it's the one that
 * carries the leaf walked from to where the new view draws them. When
 * neither was drawn (a search, or home), there's no way to go: null.
 *
 * Whoever is drawn in both views travels between the two places, growing
 * or shrinking from the one size to the other (`walkMorphs`), as cards
 * glide on the web (Step 189): both views' copies of them take the same
 * path, so the parent's pill grows into their leaf, the leaf walked from
 * shrinks into its pill, the ghosts sharpen into pills and pills shrink into
 * ghosts, and the leaf view only has to choose when one copy hands over to
 * the other. A spouse is always on the left and a sibling on the right, from
 * either side, so the way back isn't the mirror of the way there; the leaf
 * view keeps the move it made and reverses it. Pure, so it is tested
 * without a phone.
 */

import type { GhostLayout } from "@/lib/leaf-ghosts";
import type { OrbitLayout } from "@/lib/leaf-orbit";

type XY = { x: number; y: number };

/** How someone is drawn in a leaf view. */
export type Drawn = "leaf" | "pill" | "ghost";

/**
 * Someone's copy in one of the two views, against the place it rests in
 * that view: how far off (with the scene moved by the walk) and at what
 * scale it is at the other end of the walk, and how it is drawn in each.
 */
export type WalkMorph = { dx: number; dy: number; scale: number; from: Drawn; to: Drawn };

/**
 * The copies of whoever is drawn in both views: the new view's (`arrive`),
 * which start where and as large as the old view drew them, and the old
 * view's (`leave`), which end where and as large as the new view draws them.
 */
export type WalkMorphs = {
  arrive: Record<string, WalkMorph>;
  leave: Record<string, WalkMorph>;
};

/** A leaf view as drawn: who's in the middle, their pills and ghosts. */
export type WalkScene = {
  focusId: string;
  layout: OrbitLayout;
  ghosts: GhostLayout | null;
};

export function walkOffset(from: WalkScene, to: WalkScene): XY | null {
  const there = placeOf(from, to.focusId);
  if (there) return minus(leafMiddle(to.layout), there);
  const here = placeOf(to, from.focusId);
  if (here) return minus(here, leafMiddle(from.layout));
  return null;
}

/**
 * Everyone drawn in both views, by id, with the move `by` the scene makes:
 * each view's copy takes the same path from the old place and size to the
 * new, so the two can hand over anywhere along it.
 */
export function walkMorphs(from: WalkScene, to: WalkScene, by: XY): WalkMorphs {
  const arrive: Record<string, WalkMorph> = {};
  const leave: Record<string, WalkMorph> = {};
  for (const id of new Set([...ownCopies(from), ...ownCopies(to)])) {
    const was = drawnAs(from, id);
    const is = drawnAs(to, id);
    if (!was || !is) continue;
    const [dx, dy] = [was.x + by.x - is.x, was.y + by.y - is.y];
    const kinds = { from: was.kind, to: is.kind };
    // Ghosts are drawn together, not one by one; only leaves and pills move.
    if (is.kind !== "ghost") arrive[id] = { dx, dy, scale: was.width / is.width, ...kinds };
    if (was.kind !== "ghost") leave[id] = { dx: -dx, dy: -dy, scale: is.width / was.width, ...kinds };
  }
  return { arrive, leave };
}

/** Who a view draws one by one: its leaf and its people's pills. */
function ownCopies(scene: WalkScene): string[] {
  return [scene.focusId, ...scene.layout.pills.flatMap((p) => (p.id ? [p.id] : []))];
}

/** Where someone is drawn in a scene: their leaf's middle, pill or ghost. */
export function placeOf(scene: WalkScene, id: string): XY | null {
  const drawn = drawnAs(scene, id);
  return drawn ? { x: drawn.x, y: drawn.y } : null;
}

function drawnAs(
  scene: WalkScene,
  id: string,
): { x: number; y: number; width: number; kind: Drawn } | null {
  const { layout, ghosts } = scene;
  if (id === scene.focusId) return { ...leafMiddle(layout), width: layout.leaf.width, kind: "leaf" };
  const pill = layout.pills.find((p) => p.id === id);
  if (pill) return { x: pill.x, y: pill.y, width: layout.pill.width, kind: "pill" };
  const ghost = ghosts?.ghosts.find((g) => g.id === id);
  if (ghost)
    return { x: ghost.x, y: ghost.y, width: ghosts!.sizes[ghost.depth - 1].width, kind: "ghost" };
  return null;
}

function leafMiddle(layout: OrbitLayout): XY {
  const { leaf } = layout;
  return { x: leaf.x + leaf.width / 2, y: leaf.y + leaf.height / 2 };
}

const minus = (a: XY, b: XY) => ({ x: a.x - b.x, y: a.y - b.y });
