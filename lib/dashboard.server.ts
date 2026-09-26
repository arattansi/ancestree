import "server-only";

import { readDashboard, type Dashboard } from "@/lib/dashboard";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * The engagement dashboard (Step 56) for a beta reviewer; null for anyone
 * else, whom `engagement_dashboard()` refuses anyway, and when it can't be
 * read.
 */
export async function loadDashboard(): Promise<Dashboard | null> {
  if (!(await isBetaReviewer())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("engagement_dashboard");
  if (error) return null;
  return readDashboard(data);
}
