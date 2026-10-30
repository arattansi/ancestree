import "server-only";

import { readCardFunnel, type CardFunnel } from "@/lib/card-funnel";
import { createClient } from "@/lib/supabase/server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/**
 * The analytics tab's birthday cards (Step 217.3) for a beta reviewer; null
 * for anyone else, whom `card_funnel()` refuses anyway, and when it can't be
 * read.
 */
export async function loadCardFunnel(): Promise<CardFunnel | null> {
  if (!(await isBetaReviewer())) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("card_funnel");
  if (error) return null;
  return readCardFunnel(data);
}
