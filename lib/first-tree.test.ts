import { describe, expect, it } from "vitest";

import {
  closeFamilyOf,
  closeRelativeEdges,
  closeRelativeProblem,
  gettingStartedItems,
  inviteFamilyHref,
  isFirstTreeStep,
  joinerItems,
  namePrefill,
  openingStep,
  plantedCardText,
  reachableStep,
  stepAfter,
  stepDone,
  stepFromAddress,
  type FirstTreeState,
  type JoinerState,
} from "@/lib/first-tree";
import { nextStep, type OnboardingSignals } from "@/lib/onboarding";

const fresh: FirstTreeState = {
  selfPlaced: false,
  selfPhoto: false,
  selfBirthplace: false,
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
    // Folded into the family step by Step 161.
    expect(isFirstTreeStep("you")).toBe(false);
  });

  it("reads an old `?step=you` as the family step", () => {
    expect(stepFromAddress("you")).toBe("family");
    expect(stepFromAddress("family")).toBe("family");
    expect(stepFromAddress("name")).toBe("name");
    expect(stepFromAddress("canvas")).toBeNull();
    expect(stepFromAddress(undefined)).toBeNull();
  });

  it("opens on the family step, where a new founder adds themselves first", () => {
    expect(openingStep(fresh)).toBe("family");
    // Even once they've invited someone.
    expect(openingStep({ ...fresh, invited: true })).toBe("family");
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

  it("holds naming until the founder is on the tree", () => {
    expect(reachableStep("name", fresh)).toBe("family");
    expect(reachableStep("family", fresh)).toBe("family");
    expect(reachableStep("invite", fresh)).toBe("invite");
    expect(reachableStep("name", { ...fresh, selfPlaced: true })).toBe("name");
  });

  it("walks family → invite → name → the canvas", () => {
    expect(stepAfter("family")).toBe("invite");
    expect(stepAfter("invite")).toBe("name");
    expect(stepAfter("name")).toBeNull();
  });

  it("ticks a step off by what's on the tree", () => {
    expect(stepDone("invite", { ...fresh, invited: true })).toBe(true);
    // A default name isn't a chosen one, and nothing is named before the
    // founder is on the tree to name it after.
    expect(stepDone("name", { ...fresh, defaultName: false })).toBe(false);
    expect(stepDone("name", { ...fresh, selfPlaced: true, defaultName: false })).toBe(
      true,
    );
    // The founder alone isn't their family yet.
    expect(stepDone("family", { ...fresh, selfPlaced: true })).toBe(false);
    expect(stepDone("family", { ...fresh, selfPlaced: true, siblings: 1 })).toBe(true);
  });
});

describe("gettingStartedItems", () => {
  it("lists their own details, then the steps with the family split in two", () => {
    const items = gettingStartedItems({ ...fresh, selfPlaced: true, parents: 2 });
    expect(items.map((i) => [i.key, i.done])).toEqual([
      ["details", false],
      ["parents", true],
      ["more-family", false],
      ["invite", false],
      ["name", false],
    ]);
  });

  it("wants both a photo and a birthplace for their details", () => {
    const details = (state: Partial<FirstTreeState>) =>
      gettingStartedItems({ ...fresh, selfPlaced: true, ...state })[0];
    expect(details({ selfPhoto: true }).done).toBe(false);
    expect(details({ selfBirthplace: true }).done).toBe(false);
    expect(details({ selfPhoto: true, selfBirthplace: true }).done).toBe(true);
  });

  it("counts a partner, a child or a sibling as more family", () => {
    for (const more of [{ partners: 1 }, { children: 1 }, { siblings: 1 }]) {
      const items = gettingStartedItems({ ...fresh, ...more });
      expect(items.find((i) => i.key === "more-family")?.done).toBe(true);
    }
  });

  it("points each item at where it's done", () => {
    expect(gettingStartedItems(fresh).map((i) => i.href)).toEqual([
      "/welcome?details=1",
      "/onboarding?step=family",
      "/onboarding?step=family",
      "/onboarding?step=invite#your-family",
      "/onboarding?step=name",
    ]);
  });

  it("asks them to invite their family, at the list of who they added", () => {
    const invite = gettingStartedItems(fresh).find((i) => i.key === "invite");
    expect(invite?.label).toBe("Invite your family");
    expect(invite?.href?.endsWith("#your-family")).toBe(true);
  });
});

describe("joinerItems (Step 170)", () => {
  /** Just joined: nothing added, nobody invited, nothing shared. */
  const joiner: JoinerState = {
    treeId: "t1",
    runsTree: false,
    selfId: "me",
    selfPhoto: false,
    selfBirthplace: false,
    partners: 0,
    children: 0,
    signals: { claimable: 0, people_added: 0, invited: false, shared: false },
  };
  const item = (state: Partial<JoinerState>, key: string) =>
    joinerItems({ ...joiner, ...state }).find((i) => i.key === key);
  const signals = (s: Partial<JoinerState["signals"]>) => ({
    signals: { ...joiner.signals, ...s },
  });

  it("lists four, their own details first, then the emails' order", () => {
    expect(joinerItems(joiner).map((i) => [i.key, i.label, i.done])).toEqual([
      ["details", "Add your photo and birthplace", false],
      ["invite", "Invite a relative", false],
      ["family", "Add your partner or children", false],
      ["story", "Share a story or photo", false],
    ]);
  });

  it("asks for the same thing next as the getting started emails", () => {
    // The emails' steps, as each item stands for them: claim and invite
    // are the one invite item.
    const asks = { claim: "invite", invite: "invite", family: "family", story: "story" };
    const member = (s: Partial<OnboardingSignals>): OnboardingSignals => ({
      started_at: "2026-10-16T15:00:00Z",
      last_active: "2026-10-16",
      sends: [],
      ...joiner.signals,
      ...s,
    });
    for (const s of [
      {},
      { claimable: 2, people_added: 2 },
      { invited: true },
      { invited: true, people_added: 3 },
    ]) {
      const next = nextStep(member(s), "2026-10-17");
      const firstOpen = joinerItems({ ...joiner, selfPhoto: true, selfBirthplace: true, signals: member(s) })
        .find((i) => !i.done);
      expect(firstOpen?.key).toBe(next ? asks[next.step] : undefined);
    }
  });

  it("opens their own details, back to My Family Tree", () => {
    expect(item({}, "details")?.href).toBe("/welcome?details=1");
    expect(item({ selfPhoto: true }, "details")?.done).toBe(false);
    expect(item({ selfPhoto: true, selfBirthplace: true }, "details")?.done).toBe(true);
  });

  it("invites the people they added while any wait, else a relative", () => {
    expect(item(signals({ claimable: 1, people_added: 1 }), "invite")?.href).toBe(
      "/account?view=settings#people-you-added",
    );
    expect(item({}, "invite")?.href).toBe("/account?view=settings#invite-t1");
    // A Root shares the family link, as the emails' button does.
    expect(item({ runsTree: true }, "invite")?.href).toBe(
      "/account/admin?tree=t1&section=family-link",
    );
  });

  it("ticks the invite once they've invited anyone, as the emails do", () => {
    expect(item(signals({ invited: true }), "invite")?.done).toBe(true);
    expect(item(signals({ invited: true, claimable: 1 }), "invite")?.done).toBe(true);
  });

  it("adds a partner while they have none, else a child", () => {
    expect(item({}, "family")?.href).toBe("/people/new?relatedTo=me&as=spouse");
    expect(item({ partners: 1 }, "family")?.href).toBe("/people/new?relatedTo=me&as=child");
  });

  it("ticks the family with a partner or a child, or once the emails stop asking", () => {
    expect(item({ partners: 1 }, "family")?.done).toBe(true);
    expect(item({ children: 2 }, "family")?.done).toBe(true);
    expect(item(signals({ people_added: 2 }), "family")?.done).toBe(false);
    expect(item(signals({ people_added: 3 }), "family")?.done).toBe(true);
  });

  it("shares a story or photo from the canvas's +", () => {
    expect(item({}, "story")?.href).toBeNull();
    expect(item(signals({ shared: true }), "story")?.done).toBe(true);
  });
});

describe("the card at the end of the run (Step 169)", () => {
  it("says how big the tree is, and who'd grow it", () => {
    expect(plantedCardText("The Haddad Family", 4)).toBe(
      "The Haddad Family has 4 people. Invite your family to grow it.",
    );
    expect(plantedCardText("The Haddad Family", 1)).toBe(
      "The Haddad Family has 1 person. Invite your family to grow it.",
    );
  });

  it("calls a tree nobody has named the family tree, as its emails do", () => {
    expect(plantedCardText("Family", 2)).toBe(
      "The family tree has 2 people. Invite your family to grow it.",
    );
    expect(plantedCardText("Second Family", 3)).toMatch(/^The family tree has/);
  });

  it("invites at the invite step's list, as Getting Started does", () => {
    expect(inviteFamilyHref()).toBe("/onboarding?step=invite#your-family");
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
