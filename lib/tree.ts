import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/person-name";
import type { TreeMemberOption } from "@/components/relationship-picker";

/** A person plus the fields the tree canvas + detail panel need. */
export type TreeGraphPerson = {
  id: string;
  given_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
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
  verified_at: string | null;
  photo_url: string | null;
  /** Count of open (unresolved) flags raised against this entry. */
  open_flag_count: number;
  /** `approved` once someone has claimed this entry, `disputed` while an admin
   *  is reviewing a contested claim, otherwise `null`. */
  claim_status: "approved" | "disputed" | null;
  /** The active claim row id, when `claim_status` is set. */
  claim_id: string | null;
};

export type TreeGraphEdge = {
  id: string;
  from_person: string;
  to_person: string;
  type: string;
  created_by: string;
  /** Spouse edges only (Step 11.5). */
  marriage_date: string | null;
  is_divorced: boolean;
  divorce_date: string | null;
};

const PERSON_COLUMNS =
  "id, given_name, preferred_name, maiden_name, family_name, date_of_birth, date_of_death, city_of_birth, country_of_birth, is_deceased, place_of_death, lineage_type, photo_path, pos_x, pos_y, owner_user_id, created_by, verified_at";

/** Everyone in the tree plus their relationship edges, with signed photo URLs. */
export async function getTreeGraph(treeId: string): Promise<{
  people: TreeGraphPerson[];
  relationships: TreeGraphEdge[];
}> {
  const supabase = await createClient();
  const [peopleRes, relRes, claimRes, flagRes] = await Promise.all([
    supabase.from("people").select(PERSON_COLUMNS).eq("tree_id", treeId),
    supabase
      .from("relationships")
      .select(
        "id, from_person, to_person, type, created_by, marriage_date, is_divorced, divorce_date",
      )
      .eq("tree_id", treeId),
    supabase
      .from("claims")
      .select("id, person_id, status")
      .in("status", ["approved", "disputed"]),
    supabase
      .from("entry_comments")
      .select("person_id")
      .eq("is_flag", true)
      .eq("status", "open"),
  ]);

  const openFlagsByPerson = new Map<string, number>();
  for (const f of flagRes.data ?? []) {
    openFlagsByPerson.set(
      f.person_id,
      (openFlagsByPerson.get(f.person_id) ?? 0) + 1,
    );
  }

  const rows = peopleRes.data ?? [];

  // person_id -> active claim. `disputed` wins over `approved` if both exist.
  const claimByPerson = new Map<
    string,
    { id: string; status: "approved" | "disputed" }
  >();
  for (const c of claimRes.data ?? []) {
    const status = c.status as "approved" | "disputed";
    const current = claimByPerson.get(c.person_id);
    if (!current || (current.status === "approved" && status === "disputed")) {
      claimByPerson.set(c.person_id, { id: c.id, status });
    }
  }
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
    people: rows.map((p) => {
      const claim = claimByPerson.get(p.id) ?? null;
      return {
        ...p,
        photo_url: p.photo_path ? urlByPath.get(p.photo_path) ?? null : null,
        claim_status: claim?.status ?? null,
        claim_id: claim?.id ?? null,
        open_flag_count: openFlagsByPerson.get(p.id) ?? 0,
      };
    }),
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
    .select("id, given_name, preferred_name, maiden_name, family_name")
    .eq("tree_id", treeId)
    .order("family_name", { ascending: true });

  return (data ?? [])
    .filter((p) => p.id !== excludeId)
    .map((p) => ({
      id: p.id,
      label: personDisplayName(p),
      maidenName: p.maiden_name ?? null,
    }));
}
