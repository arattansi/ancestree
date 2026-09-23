import "server-only";

import { getUser } from "@/lib/auth";
import { readJoiningName } from "@/lib/joining-name";
import {
  canSearchName,
  normalizeTypedName,
  onboardingName,
  onboardingOpening,
  toSelfCandidate,
  type OnboardingStart,
  type SelfCandidate,
} from "@/lib/self-match";
import { createClient } from "@/lib/supabase/server";

/**
 * Unclaimed entries on one tree that look like a name. Spelling mistakes,
 * accents, nicknames and phonetic variants all still match — the scoring
 * lives in `search_self_candidates` (Step 15). Onboarding's search button
 * (`findSelfCandidates`) and the search it runs as it opens both come here.
 */
export async function searchSelfCandidates(
  treeId: string,
  first: string,
  last: string,
): Promise<{ candidates: SelfCandidate[]; error?: string }> {
  if (!canSearchName(first, last)) {
    return { candidates: [], error: "Enter both your first and last name." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_self_candidates", {
    p_first: normalizeTypedName(first),
    p_last: normalizeTypedName(last),
    p_tree: treeId,
  });

  if (error) {
    return { candidates: [], error: "Couldn't search the tree. Try again." };
  }
  return { candidates: (data ?? []).map(toSelfCandidate) };
}

/**
 * Where the signed-in member's onboarding opens (Step 30.7): their name from
 * what we already know and, when that's all of it, the search for it, run
 * here so the page opens on what it found rather than on an empty form. A
 * search that fails opens on their name, to try again from there.
 */
export async function onboardingStart({
  treeId,
  displayName,
  treeHasEntries,
}: {
  treeId: string;
  displayName: string | null;
  treeHasEntries: boolean;
}): Promise<OnboardingStart> {
  const user = await getUser();
  const name = onboardingName({
    displayName,
    email: user?.email,
    joinedAs: readJoiningName(user?.user_metadata),
  });

  const opening = onboardingOpening({ name, treeHasEntries });
  if (opening !== "search") return { name, step: opening, candidates: [] };

  const found = await searchSelfCandidates(treeId, name.first_name, name.last_name);
  return found.error
    ? { name, step: "name", candidates: [] }
    : { name, step: "results", candidates: found.candidates };
}
