"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import {
  canSearchName,
  normalizeTypedName,
  toSelfCandidate,
  type SelfCandidate,
} from "@/lib/self-match";
import { createClient } from "@/lib/supabase/server";

/**
 * Unclaimed entries that look like the name a new member typed. Spelling
 * mistakes, accents, nicknames and phonetic variants all still match — the
 * scoring lives in `search_self_candidates` (Step 15).
 */
export async function findSelfCandidates(
  first: string,
  last: string,
): Promise<{ candidates: SelfCandidate[]; error?: string }> {
  await requireProfile();
  if (!canSearchName(first, last)) {
    return { candidates: [], error: "Enter both your first and last name." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_self_candidates", {
    p_first: normalizeTypedName(first),
    p_last: normalizeTypedName(last),
  });

  if (error) {
    return { candidates: [], error: "Couldn't search the tree. Try again." };
  }
  return { candidates: (data ?? []).map(toSelfCandidate) };
}

function friendlyClaimError(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  const m = message.toLowerCase();
  if (m.includes("too many claims")) {
    return "You've made too many claims today. Try again tomorrow.";
  }
  if (m.includes("already claimed") || m.includes("already have")) {
    return "That entry has already been claimed. Refresh and try again.";
  }
  if (m.includes("match your name")) {
    return "That entry doesn't match the name you entered closely enough.";
  }
  if (m.includes("different tree") || m.includes("no longer exists")) {
    return "That entry isn't available to claim. Refresh and try again.";
  }
  return "Couldn't claim that entry. Try again.";
}

/**
 * First-run claim: take ownership of an entry a relative already added, in
 * place of creating your own. Auto-approves and notifies the entry's creator,
 * who can dispute it (same path as `claim_person`).
 */
export async function claimSelfCandidate(
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
  });
  if (error || !data) return { error: friendlyClaimError(error?.message) };

  revalidatePath("/tree");
  revalidatePath("/account");
  const result = data as { person_id: string };
  return { personId: result.person_id };
}
