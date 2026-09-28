"use client";

import * as React from "react";

// Keeping keyboard focus when the control that had it goes away (Step 70,
// audit B7). Without these, a keyboard or screen-reader user who presses
// Edit, Cancel or Delete lands on <body>, at the start of the page.

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isDisabled(element: HTMLElement): boolean {
  return "disabled" in element && (element as HTMLButtonElement).disabled;
}

/**
 * Focus has nowhere to be: on the page itself, on an element that's gone,
 * or on one just disabled, which the browser moves it off at its next frame
 * (a Send whose box emptied). A busy PendingButton isn't disabled that way:
 * it keeps focus.
 */
export function focusIsLost(): boolean {
  const active = document.activeElement;
  return (
    !active ||
    active === document.body ||
    !active.isConnected ||
    (active instanceof HTMLElement && isDisabled(active))
  );
}

/** The first control inside `element` a keyboard can reach, if any. */
export function firstFocusable(element: Element | null | undefined): HTMLElement | null {
  if (!element) return null;
  if (element instanceof HTMLElement && element.matches(FOCUSABLE)) return element;
  return element.querySelector<HTMLElement>(FOCUSABLE);
}

/**
 * `returnFocus(() => element)`: once a render has put that element on the
 * page, focus it, if focus was lost on the way (the control that had it
 * went). For what a toggle reveals (the form behind Edit) and what a closed
 * form gives back (the Edit button after Cancel or Save). A request not met
 * within a few seconds is dropped, so focus never jumps later on.
 */
export function useFocusReturn() {
  const request = React.useRef<{
    target: () => HTMLElement | null | undefined;
    until: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const pending = request.current;
    if (!pending) return;
    if (performance.now() > pending.until) {
      request.current = null;
      return;
    }
    const element = pending.target();
    // Not there yet, or still disabled while its call runs: a later render.
    if (!element || !element.isConnected || isDisabled(element)) return;
    request.current = null;
    if (focusIsLost()) element.focus();
  });

  return React.useCallback(
    (target: () => HTMLElement | null | undefined) => {
      request.current = { target, until: performance.now() + 3000 };
    },
    [],
  );
}

/**
 * For a row a removal just took away (a Delete that worked): once it has
 * left the page, if focus went with it, focus the next row's first control,
 * else the previous row's, else `fallback`. Pass the control that was
 * pressed, or the row; the row is its nearest `[data-row]`, `li` or `tr`,
 * or, outside any list, the control itself, and then it's `fallback` or
 * nothing.
 */
export function refocusAfterRemoval(
  from: Element | null | undefined,
  fallback?: () => HTMLElement | null | undefined,
) {
  const row = from?.closest("[data-row], li, tr") ?? from ?? null;
  if (!row) return;
  const next = row.nextElementSibling;
  const previous = row.previousElementSibling;
  // The last row gone, the list may go too: its section is what's left.
  const section = row.parentElement?.closest(
    "section, form, [data-docked-sheet], main",
  );
  const giveUpAt = performance.now() + 5000;

  const check = () => {
    if (row.isConnected) {
      if (performance.now() < giveUpAt) requestAnimationFrame(check);
      return;
    }
    if (!focusIsLost()) return;
    const target =
      firstFocusable(next?.isConnected ? next : null) ??
      firstFocusable(previous?.isConnected ? previous : null) ??
      fallback?.() ??
      landingIn(section);
    target?.focus();
  };
  requestAnimationFrame(check);
}

/**
 * Somewhere in `section` for focus to land when what had it went with its
 * list: its heading (or the button the heading is in, for a section that
 * folds), else its first control.
 */
function landingIn(section: Element | null | undefined): HTMLElement | null {
  if (!section?.isConnected) return null;
  const heading = section.querySelector<HTMLElement>("h1, h2, h3, h4, h5, h6");
  if (heading) {
    const control = heading.closest<HTMLElement>("button, a[href]");
    if (control && section.contains(control)) return control;
    // Somewhere for focus to land, not a stop for Tab.
    if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
    return heading;
  }
  return firstFocusable(section);
}
