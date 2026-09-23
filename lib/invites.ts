import "server-only";

import { personDisplayName } from "@/lib/person-name";
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
  inviteStatus: "active" | "revoked" | null;
  expiresAt: string | null;
  /** A founder invite: redeeming starts a tree of their own (Step 25). */
  foundsTree: boolean;
};

const HISTORY_LIMIT = 50;

/**
 * Every invite that has gone out and been reviewed — both a public request an
 * admin approved/declined, and one an admin sent directly — newest first.
 * Drives the "Sent invites" history on /admin; the pending queue is a
 * separate, unrelated query (status = 'pending'). Joined invites are gone
 * (`redeem_invite` deletes them) and archived ones are left to
 * `listArchivedInvites`, so what's here is still waiting on someone.
 */
export async function listInviteHistory(treeId: string): Promise<InviteHistoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invite_requests")
    .select(
      "id, first_name, last_name, email, source, status, email_sent, reviewed_at, invites(token, status, expires_at, archived_at, founds_tree)",
    )
    .eq("tree_id", treeId)
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(HISTORY_LIMIT);

  return (data ?? []).flatMap((r) => {
    // Supabase infers this embed as an array even though invite_id -> invites.id
    // is one-to-one; a request can also have never been approved (no invite).
    const invite = Array.isArray(r.invites) ? r.invites[0] : r.invites;
    if (invite?.archived_at) return [];
    return [{
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
      foundsTree: invite?.founds_tree ?? false,
    }];
  });
}

export type BareInvite = {
  id: string;
  token: string;
  status: "active" | "revoked";
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
export async function listBareInvites(treeId: string): Promise<BareInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select(
      "id, token, status, created_at, expires_at, profiles!invites_created_by_fkey(display_name), invite_requests(id)",
    )
    .eq("tree_id", treeId)
    .is("archived_at", null)
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

/**
 * Archive every invite that has run out unused. There's no scheduler, so
 * /admin calls this as it loads, before listing anything: a lapsed link is
 * already dead (`redeem_invite` checks `expires_at`), so all that waits on
 * this is which list it shows up in. Needs a Root — it's their RLS that
 * allows the update.
 */
export async function archiveExpiredInvites(treeId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("invites")
    .update({ archived_at: new Date().toISOString() })
    .eq("tree_id", treeId)
    .eq("status", "active")
    .is("archived_at", null)
    .lt("expires_at", new Date().toISOString());
}

export type ArchivedInvite = {
  id: string;
  /** "First Last" from its "Sent invites" record; null for a bare link. */
  recipientName: string | null;
  /** Who it was emailed to; null for a bare link. */
  email: string | null;
  /** The entry a claim invite was for, if it still exists. */
  claimPersonName: string | null;
  createdByName: string | null;
  expiresAt: string | null;
  archivedAt: string;
};

const ARCHIVED_LIMIT = 50;

/** Invites that expired unused, most recently archived first. */
export async function listArchivedInvites(treeId: string): Promise<ArchivedInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select(
      "id, invited_email, expires_at, archived_at, profiles!invites_created_by_fkey(display_name), invite_requests(first_name, last_name, email), people(first_name, preferred_name, last_name)",
    )
    .eq("tree_id", treeId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(ARCHIVED_LIMIT);

  return (data ?? []).map((i) => {
    // One-to-one FKs that PostgREST still hands back as arrays.
    const creator = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;
    const request = Array.isArray(i.invite_requests)
      ? i.invite_requests[0]
      : i.invite_requests;
    const person = Array.isArray(i.people) ? i.people[0] : i.people;
    return {
      id: i.id,
      recipientName: request
        ? `${request.first_name} ${request.last_name}`.trim() || null
        : null,
      email: i.invited_email ?? request?.email ?? null,
      claimPersonName: person ? personDisplayName(person) : null,
      createdByName: creator?.display_name ?? null,
      expiresAt: i.expires_at,
      archivedAt: i.archived_at as string,
    };
  });
}
