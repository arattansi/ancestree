"use server";

import { getSessionUser, requireSelfPerson } from "@/lib/auth";
import type { ClaimResult } from "@/lib/claim-merge";
import { moveClaimedPhoto } from "@/lib/claim-merge.server";
import { friendlyDbError } from "@/lib/db-errors";
import { removeReplacedPhotos } from "@/lib/photo-cleanup.server";
import { revalidateTreePages } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";

function friendlyClaimError(message: string | undefined): string {
  const taken = "That entry has already been claimed.";
  const gone = "That entry isn't available to claim. Refresh and try again.";
  return friendlyDbError(
    message,
    [
      ["too many claims", "You've made too many claims today. Try again tomorrow."],
      ["already claimed", taken],
      ["already belongs", taken],
      ["match your name", "That entry doesn't match your name closely enough to claim."],
      ["add your own entry", "Add your own entry before claiming another."],
      [
        "placeholder you added",
        "You already have your own entry on the tree, and it can't be merged into this one. If this is another entry for you, ask a Root to sort out the duplicate.",
      ],
      ["having died", "That entry is marked as having died, so it can't be yours."],
      ["different tree", gone],
      ["no longer exists", gone],
    ],
    "Couldn't complete that claim. Try again.",
  );
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
  const { self_person_id: ownId } = await requireSelfPerson();
  const supabase = await createClient();
  // Their own entry's photo: the merge deletes the entry (Step 82).
  const { data: own } = ownId
    ? await supabase.from("people").select("photo_path").eq("id", ownId).maybeSingle()
    : { data: null };
  const { data, error } = await supabase.rpc("claim_person", {
    p_person_id: personId,
  });
  if (error || !data) return { error: friendlyClaimError(error?.message) };

  // Before the pages redraw, so the claimed entry's photo signs (Step 43).
  const result = data as ClaimResult;
  await moveClaimedPhoto(result);
  // Where the claimed entry kept its own photo, theirs stayed in a folder
  // nobody can read now; it goes (Step 82). One that was to move stays,
  // moved or not: it may be the claimed entry's only copy.
  if (ownId && !result.photo_from) {
    removeReplacedPhotos("person", ownId, [own?.photo_path]);
  }

  revalidateTreePages();
  return { personId: result.person_id };
}

/**
 * Clear notifications: the caller's own, by id. The list sends every item
 * except a placement request still waiting on an answer, which is the only
 * kind that can't be found again once it's gone.
 */
export async function clearNotifications(
  ids: string[],
): Promise<{ cleared?: number; error?: string }> {
  const user = await getSessionUser();
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
  revalidateTreePages();
  return { cleared: data?.length ?? 0 };
}

/**
 * Mark every notification read, once a list of them has been shown. No page
 * is drawn again for it (Step 61): the list keeps showing which were new
 * while it's open, and the bell clears its own count
 * (`NOTIFICATIONS_READ_EVENT`).
 */
export async function markNotificationsRead(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("recipient_user_id", user.id);
}
