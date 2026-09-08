import { describe, expect, it } from "vitest";

import {
  buildChainEdges,
  coParentSelection,
  type PersonRef,
} from "@/lib/connections";

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

describe("coParentSelection", () => {
  const roshen = { id: "roshen", label: "Roshen", isDivorced: false };
  const ex = { id: "ex", label: "Mina", isDivorced: true };

  it("offers every current partner until the member says otherwise", () => {
    expect(coParentSelection(null, [roshen])).toEqual(["roshen"]);
  });

  it("never pre-ticks a former partner", () => {
    expect(coParentSelection(null, [roshen, ex])).toEqual(["roshen"]);
  });

  it("respects an explicit empty selection", () => {
    expect(coParentSelection([], [roshen])).toEqual([]);
  });

  it("keeps a former partner the member ticked on purpose", () => {
    expect(coParentSelection(["ex"], [roshen, ex])).toEqual(["ex"]);
  });

  it("drops a selected id that is no longer a partner", () => {
    expect(coParentSelection(["gone", "roshen"], [roshen])).toEqual(["roshen"]);
  });

  it("offers nothing when the parent has no partners", () => {
    expect(coParentSelection(null, [])).toEqual([]);
  });
});
