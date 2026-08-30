import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/person-name";
import type { TreeMemberOption } from "@/components/relationship-picker";

/** The single shared v1 tree, or `null` if an admin hasn't bootstrapped yet. */
export async function getSharedTree(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trees")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Everyone currently in the tree, as search-select options, newest last.
 * `excludeId` drops a person (e.g. the caller's own entry) from the list.
 */
export async function listTreeMembers(
  treeId: string,
  excludeId?: string | null,
): Promise<TreeMemberOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("people")
    .select("id, given_name, preferred_name, family_name")
    .eq("tree_id", treeId)
    .order("family_name", { ascending: true });

  return (data ?? [])
    .filter((p) => p.id !== excludeId)
    .map((p) => ({ id: p.id, label: personDisplayName(p) }));
}
