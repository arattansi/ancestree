/**
 * Keeping what didn't change (Step 87.1, audit C2). A save's revalidation
 * hands the canvas every row afresh, equal or not, and every memo keyed on
 * a row then runs again: the layout, the re-seed, each card. `shareEqual`
 * gives back the old value wherever the new one is equal to it, all the way
 * down, so only what really changed is new.
 */

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Rows that each carry a string `id`, by it; `null` for any other list. */
function byId(list: readonly unknown[]): Map<string, unknown> | null {
  const map = new Map<string, unknown>();
  for (const item of list) {
    if (!isPlain(item) || typeof item.id !== "string") return null;
    map.set(item.id, item);
  }
  return map;
}

function shareArray(prev: readonly unknown[], next: readonly unknown[]) {
  // Rows are matched by id, so one added or taken out doesn't make every
  // row after it look changed; anything else by its place in the list.
  const prevById = byId(prev);
  let same = prev.length === next.length;
  const out = next.map((item, i) => {
    const match =
      prevById && isPlain(item) && typeof item.id === "string"
        ? prevById.get(item.id)
        : prev[i];
    const kept = shareEqual(match, item);
    if (kept !== prev[i]) same = false;
    return kept;
  });
  return same ? prev : out;
}

/**
 * `next`, with every part equal to `prev`'s swapped for `prev`'s own: `prev`
 * itself when the two are equal throughout. Plain objects and arrays are
 * compared by what they hold; anything else only by identity.
 */
export function shareEqual<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T;
  if (Array.isArray(prev) && Array.isArray(next))
    return shareArray(prev, next) as T;
  if (!isPlain(prev) || !isPlain(next)) return next;
  const keys = Object.keys(next);
  let same = keys.length === Object.keys(prev).length;
  const out: Plain = {};
  for (const key of keys) {
    const kept = shareEqual(prev[key], next[key]);
    if (kept !== prev[key] || !(key in prev)) same = false;
    out[key] = kept;
  }
  return (same ? prev : out) as T;
}

/** Whether two plain objects hold the same values, compared by identity. */
export function shallowEqual(a: Plain, b: Plain): boolean {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => key in b && Object.is(a[key], b[key]));
}
