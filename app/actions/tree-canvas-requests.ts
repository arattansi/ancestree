"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * A member the bloodline gate has refused asks for a canvas of their own
 * (Step 14.1). The RPC records the request, works out which blood relative
 * they married so the future bridge has an anchor, and notifies the admins.
 */
export async function requestTreeCanvas(
  note?: string,
): Promise<{ id?: string; error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("request_tree_canvas", {
    p_note: note?.trim() ? note.trim() : undefined,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already have a request")) {
      return { error: "Your request is already with an admin." };
    }
    if (m.includes("add your own entry")) {
      return { error: "Add your own entry to the tree first." };
    }
    return { error: "Couldn't send that request. Try again." };
  }

  revalidatePath("/tree");
  revalidatePath("/admin");
  return { id: data as string };
}

/**
 * Admin: provision the canvas. Creates the tree with the requester as its
 * owner, copies their entry onto it, and bridges back to the family tree
 * through the blood relative they married.
 */
export async function approveTreeCanvasRequest(
  id: string,
  options?: { treeName?: string; bridgePersonId?: string },
): Promise<{ treeId?: string; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("approve_tree_canvas_request", {
    p_request_id: id,
    p_tree_name: options?.treeName?.trim() || undefined,
    p_bridge_person_id: options?.bridgePersonId || undefined,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already been reviewed")) {
      return { error: "That request has already been reviewed." };
    }
    if (m.includes("pick the family member")) {
      return {
        error:
          "This member has no partner on the tree to bridge to — connect their marriage first.",
      };
    }
    return { error: "Couldn't set up that canvas. Try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/tree");
  const result = data as { tree_id: string } | null;
  return { treeId: result?.tree_id };
}

/** Admin: decline a canvas request, with an optional reason for the member. */
export async function declineTreeCanvasRequest(
  id: string,
  reason?: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("decline_tree_canvas_request", {
    p_request_id: id,
    p_reason: reason?.trim() ? reason.trim() : undefined,
  });

  if (error) {
    if (error.message.toLowerCase().includes("already been reviewed")) {
      return { error: "That request has already been reviewed." };
    }
    return { error: "Couldn't decline that request. Try again." };
  }

  revalidatePath("/admin");
  return {};
}
