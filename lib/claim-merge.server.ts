import "server-only";

import { claimedPhotoMove, type ClaimResult } from "@/lib/claim-merge";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * After "This is me", move the placeholder's photo into the claimed entry's
 * folder, where `claim_person` has pointed the entry (Step 43). The
 * placeholder is gone, and with it the storage policies' way of knowing who
 * may see, change or remove its files, so the file is moved with the service
 * role. The claim is what proved the right to move it. True when a file
 * moved. If it can't, the claimed entry shows no photo, as before the fix,
 * and the claim still stands: this never throws.
 */
export async function moveClaimedPhoto(result: ClaimResult): Promise<boolean> {
  const move = claimedPhotoMove(result);
  if (!move) return false;
  try {
    const { error } = await createAdminClient()
      .storage.from("photos")
      .move(move.from, move.to);
    if (error) {
      console.error("[claim-merge] the claimed photo didn't move", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[claim-merge] the claimed photo didn't move", err);
    return false;
  }
}
