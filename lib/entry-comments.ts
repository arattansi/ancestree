import "server-only";

import { memberNames } from "@/lib/member-names.server";
import { createClient } from "@/lib/supabase/server";

export type EntryComment = {
  id: string;
  body: string;
  isFlag: boolean;
  status: "open" | "resolved";
  createdAt: string;
  createdBy: string;
  authorName: string;
  resolvedBy: string | null;
  resolverName: string | null;
  resolvedAt: string | null;
};

/**
 * Comments and flags on a person entry's board on one tree (Step 25), newest
 * first, with author + resolver display names resolved from the member
 * directory. Visible to any member of that tree (enforced by `entry_comments`
 * RLS).
 */
export async function listEntryComments(
  treeId: string,
  personId: string,
): Promise<EntryComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_comments")
    .select(
      "id, body, is_flag, status, created_at, created_by, resolved_by, resolved_at",
    )
    .eq("tree_id", treeId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const names = await memberNames(
    supabase,
    rows.flatMap((r) => [r.created_by, r.resolved_by]),
  );

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    isFlag: r.is_flag,
    status: r.status as "open" | "resolved",
    createdAt: r.created_at,
    createdBy: r.created_by,
    authorName: names.get(r.created_by) ?? "A relative",
    resolvedBy: r.resolved_by,
    resolverName:
      r.resolved_by && names.has(r.resolved_by)
        ? (names.get(r.resolved_by) ?? "A relative")
        : null,
    resolvedAt: r.resolved_at,
  }));
}
