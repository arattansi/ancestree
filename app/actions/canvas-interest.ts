"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * A member the bloodline gate refused tells us they'd want a tree of their own
 * (Step 14.3). Nothing is provisioned — whether we build second trees at all
 * depends on whether there is a market for this. All this does is keep a
 * record of who to reach out to if there is.
 */
export async function registerCanvasInterest(
  note?: string,
): Promise<{ id?: string; error?: string }> {
  await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("register_canvas_interest", {
    p_note: note?.trim() ? note.trim() : undefined,
  });

  if (error) {
    if (error.message.toLowerCase().includes("add your own entry")) {
      return { error: "Add your own entry to the tree first." };
    }
    return { error: "Couldn't register that. Try again." };
  }

  revalidatePath("/admin");
  return { id: data as string };
}

/** Admin: move someone through the outreach states. Grants nothing either way. */
export async function setCanvasInterestStatus(
  id: string,
  status: "new" | "contacted" | "dismissed",
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_canvas_interest_status", {
    p_id: id,
    p_status: status,
  });

  if (error) return { error: "Couldn't update that record. Try again." };

  revalidatePath("/admin");
  return {};
}

/** Admin: drop someone from the register entirely. */
export async function deleteCanvasInterest(
  id: string,
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("canvas_interest").delete().eq("id", id);
  if (error) return { error: "Couldn't delete that record. Try again." };

  revalidatePath("/admin");
  return {};
}
