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

export type CanvasRequestStatus = "pending" | "approved" | "declined";

/** The caller's most recent canvas request, if they have ever made one. */
export async function getMyCanvasRequest(
  db?: DbClient,
): Promise<{ id: string; status: CanvasRequestStatus; createdAt: string } | null> {
  const supabase = db ?? (await createClient());
  // RLS narrows this to the caller's own rows.
  const { data } = await supabase
    .from("tree_canvas_requests")
    .select("id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    status: data.status as CanvasRequestStatus,
    createdAt: data.created_at,
  };
}

export type PendingCanvasRequest = {
  id: string;
  requesterName: string;
  bridgeName: string | null;
  note: string | null;
  createdAt: string;
};

/** Admin: the pending queue, with names resolved for the review card. */
export async function listPendingCanvasRequests(
  db?: DbClient,
): Promise<PendingCanvasRequest[]> {
  const supabase = db ?? (await createClient());
  const { data } = await supabase
    .from("tree_canvas_requests")
    .select("id, note, created_at, requester_user_id, bridge_person_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const [{ data: profiles }, { data: people }] = await Promise.all([
    supabase
      .from("profiles")
      .select("auth_user_id, display_name")
      .in("auth_user_id", rows.map((r) => r.requester_user_id)),
    supabase
      .from("people")
      .select("id, first_name, preferred_name, last_name")
      .in(
        "id",
        rows
          .map((r) => r.bridge_person_id)
          .filter((id): id is string => id !== null),
      ),
  ]);

  const nameOf = new Map(
    (profiles ?? []).map((p) => [p.auth_user_id, p.display_name ?? "A member"]),
  );
  const personName = new Map(
    (people ?? []).map((p) => [
      p.id,
      [p.preferred_name ?? p.first_name, p.last_name]
        .filter(Boolean)
        .join(" "),
    ]),
  );

  return rows.map((r) => ({
    id: r.id,
    requesterName: nameOf.get(r.requester_user_id) ?? "A member",
    bridgeName: r.bridge_person_id
      ? personName.get(r.bridge_person_id) ?? null
      : null,
    note: r.note,
    createdAt: r.created_at,
  }));
}
