import "server-only";

import { memberNames } from "@/lib/member-names.server";
import { personDisplayName } from "@/lib/person-name";
import { createClient } from "@/lib/supabase/server";

/**
 * A problem reported with an entry, still open (Step 88.2): something wrong
 * in its details, or, from whoever added it, who claimed it. Seen only by
 * whoever can put it right and whoever raised it (`entry_reports` RLS).
 */
export type EntryReport = {
  id: string;
  personId: string;
  body: string;
  /** Disputes who claimed the entry, rather than its details. */
  dispute: boolean;
  createdAt: string;
  authorName: string;
  /** The viewer raised it, so may withdraw it. */
  mine: boolean;
  /** For a dispute: who claimed the entry. */
  claimantName: string | null;
};

/** One on the Root console's list, with whose entry it is. */
export type TreeReport = EntryReport & { personName: string };

const COLUMNS =
  "id, person_id, claim_id, body, created_at, created_by, claims(claimant_user_id)";

type ReportRow = {
  id: string;
  person_id: string;
  claim_id: string | null;
  body: string;
  created_at: string;
  created_by: string | null;
  claims: { claimant_user_id: string } | null;
};

function asReport(
  r: ReportRow,
  names: Map<string, string | null>,
  viewerId: string,
): EntryReport {
  return {
    id: r.id,
    personId: r.person_id,
    body: r.body,
    dispute: r.claim_id !== null,
    createdAt: r.created_at,
    authorName: (r.created_by && names.get(r.created_by)) || "A relative",
    mine: r.created_by === viewerId,
    claimantName: r.claims
      ? (names.get(r.claims.claimant_user_id) ?? null)
      : null,
  };
}

/** Whose names the reports show: who raised each, who claimed a disputed entry. */
function namedIn(rows: ReportRow[]): (string | null)[] {
  return rows.flatMap((r) => [r.created_by, r.claims?.claimant_user_id ?? null]);
}

/** The open reports on one entry the viewer may see, oldest first. */
export async function listEntryReports(
  personId: string,
  viewerId: string,
): Promise<EntryReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_reports")
    .select(COLUMNS)
    .eq("person_id", personId)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const names = await memberNames(supabase, namedIn(rows));
  return rows.map((r) => asReport(r, names, viewerId));
}

/**
 * The open reports on a tree's own entries, for its Root console, oldest
 * first: its Roots see every one (they may edit them all, and decide the
 * disputes).
 */
export async function listTreeReports(
  treeId: string,
  viewerId: string,
): Promise<TreeReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entry_reports")
    .select(
      `${COLUMNS}, people!inner(tree_id, first_name, preferred_name, last_name)`,
    )
    .eq("people.tree_id", treeId)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const names = await memberNames(supabase, namedIn(rows));
  return rows.map((r) => ({
    ...asReport(r, names, viewerId),
    personName: personDisplayName(r.people),
  }));
}

/** How many reports wait on a tree's own entries: the Root console's queue. */
export async function countTreeReports(treeId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("entry_reports")
    .select("id, people!inner(tree_id)", { count: "exact", head: true })
    .eq("people.tree_id", treeId)
    .eq("status", "open");
  return count ?? 0;
}
