import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { loadTreeEdges, loadTreePeople } from "@/lib/tree";
import {
  auditTree,
  computeImpliedConnections,
  detectionTree,
  suggestionDedupeKey,
  type DetectionTree,
  type ImpliedConnection,
  type NewPersonInput,
  type PanelSuggestion,
  type PendingEdge,
} from "@/lib/connection-suggestions";

/**
 * Everything the engine reasons over, in one round trip: the tree's people and
 * edges, the ledger of suggestions members have already answered, and the
 * nickname groups (`detectionTree`).
 */
async function loadTree(treeId: string): Promise<DetectionTree> {
  const supabase = await createClient();

  const [people, { edges }, sugRes, nickRes] = await Promise.all([
    // What the tree shows (Step 25): its placed people and the lines between
    // them, from the tree views, read once with the canvas (Step 77.1).
    loadTreePeople(treeId),
    loadTreeEdges(treeId),
    // Answered rows only (`detectionTree`).
    supabase
      .from("connection_suggestions")
      .select("subject_person_id, related_person_id, suggested_type, source")
      .eq("tree_id", treeId)
      .neq("status", "pending"),
    supabase.from("name_nicknames").select("variant, canonical"),
  ]);

  return detectionTree({
    people,
    edges,
    answered: sugRes.data ?? [],
    nicknames: nickRes.data ?? [],
  });
}

/**
 * Run detection over the edges a pending add-person submit would create, so the
 * flow can show its approval modal before it commits. Read-only.
 */
export async function detectImpliedConnections(
  treeId: string,
  pending: { newPeople: NewPersonInput[]; pendingEdges: PendingEdge[] },
): Promise<ImpliedConnection[]> {
  const tree = await loadTree(treeId);
  return computeImpliedConnections({
    newPeople: pending.newPeople,
    pendingEdges: pending.pendingEdges,
    existingPeople: tree.people,
    existingEdges: tree.edges,
    resolvedKeys: tree.resolvedKeys,
    nicknameGroups: tree.nicknameGroups,
  });
}

/**
 * Every open candidate in the tree, strongest evidence first. Derived on read —
 * there are no "pending suggestion" rows to go stale, and improving a rule
 * improves the queue immediately. Once per request: the canvas and the
 * header's count share it (Step 77.1).
 */
export const auditTreeConnections = cache(
  async (treeId: string): Promise<PanelSuggestion[]> => {
    const tree = await loadTree(treeId);
    const candidates = auditTree({
      existingPeople: tree.people,
      existingEdges: tree.edges,
      resolvedKeys: tree.resolvedKeys,
      nicknameGroups: tree.nicknameGroups,
    });
    return candidates.flatMap(
      (c) => toPanelSuggestion(c, tree.labelById) ?? [],
    );
  },
);

/**
 * A computed candidate has no row of its own, so its identity *is* its key —
 * that is what the resolve action sends back. Candidates involving a person who
 * doesn't exist yet can't be resolved from the queue and are dropped.
 */
function toPanelSuggestion(
  c: ImpliedConnection,
  labelById: Map<string, string>,
): PanelSuggestion | null {
  if (c.subject.kind !== "existing" || c.related.kind !== "existing") {
    return null;
  }
  const subjectPersonId = c.subject.id;
  const relatedPersonId = c.related.id;
  return {
    id: suggestionDedupeKey(
      subjectPersonId,
      relatedPersonId,
      c.suggestedType,
      c.source,
    ),
    subjectPersonId,
    relatedPersonId,
    suggestedType: c.suggestedType,
    source: c.source,
    subjectLabel: labelById.get(subjectPersonId) ?? "someone",
    relatedLabel: labelById.get(relatedPersonId) ?? "someone",
    reason: c.reason,
    confidence: c.confidence,
    alsoFrom: c.alsoFrom,
    childPersonId:
      c.child?.kind === "existing" ? c.child.id : undefined,
  };
}

/**
 * How many candidates are open right now, for the nav badge. Runs the same
 * audit — the tree is small enough that counting and listing cost the same, and
 * a count that disagreed with the queue would be worse than no badge at all.
 */
export async function countOpenConnectionSuggestions(
  treeId: string,
): Promise<number> {
  try {
    return (await auditTreeConnections(treeId)).length;
  } catch {
    // Advisory: a badge is never worth failing the header over.
    return 0;
  }
}
