import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/person-name";
import type { TreeMemberOption } from "@/components/relationship-picker";

/** A person plus the fields the tree canvas + detail panel need. */
export type TreeGraphPerson = {
  id: string;
  given_name: string | null;
  preferred_name: string | null;
  family_name: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  city_of_birth: string | null;
  country_of_birth: string;
  is_deceased: boolean;
  place_of_death: string | null;
  lineage_type: string | null;
  photo_path: string | null;
  pos_x: number | null;
  pos_y: number | null;
  owner_user_id: string;
  created_by: string;
  photo_url: string | null;
};

export type TreeGraphEdge = {
  from_person: string;
  to_person: string;
  type: string;
};

const PERSON_COLUMNS =
  "id, given_name, preferred_name, family_name, date_of_birth, date_of_death, city_of_birth, country_of_birth, is_deceased, place_of_death, lineage_type, photo_path, pos_x, pos_y, owner_user_id, created_by";

/** Everyone in the tree plus their relationship edges, with signed photo URLs. */
export async function getTreeGraph(treeId: string): Promise<{
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
}> {
  const supabase = await createClient();
  const [peopleRes, relRes] = await Promise.all([
    supabase.from("people").select(PERSON_COLUMNS).eq("tree_id", treeId),
    supabase
      .from("relationships")
      .select("from_person, to_person, type")
      .eq("tree_id", treeId),
  ]);

  const rows = peopleRes.data ?? [];
  const paths = rows
    .map((p) => p.photo_path)
    .filter((p): p is string => Boolean(p));

  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("photos")
      .createSignedUrls(paths, 60 * 60);
    for (const item of signed ?? []) {
      if (item.signedUrl && item.path) urlByPath.set(item.path, item.signedUrl);
    }
  }

  return {
    people: rows.map((p) => ({
      ...p,
      photo_url: p.photo_path ? urlByPath.get(p.photo_path) ?? null : null,
    })),
    relationships: relRes.data ?? [],
  };
}

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
