import type { Node } from "@xyflow/react";

import { shallowEqual } from "@/lib/structural-share";

/**
 * Re-seeding the canvas without a blink (Step 87.1, audit C2). React Flow
 * hides a card, and every line into it, until it has measured the card; a
 * freshly built node carries no measurement, so every re-seed blanked the
 * whole tree for a frame or more. These keep what the canvas already holds.
 */

function sameNode(old: Node, node: Node): boolean {
  return (
    old.type === node.type &&
    old.draggable === node.draggable &&
    old.position.x === node.position.x &&
    old.position.y === node.position.y &&
    shallowEqual(old.data, node.data)
  );
}

/**
 * The nodes to seed the canvas with: the one it holds wherever nothing about
 * a card changed (so it keeps its measurement and doesn't draw again), else
 * the new one carrying the old one's measurement, which the canvas corrects
 * if the card's size did change. `prev` itself when every card is kept.
 */
export function keepNodes(prev: Node[], next: Node[]): Node[] {
  const held = new Map(prev.map((n) => [n.id, n]));
  let same = prev.length === next.length;
  const out = next.map((node, i) => {
    const old = held.get(node.id);
    const kept = !old
      ? node
      : sameNode(old, node)
        ? old
        : old.measured
          ? { ...node, measured: old.measured }
          : node;
    if (kept !== prev[i]) same = false;
    return kept;
  });
  return same ? prev : out;
}

/**
 * `next`, with each value that holds the same as `prev`'s for its key swapped
 * for `prev`'s own, so a card whose flags didn't change is handed the same
 * `data` and doesn't draw again. `prev` itself when nothing changed.
 */
export function keepEntries<V extends Record<string, unknown>>(
  prev: Map<string, V>,
  next: Map<string, V>,
): Map<string, V> {
  let same = prev.size === next.size;
  const out = new Map<string, V>();
  for (const [key, value] of next) {
    const old = prev.get(key);
    const kept = old && shallowEqual(old, value) ? old : value;
    if (kept !== old) same = false;
    out.set(key, kept);
  }
  return same ? prev : out;
}
