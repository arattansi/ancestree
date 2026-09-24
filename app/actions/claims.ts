"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireProfile, requireSelfPerson } from "@/lib/auth";
import type { ClaimResult } from "@/lib/claim-merge";
import { moveClaimedPhoto } from "@/lib/claim-merge.server";
import { createClient } from "@/lib/supabase/server";

function friendlyClaimError(message: string | undefined): string {
  if (!message) return "Something went wrong. Try again.";
  const m = message.toLowerCase();
  if (m.includes("too many claims")) {
    return "You've made too many claims today. Try again tomorrow.";
  }
  if (m.includes("already claimed") || m.includes("already belongs")) {
    return "That entry has already been claimed.";
  }
  if (m.includes("match your name")) {
    return "That entry doesn't match your name closely enough to claim.";
  }
  if (m.includes("add your own entry")) {
    return "Add your own entry before claiming another.";
  }
  if (m.includes("placeholder you added")) {
    return "You already have your own entry on the tree, and it can't be merged into this one. If this is another entry for you, ask a Root to sort out the duplicate.";
  }
  if (m.includes("having died")) {
    return "That entry is marked as having died, so it can't be yours.";
  }
  if (m.includes("different tree") || m.includes("no longer exists")) {
    return "That entry isn't available to claim. Refresh and try again.";
  }
  return "Couldn't complete that claim. Try again.";
}

/**
 * Claim an existing entry as yourself. Auto-approves and merges the
 * placeholder you added for yourself into it, documents and photo included;
 * `claim_person` refuses when your own entry is more than that, or the entry
 * is of someone who has died (Step 36).
 */
export async function claimPerson(
  personId: string,
): Promise<{ error?: string; personId?: string }> {
  await requireSelfPerson();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_person", {
    p_person_id: personId,
  });
  if (error || !data) return { error: friendlyClaimError(error?.message) };

  // Before the pages redraw, so the claimed entry's photo signs (Step 43).
  const result = data as ClaimResult;
  await moveClaimedPhoto(result);

  revalidatePath("/tree");
  revalidatePath("/account");
  return { personId: result.person_id };
}

/** Original creator contests an approved claim; routes it to an admin. */
export async function disputeClaim(
  claimId: string,
  reason?: string,
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispute_claim", {
    p_claim_id: claimId,
    p_reason: reason?.trim() || undefined,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("only the person who created")) {
      return {
        error: "Only the person who created this entry can dispute it.",
      };
    }
    if (m.includes("not open to dispute")) {
      return { error: "This claim can no longer be disputed." };
    }
    return { error: "Couldn't submit that dispute. Try again." };
  }
  revalidatePath("/tree");
  revalidatePath("/account");
  return {};
}

/** Admin resolves a disputed claim: `uphold` keeps it, `reverse` undoes it. */
export async function resolveClaim(
  claimId: string,
  action: "uphold" | "reverse",
): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_claim", {
    p_claim_id: claimId,
    p_action: action,
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("only a disputed claim")) {
      return { error: "This claim has already been resolved." };
    }
    return { error: "Couldn't resolve that claim. Try again." };
  }
  revalidatePath("/admin");
  revalidatePath("/tree");
  revalidatePath("/account");
  return {};
}

/** Mark all of the signed-in member's notifications as read. */
/**
 * Clear notifications: the caller's own, by id. The list sends every item
 * except a placement request still waiting on an answer, which is the only
 * kind that can't be found again once it's gone.
 */
export async function clearNotifications(
  ids: string[],
): Promise<{ cleared?: number; error?: string }> {
  const user = await getUser();
  if (!user) return { error: "You are not signed in." };
  const wanted = [...new Set(ids)].filter(Boolean);
  if (wanted.length === 0) return { cleared: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .delete()
    .in("id", wanted)
    .eq("recipient_user_id", user.id)
    .select("id");
  if (error) return { error: "Couldn't clear your notifications. Try again." };
  revalidatePath("/account");
  return { cleared: data?.length ?? 0 };
}

export async function markNotificationsRead(): Promise<void> {
  const user = await getUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("recipient_user_id", user.id);
  revalidatePath("/account");
}
