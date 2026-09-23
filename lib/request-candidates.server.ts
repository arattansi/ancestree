import "server-only";

import { toSelfCandidate, type SelfCandidate } from "@/lib/self-match";
import { createClient } from "@/lib/supabase/server";

/**
 * The entries on its tree that a pending request's name matches (Step 30.3):
 * living, placed there and nobody's yet, scored as onboarding scores a typed
 * name, best first and at most five. Only a Root of the request's tree may
 * ask (`invite_request_candidates`). `null` when they couldn't be read, so a
 * caller that must be sure — approving as one — can tell that from "none".
 */
export async function getRequestCandidates(
  requestId: string,
): Promise<SelfCandidate[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_request_candidates", {
    p_request: requestId,
  });
  if (error) return null;
  return (data ?? []).map(toSelfCandidate);
}

/**
 * Candidates for each of a tree's pending requests, for the Root's queue.
 * A request whose candidates couldn't be read shows none: it can still be
 * approved without an entry.
 */
export async function listRequestCandidates(
  requestIds: readonly string[],
): Promise<Map<string, SelfCandidate[]>> {
  const lists = await Promise.all(
    requestIds.map((id) => getRequestCandidates(id)),
  );
  return new Map(requestIds.map((id, i) => [id, lists[i] ?? []]));
}
