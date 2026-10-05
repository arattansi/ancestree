"use client";

import * as React from "react";

/**
 * What the /features demos share (Steps 112, 115): each plays once, by
 * itself, while it's on screen, and stops; with reduced motion it doesn't
 * play at all. In a `DemoQueue` they take turns: each starts once the one
 * before it has ended, or once it's scrolled to.
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
 * The middle of the screen: once the page has been scrolled, a demo there,
 * with the one before it not, has been scrolled to.
 */
const LOOKED_AT = "-35% 0px -35% 0px";

type Queue = {
  /** Whether `turn` may start: the turn before has ended, or it's scrolled to. */
  ready: (turn: number) => boolean;
  ended: (turn: number) => void;
  lookedAt: (key: string, turn: number, value: boolean) => void;
};

const QueueContext = React.createContext<Queue | null>(null);

/**
 * Has the demos inside take turns, a `turn` each from 0 down the page:
 * the first starts at once, each other once the one before it has ended
 * (or been taken over), or sooner once it's scrolled into the middle of
 * the screen and the one before isn't. A tall screen showing them all
 * before any scroll still plays them in turn.
 */
export function DemoQueue({ children }: { children: React.ReactNode }) {
  const [ended, setEnded] = React.useState<ReadonlySet<number>>(new Set());
  // The turn of each demo element in the middle of the screen, by key.
  const [looked, setLooked] = React.useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(true);
    window.addEventListener("scroll", onScroll, { once: true, passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const queue = React.useMemo<Queue>(() => {
    const at = new Set(looked.values());
    return {
      ready: (turn) =>
        turn === 0 ||
        ended.has(turn - 1) ||
        (scrolled && at.has(turn) && !at.has(turn - 1)),
      ended: (turn) =>
        setEnded((e) => (e.has(turn) ? e : new Set(e).add(turn))),
      lookedAt: (key, turn, value) =>
        setLooked((l) => {
          if (l.has(key) === value) return l;
          const next = new Map(l);
          if (value) next.set(key, turn);
          else next.delete(key);
          return next;
        }),
    };
  }, [ended, looked, scrolled]);
  return <QueueContext value={queue}>{children}</QueueContext>;
}

/**
 * Whether the demo with `turn` may play: once it may it stays so. Says so
 * to the queue once `ended`. Outside a queue, or with no turn, at once.
 */
export function useTurn(turn: number | undefined, ended: boolean): boolean {
  const queue = React.useContext(QueueContext);
  const ready = !queue || turn === undefined || queue.ready(turn);
  const [go, setGo] = React.useState(ready);
  if (ready && !go) setGo(true);
  React.useEffect(() => {
    if (ended && queue && turn !== undefined) queue.ended(turn);
  }, [ended, queue, turn]);
  return go;
}

/** Tells the queue whether `ref`'s element, part of `turn`'s demo, is in the middle of the screen. */
export function useLookedAt(
  ref: React.RefObject<HTMLElement | null>,
  turn: number | undefined,
) {
  const queue = React.useContext(QueueContext);
  const lookedAt = queue?.lookedAt;
  const key = React.useId();
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !lookedAt || turn === undefined) return;
    const observer = new IntersectionObserver(
      ([entry]) => lookedAt(key, turn, entry.isIntersecting),
      { rootMargin: LOOKED_AT },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      lookedAt(key, turn, false);
    };
  }, [ref, lookedAt, key, turn]);
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
 * screen (Step 115) and it's the demo's `turn`: `reset` first. `replay`
 * plays it again from the start; `ended` says it has played. With reduced
 * motion it doesn't play and counts as ended; the demo shows its last
 * frame instead.
 */
export function useSamplePlay(
  ref: React.RefObject<HTMLElement | null>,
  script: (wait: (ms: number) => Promise<void>) => Promise<void>,
  reset: () => void,
  turn?: number,
) {
  const reduced = useReducedMotion();
  const [run, setRun] = React.useState(0);
  const [ended, setEnded] = React.useState(false);
  const seen = React.useRef(false);
  const onScreen = React.useCallback((value: boolean) => {
    seen.current = value;
  }, []);
  useOnScreen(ref, onScreen);
  useLookedAt(ref, turn);
  const go = useTurn(turn, reduced || ended);
  // The latest script and reset, so a render doesn't restart it.
  const latest = React.useRef({ script, reset });
  React.useEffect(() => {
    latest.current = { script, reset };
  });

  React.useEffect(() => {
    if (reduced || !go) return;
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
  }, [reduced, go, run]);

  return {
    reduced,
    ended: reduced || ended,
    replay: () => setRun((n) => n + 1),
  };
}
