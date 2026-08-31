import { describe, expect, it } from "vitest";

import { buildChainEdges, type PersonRef } from "@/lib/connections";

const primary: PersonRef = { kind: "new", index: 0 };

describe("buildChainEdges", () => {
  it("emits a directed parent edge for 'child of' the anchor", () => {
    expect(buildChainEdges("anchor", [primary], ["child"])).toEqual([
      { type: "parent", a: { kind: "existing", id: "anchor" }, b: primary },
    ]);
  });

  it("emits an undirected sibling edge for 'sibling of' the anchor", () => {
    expect(buildChainEdges("anchor", [primary], ["sibling"])).toEqual([
      { type: "sibling", a: { kind: "existing", id: "anchor" }, b: primary },
    ]);
  });

  it("keeps one edge per link, in order, through in-between people", () => {
    const inBetween: PersonRef = { kind: "new", index: 1 };
    const edges = buildChainEdges(
      "anchor",
      [inBetween, primary],
      ["sibling", "parent"],
    );
    expect(edges).toEqual([
      { type: "sibling", a: { kind: "existing", id: "anchor" }, b: inBetween },
      // primary is a parent of the in-between person
      { type: "parent", a: primary, b: inBetween },
    ]);
  });
});
