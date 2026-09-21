import { describe, expect, it } from "vitest";

import { personSpotlight, spotlightPeople } from "@/lib/person-spotlight";

// grandad — granny
//        |
//       dad — mum      uncle — aunt
//        |                |
//       me — partner     cousin
//        |
//       kid
const relationships = [
  { from_person: "grandad", to_person: "dad", type: "parent" },
  { from_person: "granny", to_person: "dad", type: "parent" },
  { from_person: "grandad", to_person: "uncle", type: "parent" },
  { from_person: "granny", to_person: "uncle", type: "parent" },
  { from_person: "dad", to_person: "me", type: "parent" },
  { from_person: "mum", to_person: "me", type: "parent" },
  { from_person: "uncle", to_person: "cousin", type: "parent" },
  { from_person: "aunt", to_person: "cousin", type: "parent" },
  { from_person: "me", to_person: "kid", type: "parent" },
  { from_person: "grandad", to_person: "granny", type: "spouse" },
  { from_person: "dad", to_person: "mum", type: "spouse" },
  { from_person: "uncle", to_person: "aunt", type: "spouse" },
  { from_person: "me", to_person: "partner", type: "spouse" },
];

describe("personSpotlight", () => {
  it("lights the line above and below the person", () => {
    const { line: people } = personSpotlight("me", relationships);
    for (const id of ["me", "dad", "mum", "grandad", "granny", "kid"])
      expect(people.has(id)).toBe(true);
  });

  it("lights the partners of everyone on the line", () => {
    expect(personSpotlight("me", relationships).line.has("partner")).toBe(
      true,
    );
  });

  it("leaves the branches beside the line dark", () => {
    const people = spotlightPeople(personSpotlight("me", relationships));
    expect(people.has("uncle")).toBe(false);
    expect(people.has("cousin")).toBe(false);
    // Lit only through a partner, so their side of the tree stays out of it.
    expect(people.has("aunt")).toBe(false);
  });

  it("counts the line it reached in each direction", () => {
    const spotlight = personSpotlight("me", relationships);
    expect(spotlight.ancestors).toBe(4);
    expect(spotlight.descendants).toBe(1);
  });

  it("lights a person with no relatives on their own", () => {
    const spotlight = personSpotlight("me", []);
    const { ancestors, descendants } = spotlight;
    expect([...spotlightPeople(spotlight)]).toEqual(["me"]);
    expect(ancestors).toBe(0);
    expect(descendants).toBe(0);
  });

  it("has no siblings when nobody shares a parent", () => {
    const spotlight = personSpotlight("me", relationships);
    expect(spotlight.siblings.size).toBe(0);
    expect(spotlight.siblingSpouses.size).toBe(0);
  });
});

// grandad — granny
//        |
//   (dad — mum)        stepmum
//     |      |            |
//   elder  me — partner  (dad) — half
//     |
//   niece  (elder — inlaw)
describe("personSpotlight siblings (Step 19.3)", () => {
  const family = [
    { from_person: "grandad", to_person: "dad", type: "parent" },
    { from_person: "granny", to_person: "dad", type: "parent" },
    { from_person: "grandad", to_person: "uncle", type: "parent" },
    { from_person: "dad", to_person: "me", type: "parent" },
    { from_person: "mum", to_person: "me", type: "parent" },
    { from_person: "dad", to_person: "elder", type: "parent" },
    { from_person: "mum", to_person: "elder", type: "parent" },
    { from_person: "dad", to_person: "half", type: "parent" },
    { from_person: "stepmum", to_person: "half", type: "parent" },
    { from_person: "elder", to_person: "niece", type: "parent" },
    { from_person: "dad", to_person: "mum", type: "spouse" },
    { from_person: "dad", to_person: "stepmum", type: "spouse" },
    { from_person: "me", to_person: "partner", type: "spouse" },
    { from_person: "elder", to_person: "inlaw", type: "spouse" },
    { from_person: "partner", to_person: "partnersbrother", type: "sibling" },
  ];

  it("finds full and half siblings through shared parents", () => {
    const { siblings, looseSiblings } = personSpotlight("me", family);
    expect([...siblings].sort()).toEqual(["elder", "half"]);
    expect(looseSiblings.size).toBe(0);
  });

  it("brings in the siblings' partners, one step and no further", () => {
    const spotlight = personSpotlight("me", family);
    expect([...spotlight.siblingSpouses]).toEqual(["inlaw"]);
    const lit = spotlightPeople(spotlight);
    // A sibling's children, an ancestor's sibling, a partner's sibling and a
    // parent's other partner all stay dark.
    for (const id of ["niece", "uncle", "partnersbrother"])
      expect(lit.has(id)).toBe(false);
  });

  it("keeps a parent's other partner on the line, not as a sibling's spouse", () => {
    const spotlight = personSpotlight("me", family);
    expect(spotlight.line.has("stepmum")).toBe(true);
    expect(spotlight.siblingSpouses.has("stepmum")).toBe(false);
  });

  it("adds a stored sibling who shares no parent on the tree", () => {
    const spotlight = personSpotlight("me", [
      ...family,
      { from_person: "cousinish", to_person: "me", type: "sibling" },
    ]);
    expect(spotlight.siblings.has("cousinish")).toBe(true);
    expect([...spotlight.looseSiblings]).toEqual(["cousinish"]);
  });

  it("counts a stored sibling who also shares a parent once, and not as loose", () => {
    const spotlight = personSpotlight("me", [
      ...family,
      { from_person: "me", to_person: "elder", type: "sibling" },
    ]);
    expect([...spotlight.siblings].sort()).toEqual(["elder", "half"]);
    expect(spotlight.looseSiblings.size).toBe(0);
  });

  it("finds siblings from stored rows alone", () => {
    const spotlight = personSpotlight("me", [
      { from_person: "me", to_person: "a", type: "sibling" },
      { from_person: "b", to_person: "me", type: "sibling" },
    ]);
    expect([...spotlight.siblings].sort()).toEqual(["a", "b"]);
    expect([...spotlight.looseSiblings].sort()).toEqual(["a", "b"]);
  });

  it("keeps someone on the line when a sibling row also names them", () => {
    // A slip in the data: dad recorded as my sibling as well as my parent.
    const spotlight = personSpotlight("me", [
      ...family,
      { from_person: "me", to_person: "dad", type: "sibling" },
    ]);
    expect(spotlight.line.has("dad")).toBe(true);
    expect(spotlight.siblings.has("dad")).toBe(false);
  });

  it("keeps a sibling who married another sibling's partner a sibling", () => {
    const spotlight = personSpotlight("me", [
      ...family,
      { from_person: "half", to_person: "elder", type: "spouse" },
    ]);
    expect(spotlight.siblings.has("half")).toBe(true);
    expect(spotlight.siblingSpouses.has("half")).toBe(false);
  });

  it("finds no siblings for an only child", () => {
    const spotlight = personSpotlight("niece", family);
    expect(spotlight.siblings.size).toBe(0);
    expect(spotlight.siblingSpouses.size).toBe(0);
  });
});
