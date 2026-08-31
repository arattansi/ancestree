import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/person-name";
import {
  computeImpliedConnections,
  suggestionDedupeKey,
  type ImpliedConnection,
  type NewPersonInput,
  type PanelSuggestion,
  type PendingEdge,
} from "@/lib/connection-suggestions";

export type { PanelSuggestion };

/**
 * Load the tree's current people / edges / recorded suggestions and run the
 * detection engine over the pending edge set. Read-only — the caller persists
 * any accepted suggestion (and its edge) inside its own transaction (Step 11.3).
 */
export async function detectImpliedConnections(
  treeId: string,
  pending: { newPeople: NewPersonInput[]; pendingEdges: PendingEdge[] },
): Promise<ImpliedConnection[]> {
  const supabase = await createClient();

  const [peopleRes, edgeRes, sugRes] = await Promise.all([
    supabase
      .from("people")
      .select("id, last_name, date_of_birth")
      .eq("tree_id", treeId),
    supabase
      .from("relationships")
      .select("from_person, to_person, type")
      .eq("tree_id", treeId),
    supabase
      .from("connection_suggestions")
      .select("subject_person_id, related_person_id, suggested_type, source")
      .eq("tree_id", treeId),
  ]);

  const resolvedKeys = new Set(
    (sugRes.data ?? []).map((r) =>
      suggestionDedupeKey(
        r.subject_person_id,
        r.related_person_id,
        r.suggested_type as never,
        r.source as never,
      ),
    ),
  );

  return computeImpliedConnections({
    newPeople: pending.newPeople,
    pendingEdges: pending.pendingEdges,
    existingPeople: (peopleRes.data ?? []).map((p) => ({
      id: p.id,
      familyName: p.last_name,
      dateOfBirth: p.date_of_birth,
    })),
    existingEdges: (edgeRes.data ?? []).map((e) => ({
      from: e.from_person,
      to: e.to_person,
      type: e.type,
    })),
    resolvedKeys,
  });
}

/**
 * Pending implied connections the signed-in member is allowed to resolve
 * (its author, or any admin — mirrors the RLS on `connection_suggestions`).
 * The tree canvas filters these down to the person whose panel is open.
 */
export async function listPanelSuggestions(
  treeId: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<PanelSuggestion[]> {
  const supabase = await createClient();

  let query = supabase
    .from("connection_suggestions")
    .select(
      "id, subject_person_id, related_person_id, suggested_type, source, created_by",
    )
    .eq("tree_id", treeId)
    .eq("status", "pending");
  if (!isAdmin) query = query.eq("created_by", viewerId);

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.subject_person_id, r.related_person_id]),
    ),
  ];
  const { data: people } = await supabase
    .from("people")
    .select("id, first_name, preferred_name, last_name")
    .in("id", ids);
  const labelById = new Map(
    (people ?? []).map((p) => [p.id, personDisplayName(p)]),
  );

  return rows.map((r) => ({
    id: r.id,
    subjectPersonId: r.subject_person_id,
    relatedPersonId: r.related_person_id,
    suggestedType: r.suggested_type as PanelSuggestion["suggestedType"],
    source: r.source as PanelSuggestion["source"],
    subjectLabel: labelById.get(r.subject_person_id) ?? "someone",
    relatedLabel: labelById.get(r.related_person_id) ?? "someone",
  }));
}
