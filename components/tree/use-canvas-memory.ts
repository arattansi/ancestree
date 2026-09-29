"use client";

import * as React from "react";

import { parseCanvasMemory, type CanvasMemory } from "@/lib/canvas-memory";

// Per tab, and per tree: a reader with two tabs open keeps two canvases.
const keyOf = (treeId: string) => `ancestree:canvas:${treeId}`;

/** Where it's kept when the tab's storage is blocked: this page only. */
const fallback = new Map<string, string>();

/** The server, and hydration, can't see the tab's storage. */
export const NOT_READ = "not-read";

// Parsed once per stored string, so every read of the same memory is the
// same object, as `useSyncExternalStore` needs.
let last: { raw: string | null; memory: CanvasMemory | null } = {
  raw: null,
  memory: null,
};

function read(treeId: string): CanvasMemory | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(keyOf(treeId));
  } catch {
    raw = fallback.get(treeId) ?? null;
  }
  if (raw !== last.raw) last = { raw, memory: parseCanvasMemory(raw) };
  return last.memory;
}

// Nothing tells the canvas its memory changed: only the canvas writes it,
// and it reads it once, as it opens.
const subscribe = () => () => {};

/**
 * How this tab last left the canvas of `treeId` (Step 77.3): `null` for
 * nothing kept, {@link NOT_READ} until it can be read — on the server, and
 * while the page hydrates, so both draw the canvas as it starts.
 */
export function useCanvasMemory(
  treeId: string,
): CanvasMemory | null | typeof NOT_READ {
  const getSnapshot = React.useCallback(() => read(treeId), [treeId]);
  return React.useSyncExternalStore<CanvasMemory | null | typeof NOT_READ>(
    subscribe,
    getSnapshot,
    () => NOT_READ,
  );
}

/** Keep how the canvas of `treeId` is left, for when it opens again. */
export function rememberCanvas(treeId: string, memory: CanvasMemory): void {
  const raw = JSON.stringify(memory);
  fallback.set(treeId, raw);
  try {
    window.sessionStorage.setItem(keyOf(treeId), raw);
  } catch {
    // Nowhere to keep it; it still holds until the page goes.
  }
}
