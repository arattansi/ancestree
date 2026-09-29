/**
 * A word for a count (Step 77.4, audit R4): "entry" for one, "entries" for
 * any other number, nought included. `many` defaults to `one` plus "s".
 */
export function plural(count: number, one: string, many?: string): string {
  return count === 1 ? one : (many ?? `${one}s`);
}

/** The count and its word: "1 entry", "3 entries", "0 ancestors". */
export function countOf(count: number, one: string, many?: string): string {
  return `${count} ${plural(count, one, many)}`;
}
