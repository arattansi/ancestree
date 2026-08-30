"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireAdmin, requireProfile, requireSelfPerson } from "@/lib/auth";
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
  if (m.includes("different tree") || m.includes("no longer exists")) {
    return "That entry isn't available to claim. Refresh and try again.";
  }
  return "Couldn't complete that claim. Try again.";
}

/** Claim an existing entry as yourself. Auto-approves and merges your stub. */
export async function claimPerson(
  personId: string,
): Promise<{ error?: string; personId?: string }> {
  await requireSelfPerson();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_person", {
    p_person_id: personId,
  });
  if (error || !data) return { error: friendlyClaimError(error?.message) };

  revalidatePath("/tree");
  revalidatePath("/account");
  const result = data as { person_id: string };
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
      return { error: "Only the person who created this entry can dispute it." };
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
  await requireAdmin();
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
