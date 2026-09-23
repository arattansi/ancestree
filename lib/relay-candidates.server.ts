import "server-only";

import { toSelfCandidate, type SelfCandidate } from "@/lib/self-match";
import { createClient } from "@/lib/supabase/server";

/**
 * The entries on one tree that a relayed ask's name matches (Step 41.1):
 * living, placed there, nobody's yet and the member's to invite someone to
 * claim, scored as onboarding scores a typed name, best first and at most
 * five. Only the member the ask went to may ask, and only of a tree they're
 * on (`invite_relay_candidates`). `null` when they couldn't be read, so a
 * caller that must be sure — sending an invite for one — can tell that from
 * "none".
 */
export async function getRelayCandidates(
  relayId: string,
  treeId: string,
): Promise<SelfCandidate[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_relay_candidates", {
    p_relay: relayId,
    p_tree: treeId,
  });
  if (error) return null;
  return (data ?? []).map(toSelfCandidate);
}

/**
 * Candidates for each ask on each of the member's trees, for their settings:
 * the ask's card lists those on whichever tree they pick. Keyed by ask, then
 * by tree, leaving out a tree with none — or whose list couldn't be read,
 * since the plain invite still goes.
 */
export async function listRelayCandidates(
  relayIds: readonly string[],
  treeIds: readonly string[],
): Promise<Map<string, Record<string, SelfCandidate[]>>> {
  const pairs = relayIds.flatMap((relayId) =>
    treeIds.map((treeId) => ({ relayId, treeId })),
  );
  const lists = await Promise.all(
    pairs.map(({ relayId, treeId }) => getRelayCandidates(relayId, treeId)),
  );

  const byRelay = new Map<string, Record<string, SelfCandidate[]>>(
    relayIds.map((id) => [id, {}]),
  );
  pairs.forEach(({ relayId, treeId }, i) => {
    const list = lists[i];
    const byTree = byRelay.get(relayId);
    if (byTree && list && list.length > 0) byTree[treeId] = list;
  });
  return byRelay;
}
