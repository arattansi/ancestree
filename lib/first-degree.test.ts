import { describe, expect, it } from "vitest";

import { firstDegree } from "@/lib/first-degree";

// grandad — granny
//        |
//       dad — mum     ex
//        |  \         |
//       me   brother  |
//        \____________|
//        |
//       kid
const relationships = [
  { from_person: "grandad", to_person: "dad", type: "parent" },
  { from_person: "granny", to_person: "dad", type: "parent" },
  { from_person: "dad", to_person: "me", type: "parent" },
  { from_person: "mum", to_person: "me", type: "parent" },
  { from_person: "dad", to_person: "brother", type: "parent" },
  { from_person: "me", to_person: "kid", type: "parent" },
  { from_person: "ex", to_person: "kid", type: "parent" },
  { from_person: "grandad", to_person: "granny", type: "spouse" },
  { from_person: "dad", to_person: "mum", type: "spouse" },
  { from_person: "ex", to_person: "me", type: "spouse" },
];

describe("firstDegree", () => {
  it("names parents, children, spouses and siblings, one line out", () => {
    expect(firstDegree("me", relationships)).toEqual({
      parents: ["dad", "mum"],
      children: ["kid"],
      spouses: ["ex"],
      siblings: ["brother"],
    });
  });

  it("goes no further than one line", () => {
    const dad = firstDegree("dad", relationships);
    expect(dad.parents).toEqual(["grandad", "granny"]);
    expect(dad.children).toEqual(["me", "brother"]);
    expect(dad.spouses).toEqual(["mum"]);
    expect(dad.siblings).toEqual([]);
  });

  it("counts a half-sibling by the one parent they share", () => {
    expect(firstDegree("brother", relationships).siblings).toEqual(["me"]);
  });

  it("takes siblings from stored rows, the whole group with no parent", () => {
    const rows = [
      { from_person: "a", to_person: "b", type: "sibling" },
      { from_person: "b", to_person: "c", type: "sibling" },
    ];
    expect(firstDegree("a", rows).siblings.sort()).toEqual(["b", "c"]);
  });

  it("shows someone once, as the first relation they fit", () => {
    const slip = [
      { from_person: "dad", to_person: "me", type: "parent" },
      { from_person: "dad", to_person: "me", type: "spouse" },
    ];
    expect(firstDegree("me", slip)).toEqual({
      parents: ["dad"],
      children: [],
      spouses: [],
      siblings: [],
    });
  });

  it("is empty for someone with no lines", () => {
    expect(firstDegree("stranger", relationships)).toEqual({
      parents: [],
      children: [],
      spouses: [],
      siblings: [],
    });
  });
});
