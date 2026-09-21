import { describe, expect, it } from "vitest";

import { connectionLabel, connectionPath } from "@/lib/connection-path";

// grandad — granny                    stranger
//        |
//       dad — mum      uncle — aunt
//        |                |
//       me — partner     cousin
//        |                |
//       kid             cousinKid
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
  { from_person: "cousin", to_person: "cousinKid", type: "parent" },
  { from_person: "grandad", to_person: "granny", type: "spouse" },
  { from_person: "dad", to_person: "mum", type: "spouse" },
  { from_person: "uncle", to_person: "aunt", type: "spouse" },
  { from_person: "me", to_person: "partner", type: "spouse" },
  { from_person: "stranger", to_person: "strangersKid", type: "parent" },
];

const label = (a: string, b: string, rels = relationships) => {
  const path = connectionPath(a, b, rels);
  return path ? connectionLabel(path, rels) : null;
};

describe("connectionPath", () => {
  it("walks up to the shared ancestor and back down", () => {
    const path = connectionPath("me", "cousin", relationships);
    expect(path?.people).toHaveLength(5);
    expect(path?.people[0]).toBe("me");
    expect(path?.people[1]).toBe("dad");
    expect(path?.people[3]).toBe("uncle");
    expect(path?.people[4]).toBe("cousin");
    expect(path?.steps.map((s) => s.kind)).toEqual([
      "up",
      "up",
      "down",
      "down",
    ]);
  });

  it("lights the other half of the couple the chain turns round on", () => {
    const path = connectionPath("me", "cousin", relationships);
    const [apex] = path!.people.slice(2, 3);
    const other = apex === "grandad" ? "granny" : "grandad";
    expect(path?.coParents).toEqual([other]);
  });

  it("leaves a parent only one of them has out of it", () => {
    const path = connectionPath("me", "kid", relationships);
    expect(path?.people).toEqual(["me", "kid"]);
    expect(path?.coParents).toEqual([]);
  });

  it("crosses a marriage to reach someone who married in", () => {
    const path = connectionPath("me", "aunt", relationships);
    expect(path?.steps.map((s) => s.kind)).toEqual([
      "up",
      "up",
      "down",
      "spouse",
    ]);
  });

  it("goes through a shared parent rather than a stored sibling row", () => {
    const rels = [
      ...relationships,
      { from_person: "dad", to_person: "uncle", type: "sibling" },
    ];
    expect(
      connectionPath("dad", "uncle", rels)?.steps.map((s) => s.kind),
    ).toEqual(["up", "down"]);
  });

  it("falls back on the sibling row when no parent joins them", () => {
    const rels = [{ from_person: "a", to_person: "b", type: "sibling" }];
    expect(connectionPath("a", "b", rels)?.steps).toEqual([
      { from: "a", to: "b", kind: "sibling" },
    ]);
  });

  it("finds nothing between people no chain joins", () => {
    expect(connectionPath("me", "stranger", relationships)).toBeNull();
    expect(connectionPath("me", "nobody", relationships)).toBeNull();
    expect(connectionPath("me", "me", relationships)).toBeNull();
  });
});

describe("connectionLabel", () => {
  it("names a direct line, elder first", () => {
    expect(label("me", "dad")).toBe("Parent & child");
    expect(label("kid", "dad")).toBe("Grandparent & grandchild");
    expect(label("granny", "kid")).toBe("Great-grandparent & great-grandchild");
  });

  it("names siblings, and half-siblings only when the tree can tell", () => {
    expect(label("dad", "uncle")).toBe("Siblings");
    const rels = [
      { from_person: "p", to_person: "a", type: "parent" },
      { from_person: "p", to_person: "b", type: "parent" },
    ];
    expect(label("a", "b", rels)).toBe("Siblings");
    expect(
      label("a", "b", [
        ...rels,
        { from_person: "q", to_person: "a", type: "parent" },
        { from_person: "r", to_person: "b", type: "parent" },
      ]),
    ).toBe("Half-siblings");
  });

  it("names aunts, uncles, nieces and nephews", () => {
    expect(label("me", "uncle")).toBe("Aunt or uncle & niece or nephew");
    expect(label("uncle", "kid")).toBe(
      "Grand-aunt or uncle & grand-niece or nephew",
    );
  });

  it("names cousins by degree and remove", () => {
    expect(label("me", "cousin")).toBe("First cousins");
    expect(label("kid", "cousin")).toBe("First cousins once removed");
    expect(label("kid", "cousinKid")).toBe("Second cousins");
  });

  it("says when the connection is by marriage", () => {
    expect(label("me", "partner")).toBe("Spouses");
    expect(label("partner", "dad")).toBe("Parent & child by marriage");
    expect(label("me", "aunt")).toBe(
      "Aunt or uncle & niece or nephew by marriage",
    );
  });

  it("uses the words a recorded sex picks, and neutral ones without", () => {
    const sexes: Record<string, string> = {
      me: "female",
      dad: "male",
      uncle: "male",
      aunt: "female",
      kid: "undisclosed",
    };
    const gendered = (a: string, b: string) =>
      connectionLabel(
        connectionPath(a, b, relationships)!,
        relationships,
        (id) => sexes[id],
      );
    expect(gendered("me", "dad")).toBe("Father & daughter");
    expect(gendered("dad", "kid")).toBe("Grandfather & grandchild");
    expect(gendered("me", "uncle")).toBe("Uncle & niece");
    expect(gendered("aunt", "me")).toBe("Aunt & niece by marriage");
    expect(gendered("uncle", "kid")).toBe("Grand-uncle & grand-niece or nephew");
    expect(gendered("dad", "uncle")).toBe("Brothers");
    expect(gendered("me", "cousin")).toBe("First cousins");
  });

  it("reads a stored sibling row as the parent it stands in for", () => {
    const rels = [
      { from_person: "a", to_person: "b", type: "sibling" },
      { from_person: "b", to_person: "bKid", type: "parent" },
    ];
    expect(label("a", "b", rels)).toBe("Siblings");
    expect(label("a", "bKid", rels)).toBe("Aunt or uncle & niece or nephew");
  });

  it("names two people who only share a child", () => {
    expect(label("uncle", "aunt", relationships.filter((r) => r.type !== "spouse")))
      .toBe("Parents of the same child");
  });
});
