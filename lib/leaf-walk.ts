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
 * Whoever is drawn in both views travels between the two places
 * (`walkMorphs`): the parent's pill grows into their leaf, the ghosts
 * sharpen into pills, the leaf walked from shrinks to a pill. A spouse is
 * always on the left and a sibling on the right, from either side, so the
 * way back isn't the mirror of the way there; the leaf view keeps the move
 * it made and reverses it. Pure, so it is tested without a phone.
 */

import type { GhostLayout } from "@/lib/leaf-ghosts";
import type { OrbitLayout } from "@/lib/leaf-orbit";

type XY = { x: number; y: number };

/**
 * Where someone drawn in the new view starts, against where they end: how
 * far off (with the scene moved `by`) and at what scale.
 */
export type WalkMorph = { dx: number; dy: number; scale: number };

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
 * Everyone the new view draws (its leaf and pills) who was drawn in the
 * old one too, by id: they start where they were, once the scene has
 * moved `by`, at the size they were, and ease into place. The leaf walked
 * from keeps its size as it goes to its pill (a pill as large as a leaf
 * would only look odd); the others take their old pill's or ghost's.
 */
export function walkMorphs(
  from: WalkScene,
  to: WalkScene,
  by: XY,
): Record<string, WalkMorph> {
  const morphs: Record<string, WalkMorph> = {};
  const ids = [to.focusId, ...to.layout.pills.flatMap((p) => (p.id ? [p.id] : []))];
  for (const id of ids) {
    const was = drawnAs(from, id);
    const is = drawnAs(to, id);
    if (!was || !is) continue;
    morphs[id] = {
      dx: was.x + by.x - is.x,
      dy: was.y + by.y - is.y,
      scale: was.leaf ? 1 : was.width / is.width,
    };
  }
  return morphs;
}

/** Where someone is drawn in a scene: their leaf's middle, pill or ghost. */
export function placeOf(scene: WalkScene, id: string): XY | null {
  const drawn = drawnAs(scene, id);
  return drawn ? { x: drawn.x, y: drawn.y } : null;
}

function drawnAs(
  scene: WalkScene,
  id: string,
): { x: number; y: number; width: number; leaf: boolean } | null {
  const { layout, ghosts } = scene;
  if (id === scene.focusId) return { ...leafMiddle(layout), width: layout.leaf.width, leaf: true };
  const pill = layout.pills.find((p) => p.id === id);
  if (pill) return { x: pill.x, y: pill.y, width: layout.pill.width, leaf: false };
  const ghost = ghosts?.ghosts.find((g) => g.id === id);
  if (ghost)
    return { x: ghost.x, y: ghost.y, width: ghosts!.sizes[ghost.depth - 1].width, leaf: false };
  return null;
}

function leafMiddle(layout: OrbitLayout): XY {
  const { leaf } = layout;
  return { x: leaf.x + leaf.width / 2, y: leaf.y + leaf.height / 2 };
}

const minus = (a: XY, b: XY) => ({ x: a.x - b.x, y: a.y - b.y });
