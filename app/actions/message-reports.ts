"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db-errors";
import { revalidateTreePages } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

/**
 * A reported message looked at (Step 177.3): a Root of a tree the two share,
 * or a beta reviewer, marks it resolved, and its reporter is told.
 */
export async function resolveMessageReport(reportId: string): Promise<{ error?: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_message_report", { p_report: reportId });
  if (error) {
    return {
      error: friendlyDbError(
        error.message,
        [
          ["ALREADY_RESOLVED", "It’s already been resolved."],
          ["NOT_YOURS", "Only a Root of a tree they share can resolve it."],
        ],
        "Couldn’t resolve it. Try again.",
      ),
    };
  }
  // The Root console's queue counts it; the admin page lists it.
  revalidateTreePages();
  revalidatePath("/admin");
  return {};
}
