import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  asSuggestionColumns,
  type DeclinedSuggestion,
  type EntrySuggestion,
} from "@/lib/suggestions";

const COLUMNS =
  "id, person_id, suggested_by, suggested_by_name, note, created_at, changes, before";

type SuggestionRow = {
  id: string;
  person_id: string;
  suggested_by: string;
  suggested_by_name: string | null;
  note: string | null;
  created_at: string;
  changes: unknown;
  before: unknown;
};

function toSuggestion(row: SuggestionRow, userId: string): EntrySuggestion {
  return {
    id: row.id,
    personId: row.person_id,
    mine: row.suggested_by === userId,
    suggesterName: row.suggested_by_name ?? "A relative",
    note: row.note,
    createdAt: row.created_at,
    changes: asSuggestionColumns(row.changes),
    before: asSuggestionColumns(row.before),
  };
}

/**
 * The suggested changes still waiting that the viewer can see (Step 67):
 * their own, and those on entries they may edit, which are theirs to answer
 * (`entry_suggestions` RLS). Oldest first.
 */
export async function listPendingSuggestions(
  userId: string,
): Promise<EntrySuggestion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_suggestions")
    .select(COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => toSuggestion(row, userId));
}

/** The viewer's own suggestion for an entry, while it waits. */
export async function getOwnPendingSuggestion(
  personId: string,
  userId: string,
): Promise<EntrySuggestion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_suggestions")
    .select(COLUMNS)
    .eq("person_id", personId)
    .eq("suggested_by", userId)
    .eq("status", "pending")
    .maybeSingle();
  return data ? toSuggestion(data, userId) : null;
}

type DecidedRow = SuggestionRow & {
  decided_by: string | null;
  decided_at: string | null;
  decline_reason: string | null;
};

/** A declined suggestion with who declined it, by the member directory. */
async function withDeciders(
  rows: DecidedRow[],
  userId: string,
): Promise<DeclinedSuggestion[]> {
  const deciders = [
    ...new Set(rows.flatMap((r) => (r.decided_by ? [r.decided_by] : []))),
  ];
  const supabase = await createClient();
  const { data: members } = deciders.length
    ? await supabase
        .from("member_directory")
        .select("auth_user_id, display_name")
        .in("auth_user_id", deciders)
    : { data: [] };
  const nameById = new Map(
    (members ?? []).map((m) => [m.auth_user_id, m.display_name]),
  );
  return rows.map((r) => ({
    ...toSuggestion(r, userId),
    declinedBy: r.decided_by ? (nameById.get(r.decided_by) ?? null) : null,
    declineReason: r.decline_reason,
    declinedAt: r.decided_at ?? r.created_at,
  }));
}

/**
 * The viewer's own suggestions that were declined (Step 72), newest
 * first, for the cards of the entries they're on: only their own, never
 * anyone else's, and not those they've dismissed (Step 73).
 */
export async function listOwnDeclinedSuggestions(
  userId: string,
): Promise<DeclinedSuggestion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_suggestions")
    .select(`${COLUMNS}, decided_by, decided_at, decline_reason`)
    .eq("suggested_by", userId)
    .eq("status", "declined")
    .is("dismissed_at", null)
    .order("decided_at", { ascending: false });
  return withDeciders(data ?? [], userId);
}

/**
 * One of the viewer's own suggestions for an entry that was declined, to
 * edit and resend (Step 71): the one named, or else their latest answered
 * one, if that was declined and they haven't dismissed it (Step 73). With
 * who declined it and why.
 */
export async function getOwnDeclinedSuggestion(
  personId: string,
  userId: string,
  suggestionId?: string,
): Promise<DeclinedSuggestion | null> {
  const supabase = await createClient();
  let query = supabase
    .from("entry_suggestions")
    .select(
      `${COLUMNS}, status, decided_by, decided_at, decline_reason, dismissed_at`,
    )
    .eq("person_id", personId)
    .eq("suggested_by", userId)
    .neq("status", "pending");
  if (suggestionId) query = query.eq("id", suggestionId);
  const { data } = await query
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.status !== "declined") return null;
  if (!suggestionId && data.dismissed_at) return null;
  const [declined] = await withDeciders([data], userId);
  return declined ?? null;
}
