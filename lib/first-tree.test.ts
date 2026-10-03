import { describe, expect, it } from "vitest";

import {
  closeFamilyOf,
  closeRelativeEdges,
  closeRelativeProblem,
  gettingStartedItems,
  isFirstTreeStep,
  namePrefill,
  openingStep,
  reachableStep,
  stepAfter,
  stepDone,
  type FirstTreeState,
} from "@/lib/first-tree";

const fresh: FirstTreeState = {
  selfPlaced: false,
  defaultName: true,
  invited: false,
  parents: 0,
  partners: 0,
  children: 0,
  siblings: 0,
};

describe("the steps", () => {
  it("knows its own step names", () => {
    expect(isFirstTreeStep("invite")).toBe(true);
    expect(isFirstTreeStep("family")).toBe(true);
    expect(isFirstTreeStep("canvas")).toBe(false);
    expect(isFirstTreeStep(undefined)).toBe(false);
  });

  it("opens on their own entry for a founder who hasn't started", () => {
    expect(openingStep(fresh)).toBe("you");
    // Even once they've invited someone.
    expect(openingStep({ ...fresh, invited: true })).toBe("you");
  });

  it("opens on the first step not yet done once they're on the tree", () => {
    const placed = { ...fresh, selfPlaced: true };
    expect(openingStep(placed)).toBe("family");
    expect(openingStep({ ...placed, parents: 1 })).toBe("invite");
    expect(openingStep({ ...placed, parents: 1, invited: true })).toBe("name");
    // Everything done: their close family, to add more.
    expect(
      openingStep({ ...placed, parents: 1, invited: true, defaultName: false }),
    ).toBe("family");
  });

  it("holds naming and family until the founder is on the tree", () => {
    expect(reachableStep("name", fresh)).toBe("you");
    expect(reachableStep("family", fresh)).toBe("you");
    expect(reachableStep("invite", fresh)).toBe("invite");
    expect(reachableStep("family", { ...fresh, selfPlaced: true })).toBe("family");
  });

  it("walks you → family → invite → name → the canvas", () => {
    expect(stepAfter("you", fresh)).toBe("family");
    expect(stepAfter("family", fresh)).toBe("invite");
    expect(stepAfter("invite", fresh)).toBe("name");
    expect(stepAfter("name", fresh)).toBeNull();
  });

  it("passes over a name someone already chose", () => {
    // A member named their tree when they founded it.
    const named = { ...fresh, selfPlaced: true, defaultName: false };
    expect(stepAfter("family", named)).toBe("invite");
    expect(stepAfter("invite", named)).toBeNull();
  });

  it("ticks a step off by what's on the tree", () => {
    expect(stepDone("invite", { ...fresh, invited: true })).toBe(true);
    expect(stepDone("you", fresh)).toBe(false);
    // A default name isn't a chosen one, and nothing is named before the
    // founder is on the tree to name it after.
    expect(stepDone("name", { ...fresh, defaultName: false })).toBe(false);
    expect(stepDone("name", { ...fresh, selfPlaced: true, defaultName: false })).toBe(
      true,
    );
    expect(stepDone("family", { ...fresh, siblings: 1 })).toBe(true);
  });
});

describe("gettingStartedItems", () => {
  it("lists the steps with the family split in two", () => {
    const items = gettingStartedItems({ ...fresh, selfPlaced: true, parents: 2 });
    expect(items.map((i) => [i.key, i.done])).toEqual([
      ["you", true],
      ["parents", true],
      ["more-family", false],
      ["invite", false],
      ["name", false],
    ]);
  });

  it("counts a partner, a child or a sibling as more family", () => {
    for (const more of [{ partners: 1 }, { children: 1 }, { siblings: 1 }]) {
      const items = gettingStartedItems({ ...fresh, ...more });
      expect(items.find((i) => i.key === "more-family")?.done).toBe(true);
    }
  });

  it("points each item at the step that does it", () => {
    expect(gettingStartedItems(fresh).map((i) => i.step)).toEqual([
      "you",
      "family",
      "family",
      "invite",
      "name",
    ]);
  });
});

describe("namePrefill", () => {
  it("splits a name into first and the rest", () => {
    expect(namePrefill("Maria Garcia")).toEqual({
      first_name: "Maria",
      last_name: "Garcia",
    });
    expect(namePrefill("  Maria  de la Cruz ")).toEqual({
      first_name: "Maria",
      last_name: "de la Cruz",
    });
    expect(namePrefill("Zoë O’Brien-Smith")).toEqual({
      first_name: "Zoë",
      last_name: "O’Brien-Smith",
    });
  });

  it("keeps a single name as the first name", () => {
    expect(namePrefill("Maria")).toEqual({ first_name: "Maria", last_name: "" });
  });

  it("prefills nothing from an email address or nothing at all", () => {
    expect(namePrefill("maria.garcia")).toEqual({ first_name: "", last_name: "" });
    expect(namePrefill("mgarcia84")).toEqual({ first_name: "", last_name: "" });
    expect(namePrefill("")).toEqual({ first_name: "", last_name: "" });
    expect(namePrefill(null)).toEqual({ first_name: "", last_name: "" });
  });
});

describe("closeFamilyOf", () => {
  const lines = [
    { from_person: "mum", to_person: "me", type: "parent" },
    { from_person: "dad", to_person: "me", type: "parent" },
    { from_person: "mum", to_person: "dad", type: "spouse" },
    { from_person: "mum", to_person: "sis", type: "parent" },
    { from_person: "dad", to_person: "half", type: "parent" },
    { from_person: "me", to_person: "ex", type: "spouse", is_divorced: true },
    { from_person: "wife", to_person: "me", type: "spouse" },
    { from_person: "me", to_person: "kid", type: "parent" },
    { from_person: "wife", to_person: "kid", type: "parent" },
    { from_person: "me", to_person: "cousin", type: "sibling" },
    { from_person: "gran", to_person: "mum", type: "parent" },
  ];

  it("reads parents, partners, children and siblings", () => {
    expect(closeFamilyOf("me", lines)).toEqual({
      parents: ["mum", "dad"],
      partners: [
        { id: "ex", isDivorced: true },
        { id: "wife", isDivorced: false },
      ],
      children: ["kid"],
      // Full, half, and one joined only by a sibling line.
      siblings: ["cousin", "sis", "half"],
    });
  });

  it("is empty for someone on their own", () => {
    expect(closeFamilyOf("me", [])).toEqual({
      parents: [],
      partners: [],
      children: [],
      siblings: [],
    });
  });

  it("never counts the person as their own sibling", () => {
    expect(closeFamilyOf("me", lines).siblings).not.toContain("me");
  });
});

describe("closeRelativeEdges", () => {
  const added = { kind: "new", index: 0 } as const;
  const me = { kind: "existing", id: "me" } as const;

  it("hangs a parent above the founder, partnered with the other parent", () => {
    expect(closeRelativeEdges("parent", "me")).toEqual([
      { type: "parent", a: added, b: me },
    ]);
    expect(closeRelativeEdges("parent", "me", { partnerIds: ["mum"] })).toEqual([
      { type: "parent", a: added, b: me },
      { type: "spouse", a: { kind: "existing", id: "mum" }, b: added },
    ]);
  });

  it("marries a partner to the founder, with the dates given", () => {
    expect(
      closeRelativeEdges("partner", "me", {
        marriage: { marriage_date: "2001-06-02", is_divorced: false, divorce_date: "2010-01-01" },
      }),
    ).toEqual([
      {
        type: "spouse",
        a: me,
        b: added,
        marriage_date: "2001-06-02",
        marriage_month: null,
        marriage_day: null,
        is_divorced: false,
        // Not divorced, so no divorce date, whatever the form still holds.
        divorce_date: null,
      },
    ]);
  });

  it("marries a partner on a day and month with no year", () => {
    expect(
      closeRelativeEdges("partner", "me", {
        marriage: { marriage_date: null, marriage_month: 6, marriage_day: 2 },
      }),
    ).toEqual([
      {
        type: "spouse",
        a: me,
        b: added,
        marriage_date: null,
        marriage_month: 6,
        marriage_day: 2,
        is_divorced: false,
        divorce_date: null,
      },
    ]);
  });

  it("gives a child the founder and their partner as parents", () => {
    expect(closeRelativeEdges("child", "me", { coParentIds: ["wife"] })).toEqual([
      { type: "parent", a: me, b: added },
      { type: "parent", a: { kind: "existing", id: "wife" }, b: added },
    ]);
  });

  it("hangs a sibling under the parents they share", () => {
    expect(
      closeRelativeEdges("sibling", "me", { sharedParentIds: ["mum", "dad"] }),
    ).toEqual([
      { type: "parent", a: { kind: "existing", id: "mum" }, b: added },
      { type: "parent", a: { kind: "existing", id: "dad" }, b: added },
    ]);
  });

  it("ignores repeats and the founder in the lists", () => {
    expect(
      closeRelativeEdges("child", "me", { coParentIds: ["wife", "wife", "me", ""] }),
    ).toEqual([
      { type: "parent", a: me, b: added },
      { type: "parent", a: { kind: "existing", id: "wife" }, b: added },
    ]);
  });

  it("joins a sibling added before any parent by sibling lines (Step 125)", () => {
    expect(closeRelativeEdges("sibling", "me", { siblingIds: ["sis", "me"] })).toEqual([
      { type: "sibling", a: me, b: added },
      { type: "sibling", a: { kind: "existing", id: "sis" }, b: added },
    ]);
  });

  it("makes a new parent the parent of siblings who had none (Step 125)", () => {
    expect(closeRelativeEdges("parent", "me", { alsoParentOf: ["sis"] })).toEqual([
      { type: "parent", a: added, b: me },
      { type: "parent", a: added, b: { kind: "existing", id: "sis" } },
    ]);
  });

  it("wants a shared parent only once the founder has one", () => {
    const one = { parentsOnTree: 1 };
    expect(closeRelativeProblem("sibling", {}, one)).toMatch(/parent you share/);
    expect(closeRelativeProblem("sibling", { sharedParentIds: ["mum"] }, one)).toBeNull();
    // Before any parent (Step 125).
    expect(closeRelativeProblem("sibling", {})).toBeNull();
    expect(closeRelativeProblem("parent")).toBeNull();
  });
});
