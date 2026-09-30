"use server";

import { requireProfile } from "@/lib/auth";
import { friendlyDbError, ownedWrite } from "@/lib/db-errors";
import { REPORT_MAX } from "@/lib/limits";
import { revalidateTreePages } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

/**
 * Report a problem with an entry from the tree it's on (Step 88.2): what's
 * wrong in its details, told to whoever may edit it; or, from whoever added
 * it, a dispute of who claimed it, for its home tree's Roots to decide.
 */
export async function reportEntry(input: {
  personId: string;
  treeId: string;
  body: string;
  dispute: boolean;
}): Promise<{ error?: string }> {
  await requireProfile();
  const body = input.body.trim();
  if (!body) return { error: "Say what’s wrong." };
  if (body.length > REPORT_MAX) {
    return { error: `Keep it under ${REPORT_MAX} characters.` };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_entry", {
    p_person: input.personId,
    p_tree: input.treeId,
    p_body: body,
    p_dispute: input.dispute,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["already disputed", "You’ve already disputed this claim."],
          ["no claim to dispute", "Nobody has claimed this entry."],
          ["only whoever added it", "Only whoever added this entry can dispute its claim."],
          ["not on your tree", "That entry isn’t on your tree."],
          ["no longer exists", "That entry no longer exists."],
        ],
        "Couldn’t send that. Try again.",
      ),
    };
  }
  // Its count shows on the entry's card, and a Root's queue in the header.
  revalidateTreePages();
  return {};
}

/** Put right: whoever may edit the entry marks a report resolved. */
export async function resolveEntryReport(
  reportId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_entry_report", {
    p_report: reportId,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["already resolved", "It’s already been resolved."],
          ["not yours to resolve", "Only someone who can edit this entry can resolve it."],
        ],
        "Couldn’t resolve it. Try again.",
      ),
    };
  }
  revalidateTreePages();
  return {};
}

/** Its reporter takes a report back while it's open. */
export async function withdrawEntryReport(
  reportId: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const withdrawn = await ownedWrite(
    supabase.from("entry_reports").delete().eq("id", reportId).select("id"),
    {
      refused: "It’s already been resolved.",
      failed: "Couldn’t withdraw it. Try again.",
    },
  );
  if (withdrawn.error) return { error: withdrawn.error };
  revalidateTreePages();
  return {};
}

/**
 * A Root decides a dispute: `uphold` keeps the claim; otherwise it's
 * reversed and the entry goes back to whoever added it.
 */
export async function decideClaimDispute(
  reportId: string,
  uphold: boolean,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_claim_dispute", {
    p_report: reportId,
    p_uphold: uphold,
  });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["already decided", "It’s already been decided."],
          ["roots only", "Only a Root of this entry’s tree can decide it."],
        ],
        "Couldn’t decide it. Try again.",
      ),
    };
  }
  revalidateTreePages();
  return {};
}
