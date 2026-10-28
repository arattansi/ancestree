import "server-only";

import { readInviteFunnel, type InviteFunnel } from "@/lib/invite-funnel";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * The analytics tab's invites (Step 216) for a beta reviewer; null for
 * anyone else, whom `invite_funnel()` refuses anyway, and when it can't be
 * read.
 */
export async function loadInviteFunnel(): Promise<InviteFunnel | null> {
  if (!(await isBetaReviewer())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_funnel");
  if (error) return null;
  return readInviteFunnel(data);
}
