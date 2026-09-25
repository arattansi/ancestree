import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

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
