import type { SelfCandidate } from "@/lib/self-match";

/**
 * The entry a Root chose to approve a request as (Step 30.3), if the request
 * still matches it: `candidates` is `invite_request_candidates` asked again
 * just before the invite is minted. `null` refuses the approval — the entry
 * was claimed, died or left the tree since the queue was drawn, or was never
 * one the requester's name matched.
 */
export function chosenCandidate(
  candidates: readonly SelfCandidate[],
  personId: string,
): SelfCandidate | null {
  return candidates.find((c) => c.id === personId) ?? null;
}
