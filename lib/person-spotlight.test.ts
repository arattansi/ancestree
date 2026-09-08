import { describe, expect, it } from "vitest";

import { personSpotlight } from "@/lib/person-spotlight";

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
    const { people } = personSpotlight("me", relationships);
    for (const id of ["me", "dad", "mum", "grandad", "granny", "kid"])
      expect(people.has(id)).toBe(true);
  });

  it("lights the partners of everyone on the line", () => {
    expect(personSpotlight("me", relationships).people.has("partner")).toBe(
      true,
    );
  });

  it("leaves the branches beside the line dark", () => {
    const { people } = personSpotlight("me", relationships);
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
    const { people, ancestors, descendants } = personSpotlight("me", []);
    expect([...people]).toEqual(["me"]);
    expect(ancestors).toBe(0);
    expect(descendants).toBe(0);
  });
});
