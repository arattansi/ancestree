import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  computeImpliedConnections,
  suggestionDedupeKey,
  type ImpliedConnection,
  type NewPersonInput,
  type PendingEdge,
} from "@/lib/connection-suggestions";

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
      .select("id, family_name, date_of_birth")
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
      familyName: p.family_name,
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
