import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { readIn } from "@/lib/tree";

/**
 * The display names of these members, as the viewer's trees know them, by
 * user id (Step 77.4, audit R4): who wrote a comment, who answered a
 * suggestion or a claim. Asked once for the lot, and not at all for none.
 * A name the member never set is `null`; an id outside the viewer's trees
 * isn't in the map.
 */
export async function memberNames(
  supabase: SupabaseClient<Database>,
  ids: Iterable<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const unique = [...new Set([...ids].filter((id): id is string => !!id))];
  const rows = await readIn(unique, (chunk) =>
    supabase
      .from("member_directory")
      .select("auth_user_id, display_name")
      .in("auth_user_id", chunk),
  );
  return new Map(
    rows.flatMap((m) =>
      m.auth_user_id ? [[m.auth_user_id, m.display_name] as const] : [],
    ),
  );
}
