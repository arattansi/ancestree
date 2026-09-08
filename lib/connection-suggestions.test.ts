import { describe, expect, it } from "vitest";

import {
  auditTree,
  computeImpliedConnections,
  suggestionDedupeKey,
  type AuditInput,
  type DetectionInput,
} from "@/lib/connection-suggestions";

const base: DetectionInput = {
  newPeople: [],
  pendingEdges: [],
  existingPeople: [],
  existingEdges: [],
};

const auditBase: AuditInput = { existingPeople: [], existingEdges: [] };

/** Readable ids in assertions. */
const ids = (refs: Array<{ kind: string } & Record<string, unknown>>) =>
  refs.map((r) => (r.kind === "existing" ? r.id : `new:${r.index}`));

describe("computeImpliedConnections (add time)", () => {
  it("co_parent: two parents of a shared child with no edge between them", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "mom", familyName: "Lee", dateOfBirth: "1960-01-01" },
        { id: "kid", familyName: "Lee", dateOfBirth: "1990-01-01" },
      ],
      existingEdges: [{ from: "mom", to: "kid", type: "parent" }],
      // A new person is being added as a second parent of the same child.
      newPeople: [{ familyName: "Lee", dateOfBirth: "1958-01-01" }],
      pendingEdges: [
        {
          type: "parent",
          a: { kind: "new", index: 0 },
          b: { kind: "existing", id: "kid" },
        },
      ],
    });
    const coParent = out.filter((c) => c.source === "co_parent");
    expect(coParent).toHaveLength(1);
    expect(coParent[0].suggestedType).toBe("spouse");
    expect(ids([coParent[0].subject, coParent[0].related])).toEqual(
      expect.arrayContaining(["mom", "new:0"]),
    );
  });

  it("co_parent: does not fire when the two parents are already spouses", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "mom", familyName: "Lee", dateOfBirth: "1960-01-01" },
        { id: "dad", familyName: "Lee", dateOfBirth: "1958-01-01" },
        { id: "kid", familyName: "Lee", dateOfBirth: "1990-01-01" },
      ],
      existingEdges: [
        { from: "mom", to: "kid", type: "parent" },
        { from: "dad", to: "kid", type: "parent" },
        { from: "mom", to: "dad", type: "spouse" },
      ],
      pendingEdges: [
        {
          type: "parent",
          a: { kind: "existing", id: "mom" },
          b: { kind: "existing", id: "kid" },
        },
      ],
    });
    expect(out.filter((c) => c.source === "co_parent")).toHaveLength(0);
  });

  it("unlinked_spouse_child: one suggestion per unlinked child of the other spouse", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "dad", familyName: "Kim", dateOfBirth: "1955-01-01" },
        { id: "c1", familyName: "Kim", dateOfBirth: "1980-01-01" },
        { id: "c2", familyName: "Kim", dateOfBirth: "1983-01-01" },
        { id: "step", familyName: "Park", dateOfBirth: "1958-01-01" },
      ],
      existingEdges: [
        { from: "dad", to: "c1", type: "parent" },
        { from: "dad", to: "c2", type: "parent" },
      ],
      pendingEdges: [
        {
          type: "spouse",
          a: { kind: "existing", id: "dad" },
          b: { kind: "existing", id: "step" },
        },
      ],
    });
    const parentSug = out.filter((c) => c.source === "unlinked_spouse_child");
    expect(parentSug).toHaveLength(2);
    for (const s of parentSug) {
      expect(s.suggestedType).toBe("parent");
      expect(s.subject).toEqual({ kind: "existing", id: "step" });
      expect(s.child).toBeDefined();
    }
  });

  it("unlinked_spouse_child: skips a child already linked to the other spouse", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "dad", familyName: "Kim", dateOfBirth: "1955-01-01" },
        { id: "mom", familyName: "Kim", dateOfBirth: "1957-01-01" },
        { id: "c1", familyName: "Kim", dateOfBirth: "1980-01-01" },
      ],
      existingEdges: [
        { from: "dad", to: "c1", type: "parent" },
        { from: "mom", to: "c1", type: "parent" },
      ],
      pendingEdges: [
        {
          type: "spouse",
          a: { kind: "existing", id: "dad" },
          b: { kind: "existing", id: "mom" },
        },
      ],
    });
    expect(out.filter((c) => c.source === "unlinked_spouse_child")).toHaveLength(
      0,
    );
  });

  it("asks about the partner when a child is added to one half of a couple", () => {
    // The backstop for every path that doesn't offer the co-parent inline.
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "f", familyName: "Suleman", givenName: "Fatehali", dateOfBirth: null },
        { id: "r", familyName: "Suleman", givenName: "Roshen", dateOfBirth: null },
      ],
      existingEdges: [{ from: "f", to: "r", type: "spouse" }],
      newPeople: [
        {
          familyName: "Suleman",
          givenName: "Adil",
          label: "Adil Suleman",
          dateOfBirth: null,
        },
      ],
      pendingEdges: [
        {
          type: "parent",
          a: { kind: "existing", id: "f" },
          b: { kind: "new", index: 0 },
        },
      ],
    }).filter((c) => c.source === "unlinked_spouse_child");

    expect(out).toHaveLength(1);
    expect(out[0].subject).toEqual({ kind: "existing", id: "r" });
    expect(out[0].related).toEqual({ kind: "new", index: 0 });
    expect(out[0].reason).toContain("Adil Suleman");
  });

  it("stops asking once the co-parent edge is part of the same submit", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "f", familyName: "Suleman", givenName: "Fatehali", dateOfBirth: null },
        { id: "r", familyName: "Suleman", givenName: "Roshen", dateOfBirth: null },
      ],
      existingEdges: [{ from: "f", to: "r", type: "spouse" }],
      newPeople: [{ familyName: "Suleman", dateOfBirth: null }],
      pendingEdges: [
        {
          type: "parent",
          a: { kind: "existing", id: "f" },
          b: { kind: "new", index: 0 },
        },
        // What ticking the co-parent box now adds.
        {
          type: "parent",
          a: { kind: "existing", id: "r" },
          b: { kind: "new", index: 0 },
        },
      ],
    });
    expect(out.filter((c) => c.source === "unlinked_spouse_child")).toHaveLength(
      0,
    );
  });

  it("keeps the modal on topic: a gap elsewhere in the tree is not reported", () => {
    const shared = {
      existingPeople: [
        { id: "f", familyName: "Suleman", givenName: "Fatehali" },
        { id: "r", familyName: "Suleman", givenName: "Roshen" },
        { id: "adil", familyName: "Suleman", givenName: "Adil" },
        { id: "stranger", familyName: "Other", givenName: "Sam" },
      ].map((p) => ({ ...p, dateOfBirth: null })),
      existingEdges: [
        { from: "f", to: "adil", type: "parent" },
        { from: "f", to: "r", type: "spouse" },
      ],
    };
    // The audit sees the Roshen -> Adil gap...
    expect(
      auditTree({ ...auditBase, ...shared }).filter(
        (c) => c.source === "unlinked_spouse_child",
      ),
    ).toHaveLength(1);
    // ...but adding an unrelated person doesn't drag it into the modal.
    const out = computeImpliedConnections({
      ...base,
      ...shared,
      newPeople: [{ familyName: "Other", dateOfBirth: null }],
      pendingEdges: [
        {
          type: "spouse",
          a: { kind: "existing", id: "stranger" },
          b: { kind: "new", index: 0 },
        },
      ],
    });
    expect(out.filter((c) => c.source === "unlinked_spouse_child")).toHaveLength(
      0,
    );
  });
});

describe("auditTree — missing co-parent", () => {
  const family: AuditInput = {
    existingPeople: [
      { id: "f", familyName: "Suleman", givenName: "Fatehali" },
      { id: "r", familyName: "Suleman", givenName: "Roshen" },
      { id: "adil", familyName: "Suleman", givenName: "Adil" },
    ].map((p) => ({ ...p, dateOfBirth: null })),
    existingEdges: [
      { from: "f", to: "adil", type: "parent" },
      { from: "f", to: "r", type: "spouse" },
    ],
  };

  it("fires from established edges alone — the gap add-time detection missed", () => {
    const out = auditTree(family).filter(
      (c) => c.source === "unlinked_spouse_child",
    );
    expect(out).toHaveLength(1);
    expect(out[0].suggestedType).toBe("parent");
    expect(out[0].subject).toEqual({ kind: "existing", id: "r" });
    expect(out[0].related).toEqual({ kind: "existing", id: "adil" });
    expect(out[0].confidence).toBe("high");
    expect(out[0].reason).toContain("Roshen");
    expect(out[0].reason).toContain("Adil");
  });

  it("leaves a child alone once both parents are recorded", () => {
    const out = auditTree({
      ...family,
      existingEdges: [...family.existingEdges, { from: "r", to: "adil", type: "parent" }],
    });
    expect(out.filter((c) => c.source === "unlinked_spouse_child")).toHaveLength(
      0,
    );
  });

  it("never proposes a step-parent over a child who already has two parents", () => {
    const out = auditTree({
      existingPeople: [
        { id: "dad", familyName: "Kim", givenName: "Jae", dateOfBirth: null },
        { id: "ex", familyName: "Kim", givenName: "Mina", dateOfBirth: null },
        { id: "step", familyName: "Park", givenName: "Sun", dateOfBirth: null },
        { id: "kid", familyName: "Kim", givenName: "Ji", dateOfBirth: null },
      ],
      existingEdges: [
        { from: "dad", to: "kid", type: "parent" },
        { from: "ex", to: "kid", type: "parent" },
        { from: "dad", to: "step", type: "spouse" },
      ],
    });
    expect(out.filter((c) => c.source === "unlinked_spouse_child")).toHaveLength(
      0,
    );
  });

  it("drops to medium, with the dates named, when the birth predates the marriage", () => {
    const out = auditTree({
      existingPeople: [
        { id: "dad", familyName: "Kim", givenName: "Jae", dateOfBirth: null },
        { id: "wife", familyName: "Kim", givenName: "Sun", dateOfBirth: null },
        {
          id: "kid",
          familyName: "Kim",
          givenName: "Ji",
          dateOfBirth: "1978-04-02",
        },
      ],
      existingEdges: [
        { from: "dad", to: "kid", type: "parent" },
        {
          from: "dad",
          to: "wife",
          type: "spouse",
          marriageDate: "1990-06-01",
        },
      ],
    }).filter((c) => c.source === "unlinked_spouse_child");
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("medium");
    expect(out[0].reason).toContain("1978");
    expect(out[0].reason).toContain("1990");
  });

  it("drops to medium when the birth follows the divorce", () => {
    const out = auditTree({
      existingPeople: [
        { id: "dad", familyName: "Kim", givenName: "Jae", dateOfBirth: null },
        { id: "ex", familyName: "Kim", givenName: "Sun", dateOfBirth: null },
        {
          id: "kid",
          familyName: "Kim",
          givenName: "Ji",
          dateOfBirth: "2001-01-01",
        },
      ],
      existingEdges: [
        { from: "dad", to: "kid", type: "parent" },
        {
          from: "dad",
          to: "ex",
          type: "spouse",
          marriageDate: "1980-01-01",
          divorceDate: "1995-01-01",
          isDivorced: true,
        },
      ],
    }).filter((c) => c.source === "unlinked_spouse_child");
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("medium");
    expect(out[0].reason).toContain("1995");
  });
});

describe("auditTree — sibling-implied parents", () => {
  it("proposes a sibling's parents at high confidence when none are recorded", () => {
    const out = auditTree({
      existingPeople: [
        { id: "p", familyName: "Nur", givenName: "Amir", dateOfBirth: null },
        { id: "a", familyName: "Nur", givenName: "Zara", dateOfBirth: null },
        { id: "b", familyName: "Nur", givenName: "Yusuf", dateOfBirth: null },
      ],
      existingEdges: [
        { from: "p", to: "b", type: "parent" },
        { from: "a", to: "b", type: "sibling" },
      ],
    }).filter((c) => c.source === "sibling_implied_parent");
    expect(out).toHaveLength(1);
    expect(out[0].suggestedType).toBe("parent");
    expect(out[0].subject).toEqual({ kind: "existing", id: "p" });
    expect(out[0].related).toEqual({ kind: "existing", id: "a" });
    expect(out[0].confidence).toBe("high");
  });

  it("drops to medium when the person already has one parent (half-siblings)", () => {
    const out = auditTree({
      existingPeople: [
        { id: "p1", familyName: "Nur", givenName: "Amir", dateOfBirth: null },
        { id: "p2", familyName: "Nur", givenName: "Leila", dateOfBirth: null },
        { id: "a", familyName: "Nur", givenName: "Zara", dateOfBirth: null },
        { id: "b", familyName: "Nur", givenName: "Yusuf", dateOfBirth: null },
      ],
      existingEdges: [
        { from: "p1", to: "b", type: "parent" },
        { from: "p2", to: "a", type: "parent" },
        { from: "a", to: "b", type: "sibling" },
      ],
    }).filter((c) => c.source === "sibling_implied_parent");
    // Symmetric: each sibling is missing the other's parent.
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.confidence)).toEqual(["medium", "medium"]);
    expect(out.every((c) => c.reason.includes("half-siblings"))).toBe(true);
    expect(ids(out.map((c) => c.subject))).toEqual(
      expect.arrayContaining(["p1", "p2"]),
    );
  });

  it("does not fire for siblings derived from a shared parent", () => {
    const out = auditTree({
      existingPeople: [
        { id: "p", familyName: "Nur", givenName: "Amir", dateOfBirth: null },
        { id: "a", familyName: "Nur", givenName: "Zara", dateOfBirth: null },
        { id: "b", familyName: "Nur", givenName: "Yusuf", dateOfBirth: null },
      ],
      // No explicit sibling row: a and b are siblings only by shared parent.
      existingEdges: [
        { from: "p", to: "a", type: "parent" },
        { from: "p", to: "b", type: "parent" },
      ],
    });
    expect(out.filter((c) => c.source === "sibling_implied_parent")).toHaveLength(
      0,
    );
  });
});

describe("auditTree — structural duplicates", () => {
  const twiceEntered: AuditInput = {
    existingPeople: [
      { id: "a1", familyName: "Suleman", givenName: "Fatehali", dateOfBirth: null },
      { id: "a2", familyName: "Suleman", givenName: "Fatehali", dateOfBirth: null },
      { id: "kid", familyName: "Suleman", givenName: "Arzu", dateOfBirth: null },
      { id: "wife", familyName: "Suleman", givenName: "Roshen", dateOfBirth: null },
    ],
    existingEdges: [
      { from: "a1", to: "kid", type: "parent" },
      { from: "a2", to: "kid", type: "parent" },
      { from: "a1", to: "wife", type: "spouse" },
      { from: "a2", to: "wife", type: "spouse" },
    ],
  };

  it("flags two same-named entries in the same graph position", () => {
    const out = auditTree(twiceEntered).filter(
      (c) => c.source === "shared_neighbours",
    );
    expect(out).toHaveLength(1);
    expect(out[0].suggestedType).toBe("duplicate_check");
    expect(out[0].confidence).toBe("high");
    expect(ids([out[0].subject, out[0].related])).toEqual(
      expect.arrayContaining(["a1", "a2"]),
    );
  });

  it("does not mistake a couple for one duplicated person", () => {
    // Fatehali and Roshen are both parents of the same two children and are
    // not linked to each other — heavy structural overlap, different names.
    const out = auditTree({
      existingPeople: [
        { id: "f", familyName: "Suleman", givenName: "Fatehali", dateOfBirth: null },
        { id: "r", familyName: "Suleman", givenName: "Roshen", dateOfBirth: null },
        { id: "c1", familyName: "Suleman", givenName: "Arzu", dateOfBirth: null },
        { id: "c2", familyName: "Suleman", givenName: "Ashif", dateOfBirth: null },
      ],
      existingEdges: [
        { from: "f", to: "c1", type: "parent" },
        { from: "f", to: "c2", type: "parent" },
        { from: "r", to: "c1", type: "parent" },
        { from: "r", to: "c2", type: "parent" },
      ],
    });
    expect(out.filter((c) => c.source === "shared_neighbours")).toHaveLength(0);
    // It is read as the couple it looks like instead.
    expect(out.filter((c) => c.source === "co_parent")).toHaveLength(1);
  });

  it("treats a nickname as the same given name", () => {
    const out = auditTree({
      ...twiceEntered,
      existingPeople: twiceEntered.existingPeople.map((p) =>
        p.id === "a2" ? { ...p, givenName: "Fateh" } : p,
      ),
      nicknameGroups: [["Fatehali", "Fateh"]],
    }).filter((c) => c.source === "shared_neighbours");
    expect(out).toHaveLength(1);
  });

  it("does not flag people who are directly connected", () => {
    const out = auditTree({
      ...twiceEntered,
      existingEdges: [
        ...twiceEntered.existingEdges,
        { from: "a1", to: "a2", type: "sibling" },
      ],
    });
    expect(out.filter((c) => c.source === "shared_neighbours")).toHaveLength(0);
  });

  it("does not flag same-named relatives born a generation apart", () => {
    const out = auditTree({
      ...twiceEntered,
      existingPeople: twiceEntered.existingPeople.map((p) =>
        p.id === "a1"
          ? { ...p, dateOfBirth: "1920-01-01" }
          : p.id === "a2"
            ? { ...p, dateOfBirth: "1955-01-01" }
            : p,
      ),
    });
    expect(out.filter((c) => c.source === "shared_neighbours")).toHaveLength(0);
  });

  it("needs structural overlap, not just a shared surname", () => {
    const out = auditTree({
      existingPeople: [
        { id: "x", familyName: "Suleman", givenName: "Amir", dateOfBirth: "1950-01-01" },
        { id: "y", familyName: "Suleman", givenName: "Amir", dateOfBirth: "1951-01-01" },
      ],
      existingEdges: [],
    });
    expect(out).toHaveLength(0);
  });
});

describe("auditTree — merging", () => {
  it("asks once when two rules imply the same missing parent", () => {
    const out = auditTree({
      existingPeople: [
        { id: "dad", familyName: "Nur", givenName: "Nurdin", dateOfBirth: null },
        { id: "mum", familyName: "Nur", givenName: "Zarina", dateOfBirth: null },
        { id: "a", familyName: "Nur", givenName: "Zahra", dateOfBirth: null },
        { id: "b", familyName: "Nur", givenName: "Shelina", dateOfBirth: null },
      ],
      existingEdges: [
        { from: "dad", to: "mum", type: "spouse" },
        // Both parents recorded for one sibling, only the mother for the other.
        { from: "dad", to: "b", type: "parent" },
        { from: "mum", to: "b", type: "parent" },
        { from: "mum", to: "a", type: "parent" },
        { from: "a", to: "b", type: "sibling" },
      ],
    }).filter((c) => c.suggestedType === "parent");

    // The partner rule and the sibling rule both propose dad -> a.
    expect(out).toHaveLength(1);
    expect(out[0].subject).toEqual({ kind: "existing", id: "dad" });
    expect(out[0].related).toEqual({ kind: "existing", id: "a" });
    // The stronger wording wins, and the other source rides along so answering
    // once settles both.
    expect(out[0].confidence).toBe("high");
    expect(out[0].source).toBe("unlinked_spouse_child");
    expect(out[0].alsoFrom).toEqual(["sibling_implied_parent"]);
  });
});

describe("the resolution ledger", () => {
  it("does not re-emit a suggestion a member has already answered", () => {
    const shared: AuditInput = {
      existingPeople: [
        { id: "mom", familyName: "Lee", dateOfBirth: "1960-01-01" },
        { id: "dad", familyName: "Lee", dateOfBirth: "1958-01-01" },
        { id: "kid", familyName: "Lee", dateOfBirth: "1990-01-01" },
      ],
      existingEdges: [
        { from: "mom", to: "kid", type: "parent" },
        { from: "dad", to: "kid", type: "parent" },
      ],
    };
    expect(auditTree(shared).filter((c) => c.source === "co_parent")).toHaveLength(
      1,
    );

    // The key is built from bare person ids — the same values the DB holds.
    const key = suggestionDedupeKey("dad", "mom", "spouse", "co_parent");
    expect(
      auditTree({ ...shared, resolvedKeys: new Set([key]) }).filter(
        (c) => c.source === "co_parent",
      ),
    ).toHaveLength(0);
  });

  it("keys parent suggestions directionally and pair types undirected", () => {
    expect(suggestionDedupeKey("a", "b", "parent", "co_parent")).not.toBe(
      suggestionDedupeKey("b", "a", "parent", "co_parent"),
    );
    expect(suggestionDedupeKey("a", "b", "spouse", "co_parent")).toBe(
      suggestionDedupeKey("b", "a", "spouse", "co_parent"),
    );
  });
});
