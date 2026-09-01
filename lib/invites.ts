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

export type BareInvite = {
  id: string;
  token: string;
  status: "active" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string | null;
  /** Null if the minter's profile has no display name set. */
  createdByName: string | null;
};

/**
 * How many of the newest invites to look at when hunting for bare ones, and
 * how many bare ones to actually show. PostgREST can't cheaply express "has
 * no matching invite_requests row", so the emptiness test happens here — the
 * scan limit is the ceiling on how far back a bare link stays visible.
 */
const BARE_SCAN_LIMIT = 200;
const BARE_LIMIT = 50;

/**
 * Invite links minted with no recipient attached — the "create invite link"
 * button rather than a name-and-email send or an approved request. They have
 * no `invite_requests` row, so they never surface in `listInviteHistory`;
 * without this they'd be invisible and impossible to kill.
 */
export async function listBareInvites(): Promise<BareInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select(
      "id, token, status, created_at, expires_at, profiles!invites_created_by_fkey(display_name), invite_requests(id)",
    )
    .order("created_at", { ascending: false })
    .limit(BARE_SCAN_LIMIT);

  return (data ?? [])
    .filter((i) => {
      const attached = Array.isArray(i.invite_requests)
        ? i.invite_requests
        : i.invite_requests
          ? [i.invite_requests]
          : [];
      return attached.length === 0;
    })
    .slice(0, BARE_LIMIT)
    .map((i) => {
      // One-to-one FK, but the embed still comes back as an array.
      const creator = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;
      return {
        id: i.id,
        token: i.token,
        status: i.status as BareInvite["status"],
        createdAt: i.created_at,
        expiresAt: i.expires_at,
        createdByName: creator?.display_name ?? null,
      };
    });
}
