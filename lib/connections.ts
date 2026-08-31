import type { PersonFormValues } from "@/lib/person-schema";

/**
 * How a person relates to the person they connect to. `parent` / `child` are
 * the two directions of a parent edge; `spouse` is the undirected pair.
 */
export const RELATIONSHIP_KINDS = [
  "parent",
  "child",
  "spouse",
  "sibling",
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

/** "{subject} is the {…} of {object}" for the relationship picker. */
export const KIND_STATEMENT: Record<RelationshipKind, string> = {
  parent: "is a parent of",
  child: "is a child of",
  spouse: "is the spouse / partner of",
  sibling: "is a sibling of",
};

export type PersonRef =
  | { kind: "new"; index: number }
  | { kind: "existing"; id: string };

export type ConnectionEdge = {
  type: "parent" | "spouse" | "sibling";
  a: PersonRef;
  b: PersonRef;
  /** Spouse edges only — optional marriage/divorce tracking (Step 11.5). */
  marriage_date?: string | null;
  is_divorced?: boolean;
  divorce_date?: string | null;
};

/** One resolved implied connection, as sent to the add-person server action. */
export type ResolvedSuggestionInput = {
  subject: PersonRef;
  related: PersonRef;
  suggested_type: "spouse" | "parent" | "sibling_check";
  source: "co_parent" | "unlinked_spouse_child" | "name_dob_match";
  resolution: "accepted" | "dismissed" | "pending";
};

/** Payload for the `addPeopleWithConnections` server action. */
export type AddPeopleInput = {
  people: PersonFormValues[];
  edges: ConnectionEdge[];
  selfIndex: number | null;
  suggestions?: ResolvedSuggestionInput[];
};

/**
 * Build the edges for a linear chain that runs from an existing tree member
 * through zero or more intermediate new people to the primary new person.
 *
 * `chainNodeRefs` lists the refs after the anchor, in order, ending with the
 * primary person. `kinds[i]` states how `nodes[i + 1]` relates to `nodes[i]`
 * where `nodes = [anchor, ...chainNodeRefs]` — e.g. `kinds[0] = "child"` means
 * "the first chain person is a child of the anchor".
 */
export function buildChainEdges(
  anchorId: string,
  chainNodeRefs: PersonRef[],
  kinds: RelationshipKind[],
): ConnectionEdge[] {
  const nodes: PersonRef[] = [
    { kind: "existing", id: anchorId },
    ...chainNodeRefs,
  ];
  const edges: ConnectionEdge[] = [];
  for (let i = 0; i < chainNodeRefs.length; i++) {
    const object = nodes[i];
    const subject = nodes[i + 1];
    const kind = kinds[i];
    if (kind === "spouse") {
      edges.push({ type: "spouse", a: object, b: subject });
    } else if (kind === "sibling") {
      // Undirected, like spouse; the RPC orders the pair.
      edges.push({ type: "sibling", a: object, b: subject });
    } else if (kind === "parent") {
      // subject is a parent of object
      edges.push({ type: "parent", a: subject, b: object });
    } else {
      // subject is a child of object
      edges.push({ type: "parent", a: object, b: subject });
    }
  }
  return edges;
}

export function refToString(ref: PersonRef): string {
  return ref.kind === "new" ? `new:${ref.index}` : `existing:${ref.id}`;
}
