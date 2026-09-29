import "server-only";

import { cache } from "react";

import { getSessionUser } from "@/lib/auth";
import {
  carryApprovalOf,
  isCarryAsk,
  type CarryApproval,
  type CarryLine,
  type CarryPerson,
} from "@/lib/carry";
import { personDisplayName, personLifespan } from "@/lib/person-name";
import { createClient } from "@/lib/supabase/server";
import { readIn } from "@/lib/tree";

/**
 * Whether an entry is on a tree now (an active placement), as far as the
 * caller may see. Once per request: the tree pages, onboarding and the
 * claim invite all ask it (Step 77.1, audit R7).
 */
export const isPlacedOn = cache(
  async (treeId: string, personId: string): Promise<boolean> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tree_placements")
      .select("id")
      .eq("tree_id", treeId)
      .eq("person_id", personId)
      .eq("status", "active")
      .maybeSingle();
    return !!data;
  },
);

/** What a Root may bring onto `treeId`, and the lines a family is read from. */
export type CarryChoices = {
  /**
   * Everyone the caller can see in full on their other trees, by name.
   * Those on this tree already are there to pick a line from (`here`).
   */
  people: CarryPerson[];
  /** The lines between them, as the other trees draw them. */
  lines: CarryLine[];
};

/**
 * Who a Root could bring onto `treeId` (Steps 25 and 80): everyone they can
 * see in full on their other trees, each with what bringing them over would
 * ask (`placement_preview`), and the lines between them, so "All descendants
 * of" can be answered as they pick. Someone on two trees appears once. A
 * basic card on another tree isn't theirs to pass on, so it's left out.
 */
export async function listCarryChoices(treeId: string): Promise<CarryChoices> {
  const user = await getSessionUser();
  if (!user) return { people: [], lines: [] };
  const supabase = await createClient();

  // No embed here: `tree_people` is a view, and PostgREST can't follow a
  // relationship from it; tree names come from `trees` directly.
  const [{ data: rows }, { data: here }, { data: trees }, { data: edges }] =
    await Promise.all([
      supabase
        .from("tree_people")
        .select(
          "id, tree_id, first_name, preferred_name, maiden_name, last_name, date_of_birth, date_of_death, date_of_birth_circa, date_of_death_circa, is_deceased",
        )
        .neq("tree_id", treeId)
        .eq("detail", "full"),
      supabase
        .from("tree_placements")
        .select("person_id")
        .eq("tree_id", treeId)
        .eq("status", "active"),
      supabase.from("trees").select("id, name"),
      supabase
        .from("tree_edges")
        .select("from_person, to_person, type")
        .neq("tree_id", treeId),
    ]);
  const treeName = new Map((trees ?? []).map((t) => [t.id, t.name]));
  const shown = new Set((here ?? []).map((p) => p.person_id));

  const byId = new Map<string, CarryPerson>();
  for (const r of rows ?? []) {
    if (!r.id || !r.last_name) continue;
    const name = r.tree_id ? treeName.get(r.tree_id) : undefined;
    const existing = byId.get(r.id);
    if (existing) {
      if (name && !existing.fromTrees.includes(name)) existing.fromTrees.push(name);
      continue;
    }
    const person = { ...r, last_name: r.last_name, is_deceased: r.is_deceased ?? false };
    byId.set(r.id, {
      id: r.id,
      name: personDisplayName(person),
      lifespan: personLifespan(person),
      fromTrees: name ? [name] : [],
      here: shown.has(r.id),
      // Until the database says otherwise, the careful answer.
      asks: "stewards",
    });
  }

  const toBring = [...byId.values()].filter((p) => !p.here).map((p) => p.id);
  const previews = await readIn(toBring, (chunk) =>
    supabase.rpc("placement_preview", { p_person_ids: chunk }),
  );
  for (const row of previews) {
    const person = byId.get(row.person_id);
    if (person && isCarryAsk(row.asks)) person.asks = row.asks;
  }

  const seen = new Set<string>();
  const lines = (edges ?? []).flatMap((e): CarryLine[] => {
    if (!e.from_person || !e.to_person || !e.type) return [];
    if (!byId.has(e.from_person) || !byId.has(e.to_person)) return [];
    const key = `${e.type}:${e.from_person}:${e.to_person}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ from_person: e.from_person, to_person: e.to_person, type: e.type }];
  });

  return {
    people: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)),
    lines,
  };
}

export type CarriedPerson = {
  placementId: string;
  personId: string;
  name: string;
  homeTreeName: string | null;
  /** `lapsed` once an ask has waited 30 days: a Root can ask again. */
  approval: CarryApproval;
  /** Whose yes it waits on, or waited on; `null` when nobody was asked. */
  askedOf: "owner" | "stewards" | null;
};

/**
 * Everyone on `treeId` whose home is elsewhere, newest first: how much of
 * each the tree shows, and whose yes the rest waits on (`tree_carried`,
 * which answers a Root of the tree and nobody else).
 */
export async function listCarried(treeId: string): Promise<CarriedPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("tree_carried", { p_tree: treeId });
  return (data ?? []).map((row) => ({
    placementId: row.placement_id,
    personId: row.person_id,
    name: row.person_name || "Unnamed person",
    homeTreeName: row.home_tree_name ?? null,
    approval: carryApprovalOf(row.approval),
    askedOf:
      row.asked_of === "owner" || row.asked_of === "stewards"
        ? row.asked_of
        : null,
  }));
}

export type PlacementAsk = {
  placementId: string;
  treeId: string;
  treeName: string;
  personId: string;
  personName: string;
  /** Their own entry, rather than one they may edit. */
  own: boolean;
  homeTreeName: string;
  askedByName: string | null;
  /** `lapsed`: nobody answered in 30 days; a yes is still taken. */
  approval: Exclude<CarryApproval, "none">;
};

/**
 * What's been asked of the member, answered or not (`placement_asks`): their
 * own entry on trees that aren't its home, and nobody's own entries they may
 * edit. The trees asking are often ones they aren't on.
 */
export const listPlacementAsks = cache(async (): Promise<PlacementAsk[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("placement_asks");
  return (data ?? []).flatMap((row): PlacementAsk[] => {
    const approval = carryApprovalOf(row.approval);
    return approval === "none"
      ? []
      : [
          {
            placementId: row.placement_id,
            treeId: row.tree_id,
            treeName: row.tree_name,
            personId: row.person_id,
            personName: row.person_name || "Unnamed person",
            own: row.own,
            homeTreeName: row.home_tree_name,
            askedByName: row.asked_by_name || null,
            approval,
          },
        ];
  });
});
