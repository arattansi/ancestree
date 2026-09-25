import type { PersonFormValues } from "@/lib/person-schema";
// Type-only, so this doesn't create an import cycle with the engine.
import type {
  SuggestedType,
  SuggestionSource,
} from "@/lib/connection-suggestions";

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

/**
 * The relationship picker's words, both in its list and on its closed button.
 * The names sit either side of the picker already, so it says only the verb:
 * "{subject} [is child of] {object}". Pass it as the `Select`'s `items`, or
 * the closed button shows the bare key.
 */
export const KIND_STATEMENT: Record<RelationshipKind, string> = {
  parent: "is parent of",
  child: "is child of",
  spouse: "is spouse / partner of",
  sibling: "is sibling of",
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
  suggested_type: SuggestedType;
  source: SuggestionSource;
  resolution: "accepted" | "dismissed" | "pending";
};

/** Payload for the `addPeopleWithConnections` server action. */
export type AddPeopleInput = {
  /** The tree the people are added to and the lines drawn on (Step 25). */
  treeId: string;
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

/** A partner offered as the second parent on a new parent edge. */
export type PartnerOption = { id: string; label: string; isDivorced: boolean };

/**
 * Which of a parent's partners to record as the child's other parent.
 *
 * `connect_people` writes one edge, so every path that creates a parent link
 * records exactly one parent unless something offers the rest — which is how
 * children end up hanging off one half of a couple. The offer therefore stands
 * at "every current partner" until the member says otherwise; a former partner
 * is listed but never pre-ticked, since a child of a past marriage is a real
 * possibility rather than an oversight.
 *
 * `chosen` is `null` while the member hasn't touched the checkboxes. Ids that
 * no longer name a partner are dropped, so a stale selection can't write an
 * edge nobody asked for.
 */
export function coParentSelection(
  chosen: readonly string[] | null | undefined,
  partners: readonly PartnerOption[],
): string[] {
  const picked = chosen ?? partners.filter((p) => !p.isDivorced).map((p) => p.id);
  return picked.filter((id) => partners.some((p) => p.id === id));
}

/** One link in the add flow's chain, as its form holds it. */
export type FlowLink = {
  kind: RelationshipKind;
  /** Sibling links only — also connect to the anchor's parents. */
  linkToParents?: boolean;
  /** Child links only — the anchor's partners to record as a parent too. */
  coParentIds?: readonly string[] | null;
};

/** One of the add flow's further connections from the new person. */
export type FlowExtraLink = {
  targetId: string;
  kind: RelationshipKind;
  /** Child links only — the target's partners to record as a parent too. */
  coParentIds?: readonly string[] | null;
};

/** Someone already on the tree, as the add flow knows them. */
export type FlowMember = {
  id: string;
  parents?: readonly { id: string }[];
  partners?: readonly PartnerOption[];
};

type SpouseFields = Pick<
  ConnectionEdge,
  "marriage_date" | "is_divorced" | "divorce_date"
>;

/**
 * Every line one submit of the add flow draws, before any implied connection
 * is asked about: the chain from the anchor through anyone in between to the
 * new person, the anchor's parents for a new sibling who asked for them, the
 * partners left ticked on a "child of" link, and each further connection with
 * its own ticked partners. `anchorId` is empty when the entry isn't chained to
 * anyone. Both the submit and the blood-tie warning (Step 55) read it, so the
 * warning judges exactly what would be sent.
 */
export function flowEdges<L extends FlowLink, X extends FlowExtraLink>({
  anchorId,
  inBetween,
  links,
  extraLinks,
  members,
  spouseFields = () => ({}),
}: {
  anchorId: string;
  /** How many people the chain runs through before the new one. */
  inBetween: number;
  links: readonly L[];
  extraLinks: readonly X[];
  members: readonly FlowMember[];
  /** A spouse line's marriage and divorce, from the link that asks for it. */
  spouseFields?: (link: L | X) => SpouseFields;
}): ConnectionEdge[] {
  const primary: PersonRef = { kind: "new", index: 0 };
  const edges: ConnectionEdge[] = [];

  if (anchorId) {
    // nodes = [anchor, in-between 1 … in-between k, primary]
    const chain: PersonRef[] = [];
    for (let i = 1; i <= inBetween; i += 1) {
      chain.push({ kind: "new", index: i });
    }
    chain.push(primary);
    // One edge per link, in order: each spouse edge takes its link's dates.
    buildChainEdges(anchorId, chain, links.map((l) => l.kind)).forEach((e, i) =>
      edges.push(e.type === "spouse" ? { ...e, ...spouseFields(links[i]) } : e),
    );

    const first = links[0];
    const anchor = members.find((m) => m.id === anchorId);
    // "is a sibling of" the anchor + "also link to their parents": a parent
    // edge from each of the anchor's parents, so the two sit side by side.
    if (first?.kind === "sibling" && first.linkToParents) {
      for (const parent of anchor?.parents ?? []) {
        edges.push({
          type: "parent",
          a: { kind: "existing", id: parent.id },
          b: chain[0],
        });
      }
    }
    // "is a child of" the anchor: the partners left ticked are parents too.
    if (first?.kind === "child") {
      for (const id of coParentSelection(
        first.coParentIds,
        anchor?.partners ?? [],
      )) {
        edges.push({
          type: "parent",
          a: { kind: "existing", id },
          b: chain[0],
        });
      }
    }
  }

  for (const row of extraLinks) {
    if (!row.targetId) continue;
    const [edge] = buildChainEdges(row.targetId, [primary], [row.kind]);
    edges.push(
      edge.type === "spouse" ? { ...edge, ...spouseFields(row) } : edge,
    );
    // "is a child of" this target: their ticked partners become parents too.
    if (row.kind === "child") {
      const target = members.find((m) => m.id === row.targetId);
      for (const id of coParentSelection(
        row.coParentIds,
        target?.partners ?? [],
      )) {
        edges.push({ type: "parent", a: { kind: "existing", id }, b: primary });
      }
    }
  }
  return edges;
}

export function refToString(ref: PersonRef): string {
  return ref.kind === "new" ? `new:${ref.index}` : `existing:${ref.id}`;
}
