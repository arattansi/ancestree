/**
 * What a canvas shows first (Step 169, audit R5): how close it opens on a
 * phone, and what its tip says. Pure, so the canvas and the tests agree.
 */

/**
 * The least zoom a phone opens at: a leaf's 13px name and a card's 14px one
 * read at 10–11px. Fitting a family into a phone's width at once drew them
 * at a third of that, the names too small to make out.
 */
export const READABLE_ZOOM = 0.8;

export type CanvasView = { x: number; y: number; zoom: number };

/**
 * Where a canvas opens: `fitted`, the view it would frame anyway — the
 * whole of My Family Tree, or a tree's canvas on the viewer (Step 131) —
 * unless that's too far out to read on a narrow screen. Then as close as
 * reads, on the viewer's own card when there's one to centre on.
 */
export function openingView({
  fitted,
  narrow,
  self,
}: {
  fitted: CanvasView;
  narrow: boolean;
  /** The middle of the viewer's own card, if it's on the canvas. */
  self: { x: number; y: number } | null;
}): CanvasView {
  if (!narrow || fitted.zoom >= READABLE_ZOOM) return fitted;
  const on = self ?? fitted;
  return { x: on.x, y: on.y, zoom: READABLE_ZOOM };
}

/** From how many generations the tip explains a line's two ends. */
export const LINES_FROM_GENERATIONS = 3;

/**
 * The canvas tip's words: what a click on someone does, "Tap" on a touch
 * screen and "Click" with a mouse; and, once there are enough generations
 * for it to mean anything, what a click on a line lights.
 */
export function canvasTip({
  family,
  touch,
  generations,
}: {
  /** My Family Tree, where a person lights their connection first. */
  family: boolean;
  touch: boolean;
  generations: number;
}): { lead: string; lines: string | null } {
  const verb = touch ? "Tap" : "Click";
  const lower = verb.toLowerCase();
  return {
    lead: family
      ? `${verb} anyone to see how you're connected, and again for their own tree.`
      : `${verb} anyone to see their own tree.`,
    lines:
      generations >= LINES_FROM_GENERATIONS
        ? `On a line, ${lower} near the parents for descendants, or near a child for ancestors.`
        : null,
  };
}
