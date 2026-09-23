/**
 * The rows of a Root's "Requests for Access" (Step 30.3): the pending
 * requests, plus those just approved on this page. Approving refreshes the
 * page around the list, and a request that's no longer pending drops out of
 * `pending`; `kept` holds it where it was until the page is next loaded, so
 * the outcome and the link stay on screen. Oldest first, as the console
 * lists them; ties by id, so a kept row never swaps places.
 */
export function requestRows<T extends { id: string; createdAt: string }>(
  pending: readonly T[],
  kept: readonly T[],
): T[] {
  const keptIds = new Set(kept.map((r) => r.id));
  return [...pending.filter((r) => !keptIds.has(r.id)), ...kept].sort(
    (a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    },
  );
}
