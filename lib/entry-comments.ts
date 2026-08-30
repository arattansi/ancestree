import "server-only";

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
 * Comments and flags on a person entry, newest first, with author + resolver
 * display names resolved from the member directory. Visible to any tree member
 * (enforced by `entry_comments` RLS).
 */
export async function listEntryComments(
  personId: string,
): Promise<EntryComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_comments")
    .select(
      "id, body, is_flag, status, created_at, created_by, resolved_by, resolved_at",
    )
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(
      rows.flatMap((r) =>
        [r.created_by, r.resolved_by].filter((v): v is string => Boolean(v)),
      ),
    ),
  ];
  const { data: members } = await supabase
    .from("member_directory")
    .select("auth_user_id, display_name")
    .in("auth_user_id", userIds);
  const nameById = new Map(
    (members ?? []).map((m) => [m.auth_user_id, m.display_name ?? "A relative"]),
  );

  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    isFlag: r.is_flag,
    status: r.status as "open" | "resolved",
    createdAt: r.created_at,
    createdBy: r.created_by,
    authorName: nameById.get(r.created_by) ?? "A relative",
    resolvedBy: r.resolved_by,
    resolverName: r.resolved_by ? nameById.get(r.resolved_by) ?? null : null,
    resolvedAt: r.resolved_at,
  }));
}
