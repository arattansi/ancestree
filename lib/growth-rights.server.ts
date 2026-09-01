import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type DbClient = SupabaseClient<Database>;

/** What the signed-in member is allowed to grow, per `my_growth_rights()`. */
export type GrowthRights = {
  /** False only when signed out. Married-in members keep the affordance —
   *  additions that land inside the bloodline are still allowed. */
  canAdd: boolean;
  /** They married into the family: additions that hang off them alone are
   *  refused, and the "start your own canvas" prompt explains why. */
  isMarriedIn: boolean;
  /** The tree has anchors configured; with none, the gate is off entirely. */
  gateActive: boolean;
  selfPersonId: string | null;
  /** No self entry yet — never gated, or they could not create themselves. */
  onboarding: boolean;
};

const SIGNED_OUT: GrowthRights = {
  canAdd: false,
  isMarriedIn: false,
  gateActive: false,
  selfPersonId: null,
  onboarding: false,
};

export async function getGrowthRights(db?: DbClient): Promise<GrowthRights> {
  const supabase = db ?? (await createClient());
  const { data, error } = await supabase.rpc("my_growth_rights");
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

export type CanvasInterestStatus = "new" | "contacted" | "dismissed";

/** Whether the caller has already told us they'd want a tree of their own. */
export async function hasRegisteredCanvasInterest(
  db?: DbClient,
): Promise<boolean> {
  const supabase = db ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // Scoped to the caller by hand, not by RLS: an admin can read every row.
  const { data } = await supabase
    .from("canvas_interest")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return data !== null;
}

export type CanvasInterestRow = {
  id: string;
  displayName: string | null;
  email: string | null;
  personName: string | null;
  note: string | null;
  status: CanvasInterestStatus;
  contactedAt: string | null;
  createdAt: string;
};

/**
 * Admin: the interest register — who asked, how to reach them, and where they
 * are in outreach. Contact details come from the admin-only RPC, which is the
 * only place `auth.users.email` is exposed.
 */
export async function listCanvasInterest(
  db?: DbClient,
): Promise<CanvasInterestRow[]> {
  const supabase = db ?? (await createClient());
  const { data } = await supabase.rpc("canvas_interest_register");

  return (data ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    email: r.email,
    personName: r.person_name,
    note: r.note,
    status: r.status as CanvasInterestStatus,
    contactedAt: r.contacted_at,
    createdAt: r.created_at,
  }));
}
