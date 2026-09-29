"use client";

import * as React from "react";

// A phone: driven by a finger, with a screen under 600px on its short side,
// Android's own line between a phone and a tablet. The short side, so a
// phone on its side is still a phone; the screen's, not the window's, so a
// tablet in split view is still a tablet.
const TOUCH = "(pointer: coarse)";
const PHONE_SHORT_SIDE = 600;

function isPhone() {
  return (
    window.matchMedia(TOUCH).matches &&
    Math.min(window.screen.width, window.screen.height) < PHONE_SHORT_SIDE
  );
}

function subscribeToDevice(onChange: () => void) {
  const query = window.matchMedia(TOUCH);
  query.addEventListener("change", onChange);
  // A foldable opening out into a tablet resizes the window as it goes.
  window.addEventListener("resize", onChange);
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/**
 * Whether this is a phone, as it changes (Step 49). The server says "not a
 * phone"; nothing can be dragged before hydration anyway.
 */
export function useIsPhone(): boolean {
  return React.useSyncExternalStore(subscribeToDevice, isPhone, () => false);
}
