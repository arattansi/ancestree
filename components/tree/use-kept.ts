"use client";

import * as React from "react";

/**
 * `value`, passed through `keep` against what this returned last time, so
 * what `keep` says is unchanged stays the very same object (Step 87.1). The
 * first value goes through `keep` against itself. Held in state, not a ref:
 * the previous result is read while rendering, which React allows only for
 * state it can throw away with the render.
 */
export function useKept<T>(value: T, keep: (prev: T, next: T) => T): T {
  const [held, setHeld] = React.useState(() => ({
    from: value,
    kept: keep(value, value),
  }));
  if (held.from === value) return held.kept;
  const kept = keep(held.kept, value);
  setHeld({ from: value, kept });
  return kept;
}
