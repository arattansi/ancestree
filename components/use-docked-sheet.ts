"use client";

import * as React from "react";

/** On the root element while a node's details sheet is docked open. */
export const DOCKED_SHEET_ATTR = "data-docked-sheet-open";

let docked = 0;

/**
 * Marks the root element while a docked sheet (a person's or a companion's)
 * is open, so the site header can move aside and toasts keep left of it
 * (globals.css).
 *
 * Said here rather than asked of the page with `:root:has([data-docked-sheet]
 * [data-open])`: `data-open` is what Base UI puts on every open popup,
 * tooltip and collapsible, so the browser checked that `:has()` again each
 * time one opened or closed anywhere, and restyled the whole document from
 * the root down when it did. On a canvas that was every click: ~2,500
 * elements restyled to move the spotlight (Step 101). Counted, so two sheets
 * crossing over never leave the header unmarked while one is still open.
 */
export function useDockedSheet(open: boolean) {
  // Before paint, as the `:has()` rule took effect, so the header never
  // shows a frame under the sheet.
  React.useLayoutEffect(() => {
    if (!open) return;
    docked++;
    document.documentElement.setAttribute(DOCKED_SHEET_ATTR, "");
    return () => {
      docked--;
      if (docked === 0)
        document.documentElement.removeAttribute(DOCKED_SHEET_ATTR);
    };
  }, [open]);
}
