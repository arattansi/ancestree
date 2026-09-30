/**
 * Cards dropped in this tab, held by the canvas itself (Step 87.3, audit
 * S3). Saving a drop no longer redraws the page, so nothing from the server
 * says where the card went: the canvas lays it out where it was dropped,
 * but only while the server's row still holds what it held before the drop
 * and no page fresher than the save has arrived. Auto-arrange, another
 * member's move or any later render of the page brings the server's word,
 * and that wins.
 *
 * Kept for the tab, not the canvas: Back to the tree draws the page this
 * tab was handed before the drop, so the drop has to outlive the canvas
 * that made it.
 */

/** Where a card's row puts it: a nudge from its spot in the layout, and for
 * a person the legacy pin a nudge replaces. */
export type Placement = {
  pos_dx: number | null;
  pos_dy: number | null;
  pos_x?: number | null;
  pos_y?: number | null;
};

type Drop = {
  /** What the row held when the card was dropped. */
  was: Placement;
  /** What the drop saves. */
  at: Placement;
  /** Which drop of the card, so an older drop's answer can't settle a newer. */
  token: number;
  /** The newest page this tab had been handed when the drop was saved;
   * `null` while the save is on its way. */
  savedBy: number | null;
};

export type LocalDrops = ReadonlyMap<string, Drop>;

export const NO_DROPS: LocalDrops = new Map();

let drops: LocalDrops = NO_DROPS;
const listeners = new Set<() => void>();
const pages = new WeakMap<object, number>();
let newestPage = 0;
let lastToken = 0;

function keyOf(treeId: string, id: string): string {
  return `${treeId}:${id}`;
}

function publish(next: LocalDrops): void {
  drops = next;
  for (const listener of listeners) listener();
}

/**
 * The page the canvas was handed, numbered in the order this tab first saw
 * each: a page drawn afresh is a new object, and one brought back by Back
 * or Forward is the one handed over before.
 */
export function pageNumber(page: object): number {
  let n = pages.get(page);
  if (n === undefined) {
    n = ++newestPage;
    pages.set(page, n);
  }
  return n;
}

export function subscribeDrops(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function dropsSnapshot(): LocalDrops {
  return drops;
}

/** A card dropped: laid out at `at` from now on. The token settles it. */
export function dropCard(
  treeId: string,
  id: string,
  was: Placement,
  at: Placement,
): number {
  const token = ++lastToken;
  const next = new Map(drops);
  next.set(keyOf(treeId, id), { was, at, token, savedBy: null });
  publish(next);
  return token;
}

/** The drop saved: the next page drawn afresh knows where the card is. */
export function dropSaved(treeId: string, id: string, token: number): void {
  const key = keyOf(treeId, id);
  const drop = drops.get(key);
  if (drop?.token !== token) return;
  const next = new Map(drops);
  next.set(key, { ...drop, savedBy: newestPage });
  publish(next);
}

/** The drop refused, or never reached the server: the card goes back. */
export function dropUndone(treeId: string, id: string, token: number): void {
  const key = keyOf(treeId, id);
  if (drops.get(key)?.token !== token) return;
  const next = new Map(drops);
  next.delete(key);
  publish(next);
}

function samePlacement(row: Placement, was: Placement): boolean {
  return (
    row.pos_dx === was.pos_dx &&
    row.pos_dy === was.pos_dy &&
    (row.pos_x ?? null) === (was.pos_x ?? null) &&
    (row.pos_y ?? null) === (was.pos_y ?? null)
  );
}

/**
 * `rows` with each card dropped here at its drop, while its row still holds
 * what it held before the drop and the page is no fresher than the save.
 * `rows` itself when no drop applies.
 */
export function placeDrops<T extends Placement & { id: string }>(
  rows: T[],
  held: LocalDrops,
  treeId: string,
  page: number,
): T[] {
  if (held.size === 0) return rows;
  let changed = false;
  const out = rows.map((row) => {
    const drop = held.get(keyOf(treeId, row.id));
    if (!drop) return row;
    if (drop.savedBy !== null && page > drop.savedBy) return row;
    if (!samePlacement(row, drop.was)) return row;
    changed = true;
    return { ...row, ...drop.at };
  });
  return changed ? out : rows;
}
