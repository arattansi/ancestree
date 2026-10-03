"use client";

import * as React from "react";

/**
 * What the /features demos share (Steps 112, 115): each plays once, by
 * itself, while it's on screen, and stops; with reduced motion it doesn't
 * play at all.
 */

/** Thrown out of a demo's `wait` once it's been stopped. */
export class Stopped extends Error {}

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the visitor asked for less motion; no on the server. */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** Calls `onChange` as `ref`'s element comes on screen and goes off it. */
export function useOnScreen(
  ref: React.RefObject<HTMLElement | null>,
  onChange: ((onScreen: boolean) => void) | undefined,
) {
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !onChange) return;
    const observer = new IntersectionObserver(([entry]) =>
      onChange(entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, onChange]);
}

/**
 * A `wait(ms)` for a demo's script: it waits `ms`, then for as long as
 * `seen` says the demo is scrolled away or its tab hidden, so the script
 * picks up where it was left; once `stopped` says so it throws `Stopped`.
 */
export function waiter(seen: () => boolean, stopped: () => boolean) {
  return async (ms: number) => {
    await new Promise((r) => setTimeout(r, ms));
    while (!stopped() && (document.hidden || !seen()))
      await new Promise((r) => setTimeout(r, 250));
    if (stopped()) throw new Stopped();
  };
}

/** Runs a demo's script, a stop being no error. */
export function play(script: () => Promise<void>) {
  script().catch((error) => {
    if (!(error instanceof Stopped)) throw error;
  });
}

/** Types `text` in a character at a time, `ms` apart. */
export async function typeOut(
  text: string,
  set: (typed: string) => void,
  wait: (ms: number) => Promise<void>,
  ms = 70,
) {
  const chars = Array.from(text);
  for (let n = 1; n <= chars.length; n++) {
    set(chars.slice(0, n).join(""));
    await wait(ms);
  }
}

/**
 * Plays a sample demo's `script` once, when `ref`'s element is first on
 * screen (Step 115): `reset` first. `replay` plays it again from the
 * start; `ended` says it has played. With reduced motion it doesn't play
 * and counts as ended; the demo shows its last frame instead.
 */
export function useSamplePlay(
  ref: React.RefObject<HTMLElement | null>,
  script: (wait: (ms: number) => Promise<void>) => Promise<void>,
  reset: () => void,
) {
  const reduced = useReducedMotion();
  const [run, setRun] = React.useState(0);
  const [ended, setEnded] = React.useState(false);
  const seen = React.useRef(false);
  const onScreen = React.useCallback((value: boolean) => {
    seen.current = value;
  }, []);
  useOnScreen(ref, onScreen);
  // The latest script and reset, so a render doesn't restart it.
  const latest = React.useRef({ script, reset });
  React.useEffect(() => {
    latest.current = { script, reset };
  });

  React.useEffect(() => {
    if (reduced) return;
    let stopped = false;
    const wait = waiter(
      () => seen.current,
      () => stopped,
    );
    play(async () => {
      setEnded(false);
      latest.current.reset();
      await wait(700);
      await latest.current.script(wait);
      setEnded(true);
    });
    return () => {
      stopped = true;
    };
  }, [reduced, run]);

  return {
    reduced,
    ended: reduced || ended,
    replay: () => setRun((n) => n + 1),
  };
}
