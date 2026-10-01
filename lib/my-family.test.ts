import { describe, expect, it } from "vitest";

import {
  cardShowing,
  companionsShowing,
  familyTies,
  mergeLines,
  mergeShowings,
  treeMarkOf,
  type FamilyEdge,
  type FamilyLine,
  type FamilyTie,
  type Showing,
} from "@/lib/my-family";

const parent = (from: string, to: string): FamilyEdge => ({
  from_person: from,
  to_person: to,
  type: "parent",
  is_divorced: false,
});
const spouse = (a: string, b: string, isDivorced = false): FamilyEdge => ({
  from_person: a,
  to_person: b,
  type: "spouse",
  is_divorced: isDivorced,
});
const sibling = (a: string, b: string): FamilyEdge => ({
  from_person: a,
  to_person: b,
  type: "sibling",
  is_divorced: false,
});

// Aalim's example (2026-09-30), across three trees joined by shared entries.
// His dad's side: grandparents, Dad and Uncle; Uncle married Aunt, whose own
// father is on the tree too, and their son is Karim. Grandma has a sister
// with no parents drawn, joined by a sibling line. Karim divorced his ex and
// has a child with a co-parent he never married.
const dadsSide = [
  spouse("gpaR", "gmaR"),
  parent("gpaR", "dad"),
  parent("gmaR", "dad"),
  parent("gpaR", "uncle"),
  parent("gmaR", "uncle"),
  sibling("gmaR", "greatAunt"),
  parent("greatAunt", "greatAuntKid"),
  spouse("uncle", "aunt"),
  parent("auntDad", "aunt"),
  parent("uncle", "karim"),
  parent("aunt", "karim"),
  spouse("karim", "karimEx", true),
  parent("exDad", "karimEx"),
  parent("karim", "karimKid"),
  parent("coParent", "karimKid"),
  parent("coParentMom", "coParent"),
];
// Where the two sides meet: Dad married Mom; Aalim and his sister.
const parents = [
  spouse("dad", "mom"),
  parent("dad", "aalim"),
  parent("mom", "aalim"),
  parent("dad", "sister"),
  parent("mom", "sister"),
];
// His mom's side: her parents, her sister, her sister's husband and son.
const momsSide = [
  spouse("mgpa", "mgma"),
  parent("mgpa", "mom"),
  parent("mgma", "mom"),
  parent("mgpa", "momSis"),
  parent("mgma", "momSis"),
  spouse("momSis", "momSisHusband"),
  parent("momSis", "momNephew"),
  parent("momSisHusband", "momNephew"),
  parent("husbandsMom", "momSisHusband"),
];
// Raiya's side: her parents, her brother and his wife, whose mother is
// there too. Raiya married Aalim.
const raiyasSide = [
  parent("rDad", "raiya"),
  parent("rMom", "raiya"),
  parent("rDad", "rBro"),
  parent("rMom", "rBro"),
  spouse("rBro", "rBroWife"),
  parent("rBroWifeMom", "rBroWife"),
  spouse("aalim", "raiya"),
];
const everyone = [...dadsSide, ...parents, ...momsSide, ...raiyasSide];

/** The ties as sorted `id: tie` lines, so a failure reads as a list. */
function tiesOf(selfId: string, edges: readonly FamilyEdge[]): string[] {
  return [...familyTies(selfId, edges)]
    .map(([id, tie]) => `${id}: ${tie}`)
    .sort();
}

const ids = (selfId: string, edges: readonly FamilyEdge[], tie: FamilyTie) =>
  [...familyTies(selfId, edges)]
    .flatMap(([id, t]) => (t === tie ? [id] : []))
    .sort();

describe("familyTies", () => {
  it("is only the viewer when no line touches them", () => {
    expect(tiesOf("me", everyone)).toEqual(["me: blood"]);
  });

  it("Karim sees his dad's side, with Aalim's mom and Raiya only as partners", () => {
    expect(tiesOf("karim", everyone)).toEqual(
      [
        // Up every parent line, then down and across siblings (Step 55).
        "karim: blood",
        "uncle: blood",
        "aunt: blood",
        "auntDad: blood",
        "gpaR: blood",
        "gmaR: blood",
        "greatAunt: blood",
        "greatAuntKid: blood",
        "dad: blood",
        "aalim: blood",
        "sister: blood",
        "karimKid: blood",
        // Married, or had a child with, someone in: alone.
        "mom: partner",
        "raiya: partner",
        "karimEx: partner",
        "coParent: partner",
      ].sort(),
    );
  });

  it("keeps out the families of everyone who married in", () => {
    const shown = familyTies("karim", everyone);
    for (const id of [
      "mgpa",
      "mgma",
      "momSis",
      "momNephew",
      "rDad",
      "rMom",
      "rBro",
      "exDad",
      "coParentMom",
    ]) {
      expect(shown.has(id), id).toBe(false);
    }
  });

  it("Raiya sees her own family and both of Aalim's sides", () => {
    expect(ids("raiya", everyone, "blood")).toEqual(
      ["raiya", "rDad", "rMom", "rBro"].sort(),
    );
    expect(ids("raiya", everyone, "partner_blood")).toEqual(
      [
        "aalim",
        "sister",
        // His dad's side…
        "dad",
        "gpaR",
        "gmaR",
        "greatAunt",
        "greatAuntKid",
        "uncle",
        "karim",
        "karimKid",
        // …and his mom's.
        "mom",
        "mgpa",
        "mgma",
        "momSis",
        "momNephew",
      ].sort(),
    );
    expect(ids("raiya", everyone, "partner")).toEqual(
      ["rBroWife", "aunt", "momSisHusband", "karimEx", "coParent"].sort(),
    );
  });

  it("Aalim's mom sees her own family and her in-laws", () => {
    expect(ids("mom", everyone, "blood")).toEqual(
      ["mom", "mgpa", "mgma", "momSis", "momNephew", "aalim", "sister"].sort(),
    );
    expect(ids("mom", everyone, "partner_blood")).toEqual(
      [
        "dad",
        "gpaR",
        "gmaR",
        "greatAunt",
        "greatAuntKid",
        "uncle",
        "karim",
        "karimKid",
      ].sort(),
    );
    expect(ids("mom", everyone, "partner")).toEqual(
      ["momSisHusband", "raiya", "aunt", "karimEx", "coParent"].sort(),
    );
    // Nobody from Raiya's side but Raiya herself.
    expect(familyTies("mom", everyone).has("rDad")).toBe(false);
  });

  it("leaves an ex's family out, the ex still a card", () => {
    const divorced = everyone.map((e) =>
      e.type === "spouse" && e.from_person === "dad" && e.to_person === "mom"
        ? { ...e, is_divorced: true }
        : e,
    );
    const ties = familyTies("mom", divorced);
    expect(ties.get("dad")).toBe("partner");
    // Their children are still hers.
    expect(ties.get("aalim")).toBe("blood");
    for (const id of ["gpaR", "gmaR", "uncle", "karim"]) {
      expect(ties.has(id), id).toBe(false);
    }
  });

  it("takes in every current partner's blood, and a co-parent never married", () => {
    const edges = [
      spouse("me", "wife1"),
      spouse("me", "wife2"),
      parent("w1Dad", "wife1"),
      parent("w2Dad", "wife2"),
      parent("me", "kid"),
      parent("other", "kid"),
      parent("otherMom", "other"),
    ];
    expect(tiesOf("me", edges)).toEqual(
      [
        "me: blood",
        "kid: blood",
        "wife1: partner_blood",
        "w1Dad: partner_blood",
        "wife2: partner_blood",
        "w2Dad: partner_blood",
        "other: partner",
      ].sort(),
    );
  });

  it("keeps blood when a relative is also a partner", () => {
    const edges = [
      parent("gpa", "mum"),
      parent("gpa", "uncle"),
      parent("mum", "me"),
      parent("uncle", "cousin"),
      spouse("me", "cousin"),
    ];
    expect(familyTies("me", edges).get("cousin")).toBe("blood");
  });

  it("ends on a cycle in the lines", () => {
    const edges = [parent("a", "b"), parent("b", "a"), spouse("a", "x", true)];
    expect(tiesOf("a", edges)).toEqual(["a: blood", "b: blood", "x: partner"]);
  });
});

type Row = { id: string; label: string };
const show = (
  treeId: string,
  id: string,
  {
    basic = false,
    isHome = false,
    placedAt = null,
  }: { basic?: boolean; isHome?: boolean; placedAt?: string | null } = {},
): Showing<Row> => ({
  treeId,
  row: { id, label: `${id} on ${treeId}` },
  basic,
  isHome,
  placedAt,
});

describe("cardShowing", () => {
  it("is the home tree when the viewer is a member there", () => {
    const chosen = cardShowing([
      show("older", "p", { placedAt: "2026-01-01T00:00:00+00:00" }),
      show("home", "p", { isHome: true, placedAt: "2026-09-01T00:00:00+00:00" }),
    ]);
    expect(chosen?.treeId).toBe("home");
  });

  it("is the tree that has shown them in full longest otherwise", () => {
    const chosen = cardShowing([
      show("later", "p", { placedAt: "2026-09-02T10:00:00.5+00:00" }),
      show("first", "p", { placedAt: "2026-09-02T10:00:00.25+00:00" }),
    ]);
    expect(chosen?.treeId).toBe("first");
  });

  it("puts a full card before a basic one, however long the basic's been there", () => {
    const chosen = cardShowing([
      show("basic", "p", { basic: true, placedAt: "2025-01-01T00:00:00+00:00" }),
      show("full", "p", { placedAt: "2026-09-01T00:00:00+00:00" }),
    ]);
    expect(chosen?.treeId).toBe("full");
  });

  it("takes a basic card, longest first, when that's all there is", () => {
    const chosen = cardShowing([
      show("b2", "p", { basic: true, placedAt: "2026-09-02T00:00:00+00:00" }),
      show("b1", "p", { basic: true, placedAt: "2026-09-01T00:00:00+00:00" }),
    ]);
    expect(chosen?.treeId).toBe("b1");
  });

  it("settles ties and unknown dates by tree, the same every time", () => {
    expect(cardShowing([show("t2", "p"), show("t1", "p")])?.treeId).toBe("t1");
    expect(
      cardShowing([
        show("t1", "p"),
        show("t2", "p", { placedAt: "2026-09-01T00:00:00+00:00" }),
      ])?.treeId,
    ).toBe("t2");
  });

  it("is nobody with no showings", () => {
    expect(cardShowing([])).toBeNull();
  });
});

describe("mergeShowings", () => {
  it("makes one card per person, listing their trees in the key's order", () => {
    const cards = mergeShowings(
      [
        show("suleman", "aalim", { basic: true }),
        show("rattansi", "aalim", { isHome: true }),
        show("suleman", "raiya", { isHome: true }),
        show("rattansi", "raiya", { placedAt: "2026-09-01T00:00:00+00:00" }),
      ],
      ["rattansi", "suleman"],
    );
    expect([...cards.keys()].sort()).toEqual(["aalim", "raiya"]);
    expect(cards.get("aalim")).toEqual({
      row: { id: "aalim", label: "aalim on rattansi" },
      treeId: "rattansi",
      treeIds: ["rattansi", "suleman"],
    });
    expect(cards.get("raiya")?.treeId).toBe("suleman");
    expect(cards.get("raiya")?.treeIds).toEqual(["rattansi", "suleman"]);
  });
});

const line = (
  id: string,
  over: Partial<FamilyLine> = {},
): FamilyLine => ({
  id,
  from_person: "a",
  to_person: "b",
  type: "spouse",
  created_by: "u",
  marriage_date: null,
  marriage_month: null,
  marriage_day: null,
  is_divorced: false,
  divorce_date: null,
  drawn_here: false,
  drawn_on_tree_id: "t1",
  ...over,
});

describe("mergeLines", () => {
  it("keeps one copy of a line every tree draws, with any dates one shows", () => {
    const merged = mergeLines([
      line("l1"),
      line("l1", { marriage_date: "1990-06-01", drawn_here: true }),
      line("l2", { type: "parent" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: "l1",
      marriage_date: "1990-06-01",
      drawn_here: true,
    });
    expect(merged[1].id).toBe("l2");
  });

  it("leaves what it was given alone", () => {
    const first = line("l1");
    mergeLines([first, line("l1", { marriage_date: "1990-06-01" })]);
    expect(first.marriage_date).toBeNull();
  });
});

describe("treeMarkOf", () => {
  it("fills the two hues first, then rings them, then repeats", () => {
    expect([0, 1, 2, 3, 4].map(treeMarkOf)).toEqual([
      { colour: "var(--tree-mark-1)", ring: false },
      { colour: "var(--tree-mark-2)", ring: false },
      { colour: "var(--tree-mark-1)", ring: true },
      { colour: "var(--tree-mark-2)", ring: true },
      { colour: "var(--tree-mark-1)", ring: false },
    ]);
  });
});

describe("companionsShowing", () => {
  const pet = (id: string, companions: string[], primary: string | null) => ({
    id,
    companions,
    primary_person_id: primary,
  });
  const shown = new Set(["a", "b"]);

  it("keeps a pet whose people are all in the view as it is", () => {
    const dog = pet("dog", ["a", "b"], "a");
    expect(companionsShowing([dog], shown)[0]).toBe(dog);
  });

  it("leaves out a pet with nobody in the view", () => {
    expect(companionsShowing([pet("cat", ["x"], "x")], shown)).toEqual([]);
  });

  it("keeps a pet's people to those shown, and lets an absent primary go", () => {
    expect(
      companionsShowing(
        [pet("dog", ["x", "a"], "x"), pet("cat", ["a", "y"], "a")],
        shown,
      ),
    ).toEqual([pet("dog", ["a"], null), pet("cat", ["a"], "a")]);
  });
});
