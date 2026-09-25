import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Bloodline } from "@/lib/bloodline";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;

/** What the signed-in member is allowed to grow on one tree, per `my_growth_rights(tree)`. */
export type GrowthRights = {
  /** False when signed out or not on the tree. Married-in members keep the
   *  affordance — anyone with a blood tie can still be added (Step 53). */
  canAdd: boolean;
  /** They married into this family: their own side has no blood tie here, so
   *  "Add a relative" points them at a tree of their own (Step 25). */
  isMarriedIn: boolean;
  /** The tree has anchors configured; with none, the gate is off entirely. */
  gateActive: boolean;
  selfPersonId: string | null;
  /** No self entry on this tree yet. Adding themselves still needs a blood tie
   *  (Step 53), as their child, parent, sibling or partner. */
  onboarding: boolean;
};

const SIGNED_OUT: GrowthRights = {
  canAdd: false,
  isMarriedIn: false,
  gateActive: false,
  selfPersonId: null,
  onboarding: false,
};

export async function getGrowthRights(
  treeId: string,
  db?: DbClient,
): Promise<GrowthRights> {
  const supabase = db ?? (await createClient());
  const { data, error } = await supabase.rpc("my_growth_rights", {
    p_tree: treeId,
  });
  if (error || !data) return SIGNED_OUT;

  const row = data as Record<string, unknown>;
  return {
    canAdd: row.can_add === true,
    isMarriedIn: row.is_married_in === true,
    gateActive: row.gate_active === true,
    selfPersonId: (row.self_person_id as string | null) ?? null,
    onboarding: row.onboarding === true,
  };
}

/**
 * A tree's bloodline, for the add flow to foresee a refusal for want of a
 * blood tie (Step 53, `lib/bloodline.ts#newWithoutBloodTie`): every anchor,
 * which the gate counts from, and every line the tree draws. Null when either
 * can't be read, so the form stays quiet rather than warn wrongly.
 */
export async function getBloodline(
  treeId: string,
  db?: DbClient,
): Promise<Bloodline | null> {
  const supabase = db ?? (await createClient());
  const [anchors, edges] = await Promise.all([
    supabase
      .from("bloodline_anchors")
      .select("person_id")
      .eq("tree_id", treeId),
    supabase
      .from("tree_edges")
      .select("from_person, to_person, type")
      .eq("tree_id", treeId),
  ]);
  if (anchors.error || edges.error) return null;
  return {
    anchors: anchors.data.map((a) => a.person_id),
    edges: edges.data.flatMap((e) =>
      e.from_person && e.to_person && e.type
        ? [{ from_person: e.from_person, to_person: e.to_person, type: e.type }]
        : [],
    ),
  };
}
