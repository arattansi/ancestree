import "server-only";

import type { OpenedRelay } from "@/lib/opened-relay";
import { createClient } from "@/lib/supabase/server";

/**
 * The ask the email's button named, read back for the line settings shows
 * once it isn't waiting (Step 41.1): whatever its state, with the name of
 * the tree it was answered into. RLS shows an ask only to the member it
 * went to, so for anyone else — or once it's gone — this is `null`.
 */
export async function loadOpenedRelay(relayId: string): Promise<OpenedRelay | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invite_relays")
    .select("status, first_name, last_name, trees(name)")
    .eq("id", relayId)
    .maybeSingle();
  if (!data) return null;

  // A to-one embed that PostgREST may still hand back as an array.
  const tree = Array.isArray(data.trees) ? data.trees[0] : data.trees;
  return {
    status: data.status,
    firstName: data.first_name,
    lastName: data.last_name,
    treeName: tree?.name ?? null,
  };
}
