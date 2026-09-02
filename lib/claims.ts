import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName, personLifespan } from "@/lib/person-name";

export type ClaimCandidate = {
  id: string;
  name: string;
  lifespan: string | null;
  birthplace: string | null;
};

/**
 * Unclaimed entries already on the tree that look like the signed-in member
 * (same last name + a matching first/preferred name). Drives the
 * "Is this you? Claim it." prompt. Empty until the member has a self entry.
 */
export async function listClaimCandidates(): Promise<ClaimCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("person_claim_candidates");
  if (error || !data) return [];

  return data.map((p) => ({
    id: p.id,
    name: personDisplayName(p),
    lifespan: personLifespan(p),
    birthplace:
      [p.city_of_birth, p.country_of_birth].filter(Boolean).join(", ") || null,
  }));
}

export type NotificationItem = {
  id: string;
  type: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  personId: string | null;
  claimId: string | null;
  /** True when the recipient is the entry's creator and can still dispute. */
  canDispute: boolean;
};

/** Recent in-app notifications for the signed-in member, newest first. */
export async function listNotifications(
  userId: string,
): Promise<NotificationItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, body, created_at, read_at, person_id, claim_id")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = data ?? [];
  const claimIds = rows
    .map((n) => n.claim_id)
    .filter((id): id is string => Boolean(id));

  // Which of these notifications point at a claim this user may still dispute:
  // they created the entry and the claim is currently `approved`.
  const disputable = new Set<string>();
  if (claimIds.length > 0) {
    const { data: claims } = await supabase
      .from("claims")
      .select("id, status, person_id")
      .in("id", claimIds);
    const approved = (claims ?? []).filter((c) => c.status === "approved");
    if (approved.length > 0) {
      const { data: people } = await supabase
        .from("people")
        .select("id, created_by")
        .in("id", [...new Set(approved.map((c) => c.person_id))]);
      const mine = new Set(
        (people ?? [])
          .filter((p) => p.created_by === userId)
          .map((p) => p.id),
      );
      for (const c of approved) if (mine.has(c.person_id)) disputable.add(c.id);
    }
  }

  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    body: n.body,
    createdAt: n.created_at,
    readAt: n.read_at,
    personId: n.person_id,
    claimId: n.claim_id,
    canDispute: n.claim_id ? disputable.has(n.claim_id) : false,
  }));
}

export type DisputedClaim = {
  id: string;
  personId: string;
  personName: string;
  claimantName: string | null;
  creatorName: string | null;
  reason: string | null;
  disputedAt: string;
};

/** Disputed claims awaiting an admin decision. */
export async function listDisputedClaims(): Promise<DisputedClaim[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("claims")
    .select("id, person_id, claimant_user_id, dispute_reason, updated_at")
    .eq("status", "disputed")
    .order("updated_at", { ascending: true });

  const rows = claims ?? [];
  if (rows.length === 0) return [];

  const personIds = [...new Set(rows.map((r) => r.person_id))];
  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, preferred_name, last_name, created_by")
    .in("id", personIds);
  const personById = new Map((people ?? []).map((p) => [p.id, p]));

  const memberIds = [
    ...new Set([
      ...rows.map((r) => r.claimant_user_id),
      ...(people ?? []).map((p) => p.created_by),
    ]),
  ];
  const { data: members } = await supabase
    .from("member_directory")
    .select("auth_user_id, display_name")
    .in("auth_user_id", memberIds);
  const nameById = new Map(
    (members ?? []).map((m) => [m.auth_user_id, m.display_name]),
  );

  return rows.map((r) => {
    const person = personById.get(r.person_id);
    return {
      id: r.id,
      personId: r.person_id,
      personName: person ? personDisplayName(person) : "Unknown entry",
      claimantName: nameById.get(r.claimant_user_id) ?? null,
      creatorName: person ? nameById.get(person.created_by) ?? null : null,
      reason: r.dispute_reason,
      disputedAt: r.updated_at,
    };
  });
}
