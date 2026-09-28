import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asSuggestionColumns, type EntrySuggestion } from "@/lib/suggestions";

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
