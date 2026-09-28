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

/**
 * One of the viewer's own suggestions for an entry that was declined, to
 * edit and resend (Step 71): the one named, or else their latest answered
 * one, if that was declined. With who declined it and why.
 */
export async function getOwnDeclinedSuggestion(
  personId: string,
  userId: string,
  suggestionId?: string,
): Promise<DeclinedSuggestion | null> {
  const supabase = await createClient();
  let query = supabase
    .from("entry_suggestions")
    .select(`${COLUMNS}, status, decided_by, decline_reason`)
    .eq("person_id", personId)
    .eq("suggested_by", userId)
    .neq("status", "pending");
  if (suggestionId) query = query.eq("id", suggestionId);
  const { data } = await query
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.status !== "declined") return null;
  const { data: decider } = data.decided_by
    ? await supabase
        .from("member_directory")
        .select("display_name")
        .eq("auth_user_id", data.decided_by)
        .limit(1)
        .maybeSingle()
    : { data: null };
  return {
    ...toSuggestion(data, userId),
    declinedBy: decider?.display_name ?? null,
    declineReason: data.decline_reason,
  };
}
