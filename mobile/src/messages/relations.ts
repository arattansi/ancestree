import * as React from "react";

import type { ConnectionRelationship } from "@/lib/connection-path";
import { memberRelation, type MemberRelation, type RelationPerson } from "@/lib/messenger-relation";
import { personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { useMessenger } from "@/messages/store";

/**
 * Who each member in the messenger is to the reader (Step 177.1 on the
 * web, 179.1 here), by account: "Your first cousin", and the chain between
 * you. The web works it out on its server over the reader's trees; the
 * phone already holds those same people and lines (`loadFamily`, read the
 * same way and bounded by the same RLS), so it works it out here with the
 * web's own helper. Someone missing is joined to the reader by nothing
 * they can see.
 */
export function useRelations(): ReadonlyMap<string, MemberRelation> {
  const { state } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const conversations = useMessenger((s) => s.data?.conversations);
  const contacts = useMessenger((s) => s.data?.contacts);

  const graph = React.useMemo(() => {
    if (!family) return null;
    const people = new Map<string, RelationPerson>();
    for (const p of family.people.values()) {
      people.set(p.id, {
        // The name they go by, as a chain says it: "her sister Nadia".
        name:
          p.placeholder_number == null
            ? (p.preferred_name || p.first_name || personDisplayName(p)).trim()
            : personDisplayName(p),
        sex: p.sex,
      });
    }
    const relationships: ConnectionRelationship[] = family.lines.map((l) => ({
      from_person: l.from_person,
      to_person: l.to_person,
      type: l.type,
      is_divorced: l.is_divorced,
    }));
    return { selfId: family.selfId, people, relationships };
  }, [family]);

  return React.useMemo(() => {
    const found = new Map<string, MemberRelation>();
    if (!graph) return found;
    const targets = [
      ...(conversations ?? []).map((c) => [c.otherUserId, c.personId] as const),
      ...(contacts ?? []).map((c) => [c.userId, c.personId] as const),
    ];
    for (const [userId, personId] of targets) {
      if (!userId || !personId || found.has(userId)) continue;
      const relation = memberRelation(graph.selfId, personId, graph.people, graph.relationships);
      if (relation) found.set(userId, relation);
    }
    return found;
  }, [graph, conversations, contacts]);
}

/** What a line under someone's name says: who they are to you, else the tree you share. */
export function aboutLine(
  relation: MemberRelation | undefined,
  trees: readonly string[] | undefined,
): string | null {
  if (relation) return relation.label;
  return trees?.length ? `On ${trees.join(" · ")}` : null;
}
