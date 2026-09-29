import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName, personLifespan } from "@/lib/person-name";
import {
  asSuggestionColumns,
  suggestionRows,
  type SuggestionRow,
} from "@/lib/suggestions";

export type ClaimCandidate = {
  id: string;
  name: string;
  lifespan: string | null;
  birthplace: string | null;
};

/**
 * Unclaimed, living entries already on the tree that look like the signed-in
 * member (same last name + a matching first/preferred name, or an invite
 * vouches for it). Drives the "Is this you? Claim it." prompt. Empty unless
 * the member's own entry is a placeholder they added that nobody else has
 * built on, since claiming merges it away (Step 36).
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
  /**
   * A Branch's edit to a Root's entry that this Root can still undo (Step
   * 22.4); `null` otherwise, or once it has been undone.
   */
  revertibleRevisionId: string | null;
  /** The tree this belongs to (Step 25): one inbox per tree. */
  treeId: string | null;
  treeName: string | null;
  treeSlug: string | null;
  /** A placement waiting on this member's answer (Step 25). */
  placementId: string | null;
  /**
   * The suggested change a `change_suggested` notice asks about (Step 67),
   * or that a `suggestion_accepted` / `suggestion_declined` one answers for
   * its suggester (Step 71): what it changes, its note, and whether it's
   * still waiting or who answered it and, if they declined it, why (Step
   * 69). `null` once withdrawn, or when the recipient may no longer see it.
   */
  suggestion: NotificationSuggestion | null;
};

export type NotificationSuggestion = {
  id: string;
  status: "pending" | "accepted" | "declined";
  rows: SuggestionRow[];
  note: string | null;
  /** Who accepted or declined it. */
  decidedBy: string | null;
  /** Why it was declined, if they said (Step 69). */
  declineReason: string | null;
};

/** The entry's columns a suggestion can change, to read it against. */
const SUGGESTION_ENTRY_COLUMNS =
  "id, first_name, middle_name, preferred_name, maiden_name, last_name, sex, date_of_birth, date_of_birth_precision, birth_month, birth_day, place_id_birth, city_of_birth, country_of_birth, is_deceased, date_of_death, date_of_death_precision, place_id_death, place_of_death";

/**
 * The suggested changes some notices ask about (Step 67), keyed by
 * suggestion. Only those the member may see come back (`entry_suggestions`
 * RLS): someone who may edit the entry.
 */
async function loadNotificationSuggestions(
  suggestionIds: string[],
): Promise<Map<string, NotificationSuggestion>> {
  const found = new Map<string, NotificationSuggestion>();
  if (suggestionIds.length === 0) return found;
  const supabase = await createClient();
  const { data: suggestions } = await supabase
    .from("entry_suggestions")
    .select(
      "id, person_id, status, changes, before, note, decided_by, decline_reason",
    )
    .in("id", suggestionIds);
  const rows = suggestions ?? [];
  if (rows.length === 0) return found;

  const waiting = [
    ...new Set(
      rows.flatMap((r) => (r.status === "pending" ? [r.person_id] : [])),
    ),
  ];
  const deciders = [
    ...new Set(rows.flatMap((r) => (r.decided_by ? [r.decided_by] : []))),
  ];
  const [{ data: people }, { data: members }] = await Promise.all([
    waiting.length > 0
      ? supabase
          .from("people")
          .select(SUGGESTION_ENTRY_COLUMNS)
          .in("id", waiting)
      : Promise.resolve({ data: [] }),
    deciders.length > 0
      ? supabase
          .from("member_directory")
          .select("auth_user_id, display_name")
          .in("auth_user_id", deciders)
      : Promise.resolve({ data: [] }),
  ]);
  const entryById = new Map((people ?? []).map((p) => [p.id, p]));
  const nameById = new Map(
    (members ?? []).map((m) => [m.auth_user_id, m.display_name]),
  );

  for (const r of rows) {
    const before = asSuggestionColumns(r.before);
    const status = r.status as NotificationSuggestion["status"];
    // While it waits, against the entry now (or as it stood when suggested,
    // if it can't be read); once answered, the change as it was made.
    const against =
      status === "pending" ? (entryById.get(r.person_id) ?? before) : before;
    found.set(r.id, {
      id: r.id,
      status,
      rows: suggestionRows(asSuggestionColumns(r.changes), against),
      note: r.note,
      decidedBy: r.decided_by ? (nameById.get(r.decided_by) ?? null) : null,
      declineReason: r.decline_reason,
    });
  }
  return found;
}

/**
 * How many of the signed-in member's notifications are unread, and when the
 * newest of them arrived (ms, 0 for none): all the header's bell shows until
 * it's opened (Step 77.2). One read, on the index of unread rows.
 */
export async function countUnreadNotifications(
  userId: string,
): Promise<{ count: number; latestAt: number }> {
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("notifications")
    .select("created_at", { count: "exact" })
    .eq("recipient_user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return {
    count: count ?? 0,
    latestAt: data?.[0] ? Date.parse(data[0].created_at) || 0 : 0,
  };
}

/**
 * Recent in-app notifications for the signed-in member, newest first. With
 * `treeId`, only that tree's inbox; without, every tree, each item naming
 * its tree. Once per request; what the items point at is read side by side
 * (Step 77.2).
 */
export const listNotifications = cache(async function listNotifications(
  userId: string,
  treeId?: string,
): Promise<NotificationItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select(
      "id, type, body, created_at, read_at, person_id, claim_id, revision_id, suggestion_id, tree_id, trees(name, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (treeId) query = query.eq("tree_id", treeId);
  const { data } = await query;

  const rows = data ?? [];

  // Suggested changes a notice asks about (Step 67), or answers (Step 71),
  // looked up alongside the rest.
  const suggestionsLoaded = loadNotificationSuggestions([
    ...new Set(rows.flatMap((n) => (n.suggestion_id ? [n.suggestion_id] : []))),
  ]);

  // Placement requests point at the placement the member must answer.
  const pendingPersonIds = rows
    .filter((n) => n.type === "placement_requested" && n.person_id && n.tree_id)
    .map((n) => n.person_id as string);
  const claimIds = rows
    .map((n) => n.claim_id)
    .filter((id): id is string => Boolean(id));
  // Revisions are readable by Roots only, so for anyone else this finds none.
  const revisionIds = rows
    .map((n) => n.revision_id)
    .filter((id): id is string => Boolean(id));

  const [placements, claims, revisions, suggestions] = await Promise.all([
    pendingPersonIds.length > 0
      ? supabase
          .from("tree_placements")
          .select("id, tree_id, person_id")
          .eq("status", "pending")
          .in("person_id", [...new Set(pendingPersonIds)])
          .then(({ data }) => data ?? [])
      : [],
    // The claims with who made each entry, in one read.
    claimIds.length > 0
      ? supabase
          .from("claims")
          .select("id, status, person_id, people(created_by)")
          .in("id", claimIds)
          .then(({ data }) => data ?? [])
      : [],
    revisionIds.length > 0
      ? supabase
          .from("entry_revisions")
          .select("id")
          .in("id", revisionIds)
          .is("reverted_at", null)
          .then(({ data }) => data ?? [])
      : [],
    suggestionsLoaded,
  ]);

  const placementByPerson = new Map<string, string>();
  for (const p of placements) {
    placementByPerson.set(`${p.tree_id}:${p.person_id}`, p.id);
  }
  // Which of these notifications point at a claim this user may still dispute:
  // they created the entry and the claim is currently `approved`.
  const disputable = new Set<string>();
  for (const c of claims) {
    const entry = Array.isArray(c.people) ? c.people[0] : c.people;
    if (c.status === "approved" && entry?.created_by === userId) {
      disputable.add(c.id);
    }
  }
  const revertible = new Set(revisions.map((r) => r.id));

  return rows.map((n) => {
    const tree = Array.isArray(n.trees) ? n.trees[0] : n.trees;
    return {
      id: n.id,
      type: n.type,
      body: n.body,
      createdAt: n.created_at,
      readAt: n.read_at,
      personId: n.person_id,
      claimId: n.claim_id,
      canDispute: n.claim_id ? disputable.has(n.claim_id) : false,
      revertibleRevisionId:
        n.revision_id && revertible.has(n.revision_id) ? n.revision_id : null,
      treeId: n.tree_id,
      treeName: tree?.name ?? null,
      treeSlug: tree?.slug ?? null,
      placementId:
        n.type === "placement_requested" && n.tree_id && n.person_id
          ? placementByPerson.get(`${n.tree_id}:${n.person_id}`) ?? null
          : null,
      suggestion: n.suggestion_id
        ? (suggestions.get(n.suggestion_id) ?? null)
        : null,
    };
  });
});

export type DisputedClaim = {
  id: string;
  personId: string;
  personName: string;
  claimantName: string | null;
  creatorName: string | null;
  reason: string | null;
  disputedAt: string;
};

/** Disputed claims on one tree's entries awaiting a Root's decision. */
export async function listDisputedClaims(treeId: string): Promise<DisputedClaim[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase
    .from("claims")
    .select("id, person_id, claimant_user_id, dispute_reason, updated_at, people!inner(tree_id)")
    .eq("status", "disputed")
    .eq("people.tree_id", treeId)
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
