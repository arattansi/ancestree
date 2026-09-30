"use client";

import * as React from "react";

/**
 * The photo address a face draws (Step 87.5): `src`, except that while a new
 * address for a face already showing a photo is still loading, it keeps the
 * one it shows. Base UI's `AvatarImage` drops to its fallback, the initials,
 * whenever its `src` changes until the new picture has loaded, so a photo
 * signed again (its kept address near its end, or a zoomed crop asking for
 * a larger card copy) blinked to initials. Nothing shown yet, or no photo
 * any more: `src` at once.
 */
export function useSteadyPhoto(src: string | null): string | null {
  const [shown, setShown] = React.useState(src);
  const waiting = shown !== null && src !== null && src !== shown;
  // Held in state and set while rendering, as `useKept` does.
  if (!waiting && shown !== src) setShown(src);
  React.useEffect(() => {
    if (!waiting || src === null) return;
    let live = true;
    const next = new Image();
    // Once it's in the browser's cache the avatar finds it already loaded.
    next.onload = next.onerror = () => {
      if (live) setShown(src);
    };
    next.src = src;
    return () => {
      live = false;
    };
  }, [waiting, src]);
  return waiting ? shown : src;
}
