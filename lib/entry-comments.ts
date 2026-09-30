import "server-only";

import { memberNames } from "@/lib/member-names.server";
import { createClient } from "@/lib/supabase/server";

export type EntryComment = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string;
  authorName: string;
};

/**
 * Comments on a person entry's board on one tree (Step 25), newest first,
 * with author display names resolved from the member directory. Visible to
 * any member of that tree (enforced by `entry_comments` RLS). A problem with
 * the entry is a report now, which only whoever can fix it sees (Step 88.2).
 */
export async function listEntryComments(
  treeId: string,
  personId: string,
): Promise<EntryComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_comments")
    .select("id, body, created_at, created_by")
    .eq("tree_id", treeId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const names = await memberNames(
    supabase,
    rows.map((r) => r.created_by),
  );

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    createdBy: r.created_by,
    authorName: names.get(r.created_by) ?? "A relative",
  }));
}
