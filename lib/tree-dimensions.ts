/**
 * The canvas's measures (Step 77.6, moved out of `lib/tree-layout.ts`): a
 * card's size and the gaps the layout keeps, shared by the layout engine,
 * the lines' geometry and the generation lanes.
 */

/** Card size, matching `person-node.tsx` (`w-52`). */
export const NODE_W = 208;
export const NODE_H = 112;
/** Minimum gap between two cards that are not partners. */
export const GUTTER = 48;
/** Partners sit closer together than unrelated neighbours. */
export const COUPLE_GAP = 24;
/** Empty space between one generation's row and the next. */
export const ROW_GAP = 132;
/** Row pitch: one generation to the next, top-left to top-left. */
export const ROW_H = NODE_H + ROW_GAP;
/**
 * A compact "pill" card (Step 19.4): a sibling's partner in a spotlight, named
 * and nothing more. A third of a card's height and a little over half its
 * width, centred on the row so the spouse line to it stays level.
 */
export const PILL_W = 120;
export const PILL_H = 36;

export type XY = { x: number; y: number };
