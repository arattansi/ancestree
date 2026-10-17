import { describe, expect, it } from "vitest";

import { addRows, NO_ADDS, type AddTree } from "@/lib/leaf-adds";

const TODAY = new Date("2026-10-17T12:00:00Z");

// The tree is anchored on Grandpa: he, Dad, Me, Sis and my son Kid are blood.
// Grandma, Mum and Ted married in; Nan is Mum's mother.
const parent = (from: string, to: string) => ({ from_person: from, to_person: to, type: "parent" });
const spouse = (a: string, b: string) => ({ from_person: a, to_person: b, type: "spouse" });
const LINES = [
  parent("grandpa", "dad"),
  parent("grandma", "dad"),
  spouse("grandpa", "grandma"),
  spouse("dad", "mum"),
  parent("dad", "me"),
  parent("mum", "me"),
  parent("dad", "sis"),
  parent("mum", "sis"),
  spouse("sis", "ted"),
  parent("me", "kid"),
  parent("nan", "mum"),
];
const EVERYONE = new Set(["grandpa", "grandma", "dad", "mum", "me", "sis", "ted", "kid", "nan"]);

const tree = (over: Partial<AddTree> = {}): AddTree => ({
  role: "admin",
  anchors: ["grandpa"],
  people: EVERYONE,
  ...over,
});

const leaf = (id: string, over: Partial<Parameters<typeof addRows>[0]["leaf"]> = {}) => ({
  id,
  placeholder_number: null,
  date_of_birth: null,
  date_of_birth_precision: null,
  ...over,
});

const NONE = { parents: false, children: false };

const rows = (
  id: string,
  {
    has = NONE,
    on = tree(),
    self = "me",
    person = {},
  }: {
    has?: { parents: boolean; children: boolean };
    on?: AddTree | null;
    self?: string;
    person?: Partial<Parameters<typeof addRows>[0]["leaf"]>;
  } = {},
) =>
  addRows({ leaf: leaf(id, person), selfId: self, has, tree: on, lines: LINES, today: TODAY });

describe("addRows", () => {
  it("asks for whichever row is empty", () => {
    expect(rows("grandpa", { has: { parents: false, children: true } })).toEqual({
      parents: true,
      children: false,
    });
    expect(rows("kid", { has: { parents: true, children: false } })).toEqual({
      parents: false,
      children: true,
    });
    expect(rows("kid", { has: { parents: true, children: true } })).toEqual(NO_ADDS);
  });

  it("asks nothing where no tree of theirs shows the leaf in full", () => {
    expect(rows("grandpa", { on: null })).toEqual(NO_ADDS);
  });

  it("asks nothing of a placeholder child (Step 98.2)", () => {
    expect(rows("kid", { person: { placeholder_number: 1 } })).toEqual(NO_ADDS);
  });

  it("lets a Root or a Branch ask from anyone with a blood tie", () => {
    for (const role of ["admin", "branch_admin"]) {
      expect(rows("grandpa", { on: tree({ role }) })).toEqual({ parents: true, children: true });
      expect(rows("sis", { on: tree({ role }) })).toEqual({ parents: true, children: true });
    }
  });

  it("asks nothing from someone who married in (Step 53), whoever is adding", () => {
    for (const role of ["admin", "branch_admin", "member"]) {
      expect(rows("grandma", { on: tree({ role }) })).toEqual(NO_ADDS);
      expect(rows("mum", { on: tree({ role }) })).toEqual(NO_ADDS);
      expect(rows("ted", { on: tree({ role }) })).toEqual(NO_ADDS);
      expect(rows("nan", { on: tree({ role }) })).toEqual(NO_ADDS);
    }
  });

  it("asks from anyone on a tree with no anchors", () => {
    expect(rows("ted", { on: tree({ anchors: [] }) })).toEqual({ parents: true, children: true });
  });

  it("keeps a Leaf to their own line (Step 34)", () => {
    const leafTree = tree({ role: "member" });
    // Parents of themselves and their ancestors.
    expect(rows("me", { on: leafTree })).toEqual({ parents: true, children: true });
    expect(rows("grandpa", { on: leafTree })).toEqual({ parents: true, children: true });
    // Children of anyone descended from those, not their parents.
    expect(rows("sis", { on: leafTree })).toEqual({ parents: false, children: true });
    expect(rows("kid", { on: leafTree })).toEqual({ parents: false, children: true });
  });

  it("asks nothing of a Leaf whose own entry isn't on the tree", () => {
    expect(
      rows("grandpa", { on: tree({ role: "member", people: new Set(["grandpa", "dad"]) }) }),
    ).toEqual(NO_ADDS);
  });

  it("measures only the tree the form adds on", () => {
    // Dad isn't on it: Grandpa isn't my ancestor there, so a Leaf can't.
    const without = new Set([...EVERYONE].filter((id) => id !== "dad"));
    expect(rows("grandpa", { on: tree({ role: "member", people: without }) })).toEqual(NO_ADDS);
  });

  it("leaves a child under 18 to their parent (Step 98)", () => {
    const young = { date_of_birth: "2014-01-01", date_of_birth_precision: "year" };
    expect(rows("kid", { person: young })).toEqual({ parents: true, children: false });
    // Their own leaf, they're the parent.
    expect(rows("kid", { self: "kid", person: young, on: tree({ anchors: [] }) })).toEqual({
      parents: true,
      children: true,
    });
    // Old enough, or not known: the form asks.
    expect(rows("kid", { person: { date_of_birth: "1990-05-01", date_of_birth_precision: "day" } }))
      .toEqual({ parents: true, children: true });
    // Born in the year they turn 18: can't tell, so the form asks.
    expect(rows("kid", { person: { date_of_birth: "2008-01-01", date_of_birth_precision: "year" } }))
      .toEqual({ parents: true, children: true });
  });
});
