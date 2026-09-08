import { refToString, type PersonRef } from "@/lib/connections";
import { foldName } from "@/lib/nicknames";

/**
 * Connection-suggestion engine.
 *
 * The engine reasons about the *shape* of the family graph — who is partnered
 * with whom, who already shares parents, which two entries sit in the same
 * neighbourhood — and proposes the connections that shape implies but nobody
 * has recorded. It is **pure and read-only**: it never creates a relationship
 * and never writes a suggestion row. The calling server action does that, after
 * a member says yes.
 *
 * Two entry points, one set of rules:
 *
 *   - `computeImpliedConnections` runs while a person is being added, over the
 *     edges that submit is about to create, and only reports candidates that
 *     touch what is being added.
 *   - `auditTree` runs over the whole established graph with nothing pending.
 *     This is what catches a gap left behind by an *earlier* submit — the case
 *     the old add-time-only detection could never see.
 *
 * Candidates are derived on read, every time. `connection_suggestions` is a
 * ledger of what members have already answered, not a store of open questions:
 * a candidate whose key is in `resolvedKeys` is dropped.
 */

export const SUGGESTED_TYPES = [
  "spouse",
  "parent",
  "sibling_check",
  "duplicate_check",
] as const;
export type SuggestedType = (typeof SUGGESTED_TYPES)[number];

export const SUGGESTION_SOURCES = [
  "co_parent",
  "unlinked_spouse_child",
  "sibling_implied_parent",
  "shared_neighbours",
  /**
   * Retired. Surname + birth-year proximity produced mostly noise in a tree
   * where a handful of surnames cover everyone; `shared_neighbours` replaced
   * it. The value stays in the union so the ledger rows it already wrote still
   * parse — no rule emits it any more.
   */
  "name_dob_match",
] as const;
export type SuggestionSource = (typeof SUGGESTION_SOURCES)[number];

/**
 * How much the graph backs a candidate up. `high` is a gap with a single
 * plausible reading; `medium` has a competing one worth naming in the prompt
 * (a step-parent, a half-sibling, two cousins named for the same grandparent).
 */
export type Confidence = "high" | "medium";

/** Two entries can't be the same person if their birth years differ by more. */
export const DUPLICATE_BIRTH_YEAR_TOLERANCE = 2;

export type PendingEdge = {
  type: "parent" | "spouse" | "sibling";
  /**
   * For `parent`: `a` is a parent of `b`. For `spouse` / `sibling`: undirected
   * pair. Sibling edges only count towards "these two are already connected".
   */
  a: PersonRef;
  b: PersonRef;
  marriageDate?: string | null;
  divorceDate?: string | null;
  isDivorced?: boolean;
};

/** New person in this submit, positioned to match `{ kind: "new", index }`. */
export type NewPersonInput = {
  familyName: string;
  dateOfBirth: string | null;
  givenName?: string | null;
  /** Display name, used when the engine explains itself. */
  label?: string | null;
};

export type ExistingPerson = {
  id: string;
  familyName: string;
  dateOfBirth: string | null;
  givenName?: string | null;
  label?: string | null;
};

export type ExistingEdge = {
  from: string;
  to: string;
  type: string;
  marriageDate?: string | null;
  divorceDate?: string | null;
  isDivorced?: boolean;
};

export type ImpliedConnection = {
  subject: PersonRef;
  related: PersonRef;
  suggestedType: SuggestedType;
  source: SuggestionSource;
  /** Only for `unlinked_spouse_child` — the child the parent link is about. */
  child?: PersonRef;
  /** The evidence, in words. Shown to the member instead of a rule name. */
  reason: string;
  confidence: Confidence;
  /**
   * Other rules that reached the same conclusion. Two rules can imply one
   * missing edge — a partner who isn't recorded as a parent is often also a
   * sibling's parent — and asking twice would be noise. The prompt is merged;
   * answering it records the answer against every source, so no rule re-asks.
   */
  alsoFrom: SuggestionSource[];
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
  /**
   * Sets of interchangeable given names ("Fatehali" / "Fateh" / "Fateali"), so
   * duplicate detection doesn't treat a nickname as a different person.
   */
  nicknameGroups?: readonly (readonly string[])[];
};

/** The whole-tree audit takes the same input minus anything pending. */
export type AuditInput = Omit<DetectionInput, "newPeople" | "pendingEdges">;

/** A pending suggestion shown inline on a person's detail panel. */
export type PanelSuggestion = {
  id: string;
  subjectPersonId: string;
  relatedPersonId: string;
  suggestedType: SuggestedType;
  source: SuggestionSource;
  subjectLabel: string;
  relatedLabel: string;
  reason: string;
  confidence: Confidence;
  alsoFrom: SuggestionSource[];
  /** Only for `unlinked_spouse_child`. */
  childPersonId?: string;
};

const refKey = refToString;

/** Same folding the nickname table uses, so both sides compare alike. */
function normName(s: string | null | undefined): string {
  return foldName((s ?? "").trim());
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
 * undirected types sort their ids, `parent` keeps subject→related order.
 *
 * Takes **bare person ids**, the same values the DB column holds.
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

/** Canonically order an undirected pair so `subject` is stable. */
function orderPair(a: PersonRef, b: PersonRef): [PersonRef, PersonRef] {
  return refKey(a) <= refKey(b) ? [a, b] : [b, a];
}

/** The person id behind a ref, or null for someone who doesn't exist yet. */
function personId(ref: PersonRef): string | null {
  return ref.kind === "existing" ? ref.id : null;
}

function parseRef(key: string): PersonRef {
  return key.startsWith("new:")
    ? { kind: "new", index: Number.parseInt(key.slice(4), 10) }
    : { kind: "existing", id: key.slice("existing:".length) };
}

/** How one person stands towards another — the roles a duplicate would share. */
type Role = "parent-of" | "child-of" | "partner-of";

type SpouseMeta = {
  marriageDate?: string | null;
  divorceDate?: string | null;
  isDivorced?: boolean;
};

type Graph = {
  /** parentKey -> children */
  childrenOf: Map<string, Set<string>>;
  /** childKey -> parents */
  parentsOf: Map<string, Set<string>>;
  spousesOf: Map<string, Set<string>>;
  /** Explicit `sibling` rows only — never siblings inferred from shared parents. */
  siblingsOf: Map<string, Set<string>>;
  /** Any direct edge, either direction, any type. */
  connected: Set<string>;
  /** `role:otherKey` strings, for duplicate detection. */
  roles: Map<string, Set<string>>;
  spouseMeta: Map<string, SpouseMeta>;
  /** Every node named by an edge. */
  nodes: Set<string>;
};

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function buildGraph(
  existingEdges: readonly ExistingEdge[],
  pendingEdges: readonly PendingEdge[],
): Graph {
  const g: Graph = {
    childrenOf: new Map(),
    parentsOf: new Map(),
    spousesOf: new Map(),
    siblingsOf: new Map(),
    connected: new Set(),
    roles: new Map(),
    spouseMeta: new Map(),
    nodes: new Set(),
  };

  const note = (a: string, b: string) => {
    g.nodes.add(a);
    g.nodes.add(b);
    g.connected.add(pairKey(a, b));
  };
  const role = (from: string, r: Role, to: string) =>
    addTo(g.roles, from, `${r}:${to}`);

  const add = (
    type: string,
    a: string,
    b: string,
    meta: SpouseMeta | undefined,
  ) => {
    if (a === b) return;
    note(a, b);
    if (type === "parent") {
      addTo(g.childrenOf, a, b);
      addTo(g.parentsOf, b, a);
      role(a, "parent-of", b);
      role(b, "child-of", a);
      return;
    }
    if (type === "spouse") {
      addTo(g.spousesOf, a, b);
      addTo(g.spousesOf, b, a);
      role(a, "partner-of", b);
      role(b, "partner-of", a);
      if (meta) g.spouseMeta.set(pairKey(a, b), meta);
      return;
    }
    if (type === "sibling") {
      addTo(g.siblingsOf, a, b);
      addTo(g.siblingsOf, b, a);
    }
  };

  for (const e of existingEdges) {
    add(
      e.type,
      refKey({ kind: "existing", id: e.from }),
      refKey({ kind: "existing", id: e.to }),
      {
        marriageDate: e.marriageDate,
        divorceDate: e.divorceDate,
        isDivorced: e.isDivorced,
      },
    );
  }
  for (const e of pendingEdges) {
    add(e.type, refKey(e.a), refKey(e.b), {
      marriageDate: e.marriageDate,
      divorceDate: e.divorceDate,
      isDivorced: e.isDivorced,
    });
  }

  return g;
}

/** Everything the rules need to know about the people themselves. */
type PeopleIndex = {
  label: (key: string) => string;
  familyName: (key: string) => string;
  givenName: (key: string) => string;
  birth: (key: string) => string | null;
  /** Every key the rules may consider, existing and pending alike. */
  keys: string[];
};

function indexPeople(
  existingPeople: readonly ExistingPerson[],
  newPeople: readonly NewPersonInput[],
): PeopleIndex {
  type Entry = {
    label: string;
    familyName: string;
    givenName: string;
    birth: string | null;
  };
  const byKey = new Map<string, Entry>();

  const put = (key: string, p: ExistingPerson | NewPersonInput) => {
    const given = (p.givenName ?? "").trim();
    const family = (p.familyName ?? "").trim();
    byKey.set(key, {
      label: (p.label ?? "").trim() || [given, family].filter(Boolean).join(" "),
      familyName: family,
      givenName: given,
      birth: p.dateOfBirth,
    });
  };

  for (const p of existingPeople) put(refKey({ kind: "existing", id: p.id }), p);
  newPeople.forEach((p, index) => put(refKey({ kind: "new", index }), p));

  return {
    label: (key) => byKey.get(key)?.label || "this person",
    familyName: (key) => byKey.get(key)?.familyName ?? "",
    givenName: (key) => byKey.get(key)?.givenName ?? "",
    birth: (key) => byKey.get(key)?.birth ?? null,
    keys: [...byKey.keys()],
  };
}

/**
 * Two given names that could belong to the same person: identical, one a
 * prefix of the other ("Fateh" / "Fatehali"), or listed together as nicknames.
 */
function givenNamesCompatible(
  a: string,
  b: string,
  nicknames: ReadonlyMap<string, number>,
): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const groupX = nicknames.get(x);
  if (groupX !== undefined && groupX === nicknames.get(y)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.startsWith(short);
}

function buildNicknameLookup(
  groups: readonly (readonly string[])[] | undefined,
): Map<string, number> {
  const lookup = new Map<string, number>();
  groups?.forEach((group, i) => {
    for (const name of group) {
      const n = normName(name);
      if (n) lookup.set(n, i);
    }
  });
  return lookup;
}

/** `null` when either date is missing — an unknown date contradicts nothing. */
function yearsApart(a: string | null, b: string | null): number | null {
  const ya = birthYear(a);
  const yb = birthYear(b);
  if (ya === null || yb === null) return null;
  return Math.abs(ya - yb);
}

/** A rule states its finding; `run` handles merging, scoping and the ledger. */
type Finding = Omit<ImpliedConnection, "alsoFrom">;

type RuleContext = {
  graph: Graph;
  people: PeopleIndex;
  nicknames: Map<string, number>;
  emit: (c: Finding) => void;
};

/**
 * Rule 0 — two people who share a child but have no edge between them are
 * probably partners. Unchanged in substance from the original engine; it now
 * runs over the established graph as well as over a pending submit.
 */
function ruleCoParent({ graph, people, emit }: RuleContext) {
  for (const [child, parentSet] of graph.parentsOf) {
    const parents = [...parentSet];
    for (let i = 0; i < parents.length; i += 1) {
      for (let j = i + 1; j < parents.length; j += 1) {
        const p = parents[i];
        const q = parents[j];
        if (graph.connected.has(pairKey(p, q))) continue;
        const [subject, related] = orderPair(parseRef(p), parseRef(q));
        emit({
          subject,
          related,
          suggestedType: "spouse",
          source: "co_parent",
          confidence: "high",
          reason:
            `${people.label(p)} and ${people.label(q)} are both parents of ` +
            `${people.label(child)}, but they aren't connected to each other.`,
        });
      }
    }
  }
}

/**
 * Rule 1 — the missing co-parent. X and Y are partners, X is a parent of C,
 * and Y isn't recorded as one. The commonest gap in the tree by far: adding a
 * child links it to one parent, and nothing ever links the other.
 *
 * The competing reading is a step-child, so: a child who already has two
 * parents is left alone entirely, and a child born outside the marriage window
 * is proposed at `medium` with the dates named rather than silently dropped.
 */
function ruleMissingCoParent({ graph, people, emit }: RuleContext) {
  for (const [spouse, partners] of graph.spousesOf) {
    for (const partner of partners) {
      for (const child of graph.childrenOf.get(spouse) ?? []) {
        const parents = graph.parentsOf.get(child) ?? new Set<string>();
        if (parents.has(partner)) continue;
        // Both slots already filled — the other parent is someone else, and
        // this partner is a step-parent, not a missing link.
        if (parents.size >= 2) continue;
        if (child === partner) continue;

        const meta = graph.spouseMeta.get(pairKey(spouse, partner));
        const born = people.birth(child);
        const bornYear = birthYear(born);
        const marriedYear = birthYear(meta?.marriageDate ?? null);
        const divorcedYear = meta?.isDivorced
          ? birthYear(meta?.divorceDate ?? null)
          : null;

        let confidence: Confidence = "high";
        let caveat = "";
        if (bornYear !== null && marriedYear !== null && bornYear < marriedYear) {
          confidence = "medium";
          caveat = ` Note that ${people.label(child)} was born in ${bornYear}, before the ${marriedYear} marriage.`;
        } else if (
          bornYear !== null &&
          divorcedYear !== null &&
          bornYear > divorcedYear
        ) {
          confidence = "medium";
          caveat = ` Note that ${people.label(child)} was born in ${bornYear}, after the ${divorcedYear} divorce.`;
        }

        emit({
          subject: parseRef(partner),
          related: parseRef(child),
          child: parseRef(child),
          suggestedType: "parent",
          source: "unlinked_spouse_child",
          confidence,
          reason:
            `${people.label(partner)} is ${people.label(spouse)}'s partner, and ` +
            `${people.label(spouse)} is a parent of ${people.label(child)} — but ` +
            `${people.label(partner)} isn't recorded as a parent.${caveat}`,
        });
      }
    }
  }
}

/**
 * Rule 2 — parents implied by a sibling edge. A is recorded as B's sibling and
 * B has parents A is missing. Only explicit `sibling` rows count: siblings the
 * canvas derives from shared parents would, by definition, propose the parents
 * they were derived from.
 */
function ruleSiblingImpliedParents({ graph, people, emit }: RuleContext) {
  for (const [person, siblings] of graph.siblingsOf) {
    const own = graph.parentsOf.get(person) ?? new Set<string>();
    for (const sibling of siblings) {
      for (const parent of graph.parentsOf.get(sibling) ?? []) {
        if (own.has(parent) || parent === person) continue;
        emit({
          subject: parseRef(parent),
          related: parseRef(person),
          child: parseRef(person),
          suggestedType: "parent",
          source: "sibling_implied_parent",
          // One parent already recorded leaves half-siblings on the table.
          confidence: own.size === 0 ? "high" : "medium",
          reason:
            `${people.label(person)} is recorded as a sibling of ` +
            `${people.label(sibling)}, whose parent is ${people.label(parent)}` +
            (own.size === 0
              ? `, but ${people.label(person)} has no parents recorded.`
              : `. They may be half-siblings, or this parent may be missing.`),
        });
      }
    }
  }
}

/**
 * Rule 3 — the same person, entered twice. Replaces the old surname + birth-year
 * rule, which in a tree built from three surnames matched nearly everyone.
 *
 * Evidence has to be structural *and* nominal: two entries must occupy the same
 * role towards the same people (both a parent of C, both a child of P, both a
 * partner of S) *and* carry names that could be one person's. Requiring the
 * name is what keeps a couple — two parents of the same two children — from
 * reading as one duplicated person.
 */
function ruleStructuralDuplicates({
  graph,
  people,
  nicknames,
  emit,
}: RuleContext) {
  const checked = new Set<string>();

  // role-and-target -> everyone who holds it, so candidates are found by
  // walking shared roles rather than comparing every pair of people.
  const holders = new Map<string, string[]>();
  for (const [person, roles] of graph.roles) {
    for (const role of roles) {
      const list = holders.get(role);
      if (list) list.push(person);
      else holders.set(role, [person]);
    }
  }

  for (const [person, roles] of graph.roles) {
    const rivals = new Map<string, number>();
    for (const role of roles) {
      for (const other of holders.get(role) ?? []) {
        if (other === person) continue;
        rivals.set(other, (rivals.get(other) ?? 0) + 1);
      }
    }

    for (const [other, shared] of rivals) {
      const key = pairKey(person, other);
      if (checked.has(key)) continue;
      checked.add(key);
      // Directly connected people are related, not duplicated.
      if (graph.connected.has(key)) continue;

      const familyA = normName(people.familyName(person));
      const familyB = normName(people.familyName(other));
      if (!familyA || familyA !== familyB) continue;
      if (
        !givenNamesCompatible(
          people.givenName(person),
          people.givenName(other),
          nicknames,
        )
      ) {
        continue;
      }
      const apart = yearsApart(people.birth(person), people.birth(other));
      if (apart !== null && apart > DUPLICATE_BIRTH_YEAR_TOLERANCE) continue;

      const [subject, related] = orderPair(parseRef(person), parseRef(other));
      const overlap =
        shared === 1
          ? "share a close relative"
          : `share ${shared} close relatives`;
      emit({
        subject,
        related,
        suggestedType: "duplicate_check",
        source: "shared_neighbours",
        confidence: shared >= 2 ? "high" : "medium",
        reason:
          `${people.label(person)} and ${people.label(other)} have similar names, ` +
          `${overlap} in the same way, and aren't connected to each other — ` +
          `they may be the same person entered twice.`,
      });
    }
  }
}

const RULES = [
  ruleCoParent,
  ruleMissingCoParent,
  ruleSiblingImpliedParents,
  ruleStructuralDuplicates,
];

function run(
  input: {
    newPeople: readonly NewPersonInput[];
    pendingEdges: readonly PendingEdge[];
    existingPeople: readonly ExistingPerson[];
    existingEdges: readonly ExistingEdge[];
    resolvedKeys?: ReadonlySet<string>;
    nicknameGroups?: readonly (readonly string[])[];
  },
  /** Add-time only: keys the submit touches, to keep the modal on-topic. */
  scope: Set<string> | null,
): ImpliedConnection[] {
  const graph = buildGraph(input.existingEdges, input.pendingEdges);
  const people = indexPeople(input.existingPeople, input.newPeople);
  const nicknames = buildNicknameLookup(input.nicknameGroups);
  const resolvedKeys = input.resolvedKeys ?? new Set<string>();

  // Keyed by the edge a finding proposes, so two rules that reach the same
  // conclusion merge into one prompt instead of asking twice.
  const merged = new Map<string, ImpliedConnection>();

  const emit = (c: Finding) => {
    const subjectKey = refKey(c.subject);
    const relatedKey = refKey(c.related);
    if (scope && !scope.has(subjectKey) && !scope.has(relatedKey)) return;

    // Never re-prompt something a member has already answered. Only pairs that
    // both exist can be in the ledger; a person who isn't saved yet has no id.
    const subjectId = personId(c.subject);
    const relatedId = personId(c.related);
    if (subjectId && relatedId) {
      const key = suggestionDedupeKey(
        subjectId,
        relatedId,
        c.suggestedType,
        c.source,
      );
      if (resolvedKeys.has(key)) return;
    }

    const edgeKey = `${c.suggestedType}|${
      c.suggestedType === "parent"
        ? `${subjectKey}|${relatedKey}`
        : [subjectKey, relatedKey].sort().join("|")
    }`;
    const existing = merged.get(edgeKey);
    if (!existing) {
      merged.set(edgeKey, { ...c, alsoFrom: [] });
      return;
    }
    if (existing.source === c.source || existing.alsoFrom.includes(c.source)) {
      return;
    }
    // Keep the better-evidenced wording; carry the other rule's source so
    // answering settles both.
    if (existing.confidence === "medium" && c.confidence === "high") {
      merged.set(edgeKey, {
        ...c,
        alsoFrom: [...existing.alsoFrom, existing.source],
      });
    } else {
      existing.alsoFrom.push(c.source);
    }
  };

  const ctx: RuleContext = { graph, people, nicknames, emit };
  for (const rule of RULES) rule(ctx);

  // Strongest evidence first — the review queue reads top-down.
  return [...merged.values()].sort((a, b) =>
    a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1,
  );
}

/**
 * Add-time detection: the same rules, but reported only when the candidate
 * touches someone this submit is adding or connecting. Gaps elsewhere in the
 * tree belong in the review queue, not in a modal that blocks an add.
 */
export function computeImpliedConnections(
  input: DetectionInput,
): ImpliedConnection[] {
  const scope = new Set<string>();
  input.newPeople.forEach((_, index) =>
    scope.add(refKey({ kind: "new", index })),
  );
  for (const e of input.pendingEdges) {
    scope.add(refKey(e.a));
    scope.add(refKey(e.b));
  }
  return run(input, scope);
}

/**
 * Whole-tree audit: every gap the established graph implies, with nothing
 * pending. This is what the review queue lists and what the person panel
 * filters down to one person.
 */
export function auditTree(input: AuditInput): ImpliedConnection[] {
  return run({ ...input, newPeople: [], pendingEdges: [] }, null);
}
