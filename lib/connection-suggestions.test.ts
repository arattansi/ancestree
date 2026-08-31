import { describe, expect, it } from "vitest";

import {
  computeImpliedConnections,
  suggestionDedupeKey,
  type DetectionInput,
} from "@/lib/connection-suggestions";

const base: DetectionInput = {
  newPeople: [],
  pendingEdges: [],
  existingPeople: [],
  existingEdges: [],
};

describe("computeImpliedConnections", () => {
  it("(a) co_parent: two parents of a shared child with no edge between them", () => {
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
        { type: "parent", a: { kind: "new", index: 0 }, b: { kind: "existing", id: "kid" } },
      ],
    });
    const coParent = out.filter((c) => c.source === "co_parent");
    expect(coParent).toHaveLength(1);
    expect(coParent[0].suggestedType).toBe("spouse");
    expect(
      [coParent[0].subject, coParent[0].related].map((r) =>
        r.kind === "existing" ? r.id : `new:${r.index}`,
      ),
    ).toEqual(expect.arrayContaining(["mom", "new:0"]));
  });

  it("(a) co_parent: does not fire when the two parents are already spouses", () => {
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
    });
    expect(out.filter((c) => c.source === "co_parent")).toHaveLength(0);
  });

  it("(b) unlinked_spouse_child: one suggestion per unlinked child of the other spouse", () => {
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
        { type: "spouse", a: { kind: "existing", id: "dad" }, b: { kind: "existing", id: "step" } },
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

  it("(b) unlinked_spouse_child: skips a child already linked to the other spouse", () => {
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
        { type: "spouse", a: { kind: "existing", id: "dad" }, b: { kind: "existing", id: "mom" } },
      ],
    });
    expect(out.filter((c) => c.source === "unlinked_spouse_child")).toHaveLength(0);
  });

  it("(c) name_dob_match: proposes a sibling_check and never a relationship-typed edge", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "existing-john", familyName: "Smith", dateOfBirth: "1948-06-01" },
      ],
      newPeople: [{ familyName: "smith", dateOfBirth: "1950-02-01" }],
    });
    const check = out.filter((c) => c.source === "name_dob_match");
    expect(check).toHaveLength(1);
    expect(check[0].suggestedType).toBe("sibling_check");
    expect(check[0].child).toBeUndefined();
  });

  it("(c) name_dob_match: outside the 40-year window does not fire", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "old", familyName: "Smith", dateOfBirth: "1900-01-01" },
      ],
      newPeople: [{ familyName: "Smith", dateOfBirth: "1990-01-01" }],
    });
    expect(out.filter((c) => c.source === "name_dob_match")).toHaveLength(0);
  });

  it("(c) name_dob_match: skips a person already connected via a shared relative", () => {
    const out = computeImpliedConnections({
      ...base,
      existingPeople: [
        { id: "cousin", familyName: "Smith", dateOfBirth: "1988-01-01" },
        { id: "aunt", familyName: "Smith", dateOfBirth: "1960-01-01" },
      ],
      existingEdges: [{ from: "aunt", to: "cousin", type: "parent" }],
      newPeople: [{ familyName: "Smith", dateOfBirth: "1990-01-01" }],
      pendingEdges: [
        { type: "parent", a: { kind: "existing", id: "aunt" }, b: { kind: "new", index: 0 } },
      ],
    });
    // "cousin" shares a parent ("aunt") with the new person → not a stranger.
    expect(out.filter((c) => c.source === "name_dob_match")).toHaveLength(0);
  });

  it("dedupe: an already-recorded (existing,existing) suggestion is not re-emitted", () => {
    const shared: DetectionInput = {
      ...base,
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
    const first = computeImpliedConnections(shared);
    expect(first.filter((c) => c.source === "co_parent")).toHaveLength(1);

    const key = suggestionDedupeKey(
      "existing:dad",
      "existing:mom",
      "spouse",
      "co_parent",
    );
    const second = computeImpliedConnections({
      ...shared,
      resolvedKeys: new Set([key]),
    });
    expect(second.filter((c) => c.source === "co_parent")).toHaveLength(0);
  });
});
