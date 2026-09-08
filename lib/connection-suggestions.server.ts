import "server-only";

import { createClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/person-name";
import { getSharedTree } from "@/lib/tree";
import {
  auditTree,
  computeImpliedConnections,
  suggestionDedupeKey,
  type ExistingEdge,
  type ExistingPerson,
  type ImpliedConnection,
  type NewPersonInput,
  type PanelSuggestion,
  type PendingEdge,
  type SuggestedType,
  type SuggestionSource,
} from "@/lib/connection-suggestions";

export type { PanelSuggestion };

type TreeSnapshot = {
  people: ExistingPerson[];
  edges: ExistingEdge[];
  resolvedKeys: Set<string>;
  nicknameGroups: string[][];
  labelById: Map<string, string>;
};

/**
 * Everything the engine reasons over, in one round trip: the tree's people and
 * edges, the ledger of suggestions members have already answered, and the
 * nickname groups that let duplicate detection see "Fateh" and "Fatehali" as
 * one name.
 */
async function loadTree(treeId: string): Promise<TreeSnapshot> {
  const supabase = await createClient();

  const [peopleRes, edgeRes, sugRes, nickRes] = await Promise.all([
    supabase
      .from("people")
      .select("id, first_name, preferred_name, last_name, date_of_birth")
      .eq("tree_id", treeId),
    supabase
      .from("relationships")
      .select(
        "from_person, to_person, type, marriage_date, divorce_date, is_divorced",
      )
      .eq("tree_id", treeId),
    supabase
      .from("connection_suggestions")
      .select("subject_person_id, related_person_id, suggested_type, source")
      .eq("tree_id", treeId),
    supabase.from("name_nicknames").select("variant, canonical"),
  ]);

  const labelById = new Map<string, string>();
  const people: ExistingPerson[] = (peopleRes.data ?? []).map((p) => {
    const label = personDisplayName(p);
    labelById.set(p.id, label);
    return {
      id: p.id,
      label,
      givenName: p.preferred_name ?? p.first_name,
      familyName: p.last_name,
      dateOfBirth: p.date_of_birth,
    };
  });

  const byCanonical = new Map<string, Set<string>>();
  for (const row of nickRes.data ?? []) {
    const group = byCanonical.get(row.canonical) ?? new Set<string>();
    group.add(row.canonical);
    group.add(row.variant);
    byCanonical.set(row.canonical, group);
  }

  return {
    people,
    edges: (edgeRes.data ?? []).map((e) => ({
      from: e.from_person,
      to: e.to_person,
      type: e.type,
      marriageDate: e.marriage_date,
      divorceDate: e.divorce_date,
      isDivorced: e.is_divorced,
    })),
    resolvedKeys: new Set(
      (sugRes.data ?? []).map((r) =>
        suggestionDedupeKey(
          r.subject_person_id,
          r.related_person_id,
          r.suggested_type as SuggestedType,
          r.source as SuggestionSource,
        ),
      ),
    ),
    nicknameGroups: [...byCanonical.values()].map((g) => [...g]),
    labelById,
  };
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
 * improves the queue immediately.
 */
export async function auditTreeConnections(
  treeId: string,
): Promise<PanelSuggestion[]> {
  const tree = await loadTree(treeId);
  const candidates = auditTree({
    existingPeople: tree.people,
    existingEdges: tree.edges,
    resolvedKeys: tree.resolvedKeys,
    nicknameGroups: tree.nicknameGroups,
  });
  return candidates.flatMap((c) => toPanelSuggestion(c, tree.labelById) ?? []);
}

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
export async function countOpenConnectionSuggestions(): Promise<number> {
  const tree = await getSharedTree();
  if (!tree) return 0;
  try {
    return (await auditTreeConnections(tree.id)).length;
  } catch {
    // Advisory: a badge is never worth failing the header over.
    return 0;
  }
}
