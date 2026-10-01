"use client";

import * as React from "react";

// The "Same person?" pairs this browser was told are two people (Step
// 92.4), by `pairKey`. Kept here only: the flag is the viewer's alone, so
// nothing about it is stored or sent anywhere.
const NOT_SAME_KEY = "ancestree:not-same";

const NONE: ReadonlySet<string> = new Set();

// The `storage` event only reaches *other* tabs, so this tab's own listeners
// are told by hand.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Where the answers live when storage is blocked: this visit only. */
let fallback: ReadonlySet<string> = NONE;
/** The last read, so an unchanged store hands back the same set. */
let read: { raw: string | null; keys: ReadonlySet<string> } = {
  raw: null,
  keys: NONE,
};

function readNotSame(): ReadonlySet<string> {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(NOT_SAME_KEY);
  } catch {
    return fallback;
  }
  if (raw === read.raw) return read.keys;
  let keys: ReadonlySet<string> = NONE;
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.length > 0) {
      keys = new Set(list.filter((k): k is string => typeof k === "string"));
    }
  } catch {
    // Unreadable: as if nothing was answered.
  }
  read = { raw, keys };
  return keys;
}

const nothing = () => NONE;

/**
 * The pairs this browser has said aren't one person, and a way to say so or
 * take it back. Nothing to begin with, which is also what the server says,
 * so the canvas draws again after hydration only where something was; and
 * nothing at all unless `asked` (My Family Tree), so no tree's own canvas
 * draws again for it (Step 87.7).
 */
export function useNotSame(
  asked: boolean,
): [ReadonlySet<string>, (key: string, notSame: boolean) => void] {
  const keys = React.useSyncExternalStore(
    subscribe,
    asked ? readNotSame : nothing,
    nothing,
  );
  const set = React.useCallback((key: string, notSame: boolean) => {
    const next = new Set(readNotSame());
    if (notSame) next.add(key);
    else next.delete(key);
    fallback = next;
    try {
      if (next.size > 0) {
        window.localStorage.setItem(NOT_SAME_KEY, JSON.stringify([...next]));
      } else {
        window.localStorage.removeItem(NOT_SAME_KEY);
      }
    } catch {
      // Nowhere to remember it; the answer still holds for this visit.
    }
    for (const notify of listeners) notify();
  }, []);
  return [keys, set];
}
