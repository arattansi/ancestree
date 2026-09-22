import "server-only";

import { getUser } from "@/lib/auth";
import { personDisplayName, personLifespan } from "@/lib/person-name";
import { createClient } from "@/lib/supabase/server";

export type PlacementCandidate = {
  id: string;
  name: string;
  lifespan: string | null;
  /** The trees the caller can see them on. */
  fromTrees: string[];
  /** Another member's own entry: placing it waits for their yes. */
  needsConsent: boolean;
};

/**
 * People a Root could bring onto `treeId` (Step 25): everyone the caller can
 * see on their other trees who isn't shown on this one yet. Grouped by name
 * so one person on two trees appears once.
 */
export async function listPlacementCandidates(
  treeId: string,
): Promise<PlacementCandidate[]> {
  const user = await getUser();
  if (!user) return [];
  const supabase = await createClient();

  // No embed here: `tree_people` is a view, and PostgREST can't follow a
  // relationship from it; tree names come from `trees` directly.
  const [{ data: rows }, { data: here }, { data: owned }, { data: claimed }, { data: trees }] =
    await Promise.all([
      supabase
        .from("tree_people")
        .select(
          "id, tree_id, first_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_death, is_deceased",
        )
        .neq("tree_id", treeId),
      supabase
        .from("tree_placements")
        .select("person_id, status")
        .eq("tree_id", treeId),
      supabase
        .from("profiles")
        .select("auth_user_id, self_person_id")
        .not("self_person_id", "is", null),
      supabase.from("claims").select("person_id, claimant_user_id").eq("status", "approved"),
      supabase.from("trees").select("id, name"),
    ]);
  const treeName = new Map((trees ?? []).map((t) => [t.id, t.name]));

  const shown = new Set(
    (here ?? []).filter((p) => p.status !== "declined").map((p) => p.person_id),
  );
  const ownerOf = new Map<string, string>();
  for (const p of owned ?? []) if (p.self_person_id) ownerOf.set(p.self_person_id, p.auth_user_id);
  for (const c of claimed ?? []) if (!ownerOf.has(c.person_id)) ownerOf.set(c.person_id, c.claimant_user_id);

  const byId = new Map<string, PlacementCandidate>();
  for (const r of rows ?? []) {
    if (!r.id || !r.last_name || shown.has(r.id)) continue;
    const name = r.tree_id ? treeName.get(r.tree_id) : undefined;
    const existing = byId.get(r.id);
    if (existing) {
      if (name && !existing.fromTrees.includes(name)) existing.fromTrees.push(name);
      continue;
    }
    const person = { ...r, last_name: r.last_name, is_deceased: r.is_deceased ?? false };
    const owner = ownerOf.get(r.id);
    byId.set(r.id, {
      id: r.id,
      name: personDisplayName(person),
      lifespan: personLifespan(person),
      fromTrees: name ? [name] : [],
      needsConsent: !!owner && owner !== user.id,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type ForeignPlacement = {
  placementId: string;
  personId: string;
  name: string;
  status: "active" | "pending" | "declined";
  homeTreeName: string | null;
};

/**
 * Everyone on `treeId` whose home is elsewhere, plus placements still waiting
 * on (or declined by) the person. What the Root has brought over.
 */
export async function listForeignPlacements(
  treeId: string,
): Promise<ForeignPlacement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tree_placements")
    .select(
      "id, status, person_id, people!inner(id, tree_id, first_name, preferred_name, last_name, trees(name))",
    )
    .eq("tree_id", treeId)
    .neq("people.tree_id", treeId)
    .order("created_at", { ascending: false });

  return (data ?? []).flatMap((p) => {
    const person = Array.isArray(p.people) ? p.people[0] : p.people;
    if (!person) return [];
    const home = Array.isArray(person.trees) ? person.trees[0] : person.trees;
    return [
      {
        placementId: p.id,
        personId: p.person_id,
        name: personDisplayName(person),
        status: p.status as ForeignPlacement["status"],
        homeTreeName: home?.name ?? null,
      },
    ];
  });
}
