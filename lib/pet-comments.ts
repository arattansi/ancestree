import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PetComment = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string;
  authorName: string;
};

/**
 * The comment thread on a companion, newest first, with author display names
 * resolved from the member directory. Plain comments only — a pet has no flags,
 * no resolve lifecycle, and no verification. Visible to any tree member
 * (enforced by `pet_comments` RLS).
 */
export async function listPetComments(petId: string): Promise<PetComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pet_comments")
    .select("id, body, created_at, created_by")
    .eq("pet_id", petId)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.created_by))];
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
    createdAt: r.created_at,
    createdBy: r.created_by,
    authorName: nameById.get(r.created_by) ?? "A relative",
  }));
}
