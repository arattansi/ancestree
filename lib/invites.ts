import "server-only";

import { createClient } from "@/lib/supabase/server";

export type InviteHistoryItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  source: "request" | "direct";
  status: "approved" | "declined";
  emailSent: boolean | null;
  reviewedAt: string | null;
  /** Null only if the invite row itself failed to load (shouldn't happen). */
  inviteToken: string | null;
  inviteStatus: "active" | "accepted" | "revoked" | null;
  expiresAt: string | null;
};

const HISTORY_LIMIT = 50;

/**
 * Every invite that has gone out and been reviewed — both a public request an
 * admin approved/declined, and one an admin sent directly — newest first.
 * Drives the "Sent invites" history on /admin; the pending queue is a
 * separate, unrelated query (status = 'pending').
 */
export async function listInviteHistory(): Promise<InviteHistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invite_requests")
    .select(
      "id, first_name, last_name, email, source, status, email_sent, reviewed_at, invites(token, status, expires_at)",
    )
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(HISTORY_LIMIT);

  return (data ?? []).map((r) => {
    // Supabase infers this embed as an array even though invite_id -> invites.id
    // is one-to-one; a request can also have never been approved (no invite).
    const invite = Array.isArray(r.invites) ? r.invites[0] : r.invites;
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      source: r.source === "direct" ? "direct" : "request",
      status: r.status === "declined" ? "declined" : "approved",
      emailSent: r.email_sent,
      reviewedAt: r.reviewed_at,
      inviteToken: invite?.token ?? null,
      inviteStatus: (invite?.status as InviteHistoryItem["inviteStatus"]) ?? null,
      expiresAt: invite?.expires_at ?? null,
    };
  });
}
