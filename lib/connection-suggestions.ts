import { refToString, type PersonRef } from "@/lib/connections";

/**
 * Connection-suggestion detection engine (Step 11.2).
 *
 * Given the set of edges about to be created for a new/updated person,
 * `computeImpliedConnections` proposes implied connections for three approved
 * patterns. It is **pure and read-only** — it never creates a relationship and
 * never writes a suggestion row; the calling server action does that inside its
 * final transaction, after the blocking approval modal (Step 11.3).
 */

export const SUGGESTED_TYPES = ["spouse", "parent", "sibling_check"] as const;
export type SuggestedType = (typeof SUGGESTED_TYPES)[number];

export const SUGGESTION_SOURCES = [
  "co_parent",
  "unlinked_spouse_child",
  "name_dob_match",
] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

/**
 * Two same-surname people who are not otherwise connected trigger a
 * `sibling_check` only when their births fall within this many years of each
 * other (they might be siblings / close relatives entered twice).
 */
export const SIBLING_CHECK_WINDOW_YEARS = 40;

export type PendingEdge = {
  type: "parent" | "spouse" | "sibling";
  /**
   * For `parent`: `a` is a parent of `b`. For `spouse` / `sibling`: undirected
   * pair. Sibling edges only count towards "these two are already connected".
   */
  a: PersonRef;
  b: PersonRef;
};

/** New person in this submit, positioned to match `{ kind: "new", index }`. */
export type NewPersonInput = {
  familyName: string;
  dateOfBirth: string | null;
};

export type ExistingPerson = {
  id: string;
  familyName: string;
  dateOfBirth: string | null;
};

export type ExistingEdge = { from: string; to: string; type: string };

export type ImpliedConnection = {
  subject: PersonRef;
  related: PersonRef;
  suggestedType: SuggestedType;
  source: SuggestionSource;
  /** Only for `unlinked_spouse_child` — the child the parent link is about. */
  child?: PersonRef;
};

export type DetectionInput = {
  newPeople: NewPersonInput[];
  /** Base + additional + chain edges about to be created. */
  pendingEdges: PendingEdge[];
  existingPeople: ExistingPerson[];
  existingEdges: ExistingEdge[];
  /**
   * `suggestionDedupeKey()` for every `connection_suggestions` row that already
   * exists in ANY status. A candidate matching one of these is dropped — an
   * accepted or dismissed suggestion is never re-prompted.
   */
  resolvedKeys?: ReadonlySet<string>;
};

/** A pending suggestion shown inline on a person's detail panel (Step 11.3). */
export type PanelSuggestion = {
  id: string;
  subjectPersonId: string;
  relatedPersonId: string;
  suggestedType: SuggestedType;
  source: SuggestionSource;
  subjectLabel: string;
  relatedLabel: string;
};

const refKey = refToString;

function normName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function birthYear(d: string | null | undefined): number | null {
  if (!d) return null;
  const y = Number.parseInt(d.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

/** Order-independent key for a person pair (by ref string). */
function pairKey(a: string, b: string): string {
  return a <= b ? `${a}~${b}` : `${b}~${a}`;
}

/**
 * Stable dedupe key for a persisted suggestion / candidate. Mirrors the DB's
 * `UNIQUE (subject_person_id, related_person_id, suggested_type, source)` —
 * `spouse` / `sibling_check` are undirected so the ids are sorted; `parent`
 * keeps subject→related order.
 */
export function suggestionDedupeKey(
  subjectId: string,
  relatedId: string,
  suggestedType: SuggestedType,
  source: SuggestionSource,
): string {
  const [x, y] =
    suggestedType === "parent"
      ? [subjectId, relatedId]
      : [subjectId, relatedId].sort();
  return `${suggestedType}|${source}|${x}|${y}`;
}

function candidateKey(c: ImpliedConnection): string {
  return suggestionDedupeKey(
    refKey(c.subject),
    refKey(c.related),
    c.suggestedType,
    c.source,
  );
}

/** Canonically order an undirected pair so `subject` is stable. */
function orderPair(a: PersonRef, b: PersonRef): [PersonRef, PersonRef] {
  return refKey(a) <= refKey(b) ? [a, b] : [b, a];
}

export function computeImpliedConnections(
  input: DetectionInput,
): ImpliedConnection[] {
  const {
    newPeople,
    pendingEdges,
    existingPeople,
    existingEdges,
    resolvedKeys = new Set<string>(),
  } = input;

  // --- adjacency over existing + pending edges -----------------------------
  // parentKey -> Set<childKey>
  const childrenOf = new Map<string, Set<string>>();
  // childKey -> Set<parentKey>
  const parentsOf = new Map<string, Set<string>>();
  // any direct connection (any edge type, either direction)
  const connected = new Set<string>();
  // personKey -> Set<personKey> it shares any edge with
  const neighbours = new Map<string, Set<string>>();

  const addNeighbour = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a)!.add(b);
    neighbours.get(b)!.add(a);
  };

  const addParentChild = (parent: string, child: string) => {
    if (!childrenOf.has(parent)) childrenOf.set(parent, new Set());
    if (!parentsOf.has(child)) parentsOf.set(child, new Set());
    childrenOf.get(parent)!.add(child);
    parentsOf.get(child)!.add(parent);
    connected.add(pairKey(parent, child));
    addNeighbour(parent, child);
  };

  for (const e of existingEdges) {
    const from = refKey({ kind: "existing", id: e.from });
    const to = refKey({ kind: "existing", id: e.to });
    if (e.type === "parent") addParentChild(from, to);
    else {
      connected.add(pairKey(from, to));
      addNeighbour(from, to);
    }
  }
  for (const e of pendingEdges) {
    const a = refKey(e.a);
    const b = refKey(e.b);
    if (e.type === "parent") addParentChild(a, b);
    else {
      connected.add(pairKey(a, b));
      addNeighbour(a, b);
    }
  }

  const out: ImpliedConnection[] = [];
  const seen = new Set<string>();
  const push = (c: ImpliedConnection) => {
    const key = candidateKey(c);
    if (seen.has(key)) return;
    // Never re-prompt a suggestion already recorded (any status).
    if (
      c.subject.kind === "existing" &&
      c.related.kind === "existing" &&
      resolvedKeys.has(key)
    ) {
      return;
    }
    seen.add(key);
    out.push(c);
  };

  const parseRef = (key: string): PersonRef =>
    key.startsWith("new:")
      ? { kind: "new", index: Number.parseInt(key.slice(4), 10) }
      : { kind: "existing", id: key.slice("existing:".length) };

  // --- (a) co_parent: shared child, no edge between the parents ------------
  for (const parentSet of parentsOf.values()) {
    const parents = [...parentSet];
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const p = parents[i];
        const q = parents[j];
        if (connected.has(pairKey(p, q))) continue;
        const [subject, related] = orderPair(parseRef(p), parseRef(q));
        push({ subject, related, suggestedType: "spouse", source: "co_parent" });
      }
    }
  }

  // --- (b) unlinked_spouse_child: new spouse, pre-existing unlinked kids ---
  for (const e of pendingEdges) {
    if (e.type !== "spouse") continue;
    const a = refKey(e.a);
    const b = refKey(e.b);
    for (const [spouse, other] of [
      [a, b],
      [b, a],
    ] as const) {
      for (const child of childrenOf.get(spouse) ?? []) {
        if (parentsOf.get(child)?.has(other)) continue; // already linked
        const childRef = parseRef(child);
        push({
          subject: parseRef(other),
          related: childRef,
          suggestedType: "parent",
          source: "unlinked_spouse_child",
          child: childRef,
        });
      }
    }
  }

  // --- (c) name_dob_match: same surname, close age, not connected ----------
  for (let index = 0; index < newPeople.length; index += 1) {
    const np = newPeople[index];
    const fam = normName(np.familyName);
    if (!fam) continue;
    const npKey = refKey({ kind: "new", index });
    const peers = neighbours.get(npKey) ?? new Set<string>();
    const npYear = birthYear(np.dateOfBirth);

    for (const ep of existingPeople) {
      const epKey = refKey({ kind: "existing", id: ep.id });
      if (normName(ep.familyName) !== fam) continue;
      if (peers.has(epKey)) continue; // directly connected in this submit
      // Skip if already related to one of the new person's connections.
      let viaPeer = false;
      for (const peer of peers) {
        if (neighbours.get(peer)?.has(epKey)) {
          viaPeer = true;
          break;
        }
      }
      if (viaPeer) continue;

      const epYear = birthYear(ep.dateOfBirth);
      if (npYear === null || epYear === null) continue;
      if (Math.abs(npYear - epYear) > SIBLING_CHECK_WINDOW_YEARS) continue;

      const [subject, related] = orderPair(
        { kind: "new", index },
        { kind: "existing", id: ep.id },
      );
      push({
        subject,
        related,
        suggestedType: "sibling_check",
        source: "name_dob_match",
      });
    }
  }

  return out;
}
