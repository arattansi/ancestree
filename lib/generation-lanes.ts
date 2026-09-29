/**
 * The generation lanes behind the cards (Step 77.6, moved out of
 * `lib/tree-layout.ts`): what each row is called, and where its title sits
 * as the canvas zooms and pans.
 */

import { ROW_GAP } from "@/lib/tree-dimensions";

/** A generation lane drawn behind the cards. */
export type GenerationBand = {
  generation: number;
  /** Top of the lane, and its height, in canvas units. */
  y: number;
  height: number;
  /** "Grandparents", "Children", … relative to the anchors. */
  label: string;
  /** "b. 1920s" when that generation has enough birth years to be worth it. */
  sublabel: string | null;
  count: number;
};

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/** "One", "Two", … falling back to digits once the words get unwieldy. */
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/**
 * A generation band's label: "Generation Two", not "Grandparents".
 *
 * A row holds a whole cohort, not one relationship — your parents share theirs
 * with their siblings, their siblings' partners, and everyone else born into
 * it — so naming the row after a relationship mislabels every aunt and uncle on
 * it. Numbering the generation is true of everyone in the row.
 *
 * Numbers count *outward from the founders*: ancestors go up (parents are
 * Generation One, grandparents Two) and descendants go down (children are
 * Generation minus One). That is the inverse of the internal generation index,
 * which grows downward with `y`.
 */
export function generationLabel(generation: number): string {
  if (generation === 0) return "Founders' generation";
  const away = -generation;
  return away > 0
    ? `Generation ${numberWord(away)}`
    : `Generation minus ${numberWord(-away)}`;
}

/**
 * "b. 1950s" for a row born in one decade, "b. 1950s–1960s" when it spans more.
 *
 * A generation is a cohort, not a cohort of one age: two sets of parents born a
 * decade apart genuinely share the row, and picking one decade for the label
 * makes half that row look misfiled. `null` when too few birth years are known
 * for a date to mean anything.
 */
export function decadeRange(years: number[], rowSize: number): string | null {
  if (years.length < Math.max(2, Math.ceil(rowSize / 2))) return null;
  const decade = (year: number) => Math.floor(year / 10) * 10;
  const first = decade(Math.min(...years));
  const last = decade(Math.max(...years));
  return first === last ? `b. ${first}s` : `b. ${first}s–${last}s`;
}

/** A lane title's line, in its own px: `text-xs leading-none` in `family-tree.tsx`. */
export const LANE_TITLE_H = 12;
/** Where the title sits at life size, in canvas units from the lane's top (`top-2`). */
const LANE_TITLE_TOP = 8;
/** Room kept between a magnified title and its row's cards, in the title's own px. */
const LANE_TITLE_CLEAR = 4;
/**
 * As large as the gap between two rows of cards holds. A lane starts halfway
 * across that gap, so a title this size reaches up to the row above's cards
 * and no further.
 */
export const LANE_TITLE_MAX_SCALE = ROW_GAP / (LANE_TITLE_H + LANE_TITLE_CLEAR);

/**
 * A generation lane's title, sized for the zoom (Step 32). The lane is drawn
 * in canvas units, so zoomed out its title shrank with it until it couldn't be
 * read. Below life size it is magnified back to its life size on screen, where
 * it has always sat near the lane's top-left. Where that would run it into its
 * row's cards, it rises into the gap above them, and it never grows past what
 * that gap holds, so it covers no card and no other lane's title. Only a
 * whole-tree view framed below the canvas's own minimum zoom (a wide tree on a
 * phone) has less room than that; there it shrinks with everything else.
 *
 * `scale` magnifies the title about its top-left corner; `top` is in canvas
 * units from the lane's top.
 */
export function laneTitleFit(zoom: number): { scale: number; top: number } {
  const scale =
    Number.isFinite(zoom) && zoom > 0
      ? Math.min(Math.max(1, 1 / zoom), LANE_TITLE_MAX_SCALE)
      : 1;
  // The lane's cards start halfway down the gap between rows.
  const top = Math.min(
    LANE_TITLE_TOP,
    ROW_GAP / 2 - (LANE_TITLE_H + LANE_TITLE_CLEAR) * scale,
  );
  return { scale, top };
}

/** A title's inset from its lane's left end, in canvas units. */
export const LANE_TITLE_LEFT = 16;
/**
 * How far in from the canvas's left edge a pinned title sits, in screen px:
 * in line with the controls at the canvas's top left above it (React Flow's
 * 15px panel margin).
 */
export const LANE_TITLE_PIN = 16;

/**
 * Where a lane's title sits along the lane (Step 32.3), in canvas units from
 * the lane's left end. It sits at its inset while the lane's start is on
 * screen. Once the reader pans past that, it's pinned just inside the
 * canvas's left edge, so each row's title stays in view however far along
 * the tree they are. It never runs past the lane's far end.
 *
 * `viewLeft` is the canvas x at the canvas's left edge (the viewport's
 * `-x / zoom`); `width` is the title's width in canvas units, magnification
 * included.
 */
export function laneTitleLeft({
  laneLeft,
  laneWidth,
  viewLeft,
  zoom,
  width,
}: {
  laneLeft: number;
  laneWidth: number;
  viewLeft: number;
  zoom: number;
  width: number;
}): number {
  if (!(Number.isFinite(zoom) && zoom > 0 && Number.isFinite(viewLeft))) {
    return LANE_TITLE_LEFT;
  }
  const pinned = viewLeft + LANE_TITLE_PIN / zoom - laneLeft;
  const furthest = laneWidth - LANE_TITLE_LEFT - width;
  return Math.max(LANE_TITLE_LEFT, Math.min(pinned, furthest));
}
