/**
 * A person's sheet's buttons in one row, each the same size (Step 222):
 * invite, copy link, message, edit and the rest. Side by side and equal on
 * a wide sheet, two to a line on a phone; a long label keeps its width and
 * what no longer fits wraps.
 */
export const actionRow = "flex flex-wrap gap-2 empty:hidden";

/** A button of `actionRow`, `size="sm"`, with a whole 44px on a touch screen. */
export const actionRowButton =
  "relative tap-target grow basis-[calc(50%-0.25rem)] sm:basis-0";
