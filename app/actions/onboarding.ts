"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import {
  friendlySelfClaimError,
  normalizeTypedName,
  type SelfCandidate,
} from "@/lib/self-match";
import { searchSelfCandidates } from "@/lib/self-match.server";
import { createClient } from "@/lib/supabase/server";
import { revalidateTreePages } from "@/lib/revalidate";

/**
 * Unclaimed entries on one tree that look like the name a new member typed
 * (Step 15), never of someone who has died (Step 37) — the same search
 * onboarding runs as it opens, when it already knows their name (Step 30.7).
 */
export async function findSelfCandidates(
  treeId: string,
  first: string,
  last: string,
): Promise<{ candidates: SelfCandidate[]; error?: string }> {
  await requireProfile();
  return searchSelfCandidates(treeId, first, last);
}

/**
 * First-run claim: take ownership of an entry a relative already added, in
 * place of creating your own. Auto-approves and notifies the entry's creator,
 * who can dispute it (same path as `claim_person`). Never someone who has
 * died (Step 37).
 */
export async function claimSelfCandidate(
  treeId: string,
  personId: string,
  first: string,
  last: string,
): Promise<{ error?: string; personId?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_person_as_self", {
    p_person_id: personId,
    p_first: normalizeTypedName(first),
    p_last: normalizeTypedName(last),
    p_tree: treeId,
  });
  if (error || !data) return { error: friendlySelfClaimError(error?.message) };

  revalidateTreePages();
  revalidatePath("/account");
  const result = data as { person_id: string };
  return { personId: result.person_id };
}
