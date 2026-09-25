import { describe, expect, it } from "vitest";

import {
  buildChainEdges,
  coParentSelection,
  flowEdges,
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

describe("flowEdges", () => {
  const partner = { id: "partner", label: "Partner", isDivorced: false };
  const ex = { id: "ex", label: "Ex", isDivorced: true };
  const members = [
    { id: "anchor", parents: [{ id: "mum" }, { id: "dad" }], partners: [partner, ex] },
    { id: "cousin", partners: [{ id: "cousins-wife", label: "W", isDivorced: false }] },
  ];
  const existing = (id: string): PersonRef => ({ kind: "existing", id });
  const inBetween: PersonRef = { kind: "new", index: 1 };
  const base = { anchorId: "anchor", inBetween: 0, extraLinks: [], members };

  it("draws nothing when the entry isn't chained to anyone", () => {
    expect(flowEdges({ ...base, anchorId: "", links: [{ kind: "child" }] })).toEqual([]);
  });

  it("gives a new child the anchor's current partner too, until unticked", () => {
    expect(flowEdges({ ...base, links: [{ kind: "child" }] })).toEqual([
      { type: "parent", a: existing("anchor"), b: primary },
      { type: "parent", a: existing("partner"), b: primary },
    ]);
    expect(flowEdges({ ...base, links: [{ kind: "child", coParentIds: [] }] })).toEqual([
      { type: "parent", a: existing("anchor"), b: primary },
    ]);
  });

  it("links a new sibling to the anchor's parents only when asked", () => {
    expect(flowEdges({ ...base, links: [{ kind: "sibling", linkToParents: true }] })).toEqual([
      { type: "sibling", a: existing("anchor"), b: primary },
      { type: "parent", a: existing("mum"), b: primary },
      { type: "parent", a: existing("dad"), b: primary },
    ]);
    expect(flowEdges({ ...base, links: [{ kind: "sibling" }] })).toEqual([
      { type: "sibling", a: existing("anchor"), b: primary },
    ]);
  });

  it("hangs co-parents on the first person in the chain, not the new entry", () => {
    expect(
      flowEdges({ ...base, inBetween: 1, links: [{ kind: "child" }, { kind: "parent" }] }),
    ).toEqual([
      { type: "parent", a: existing("anchor"), b: inBetween },
      { type: "parent", a: primary, b: inBetween },
      { type: "parent", a: existing("partner"), b: inBetween },
    ]);
  });

  it("gives each spouse line its own link's dates", () => {
    const dates = (link: { marriage?: string }) => ({ marriage_date: link.marriage ?? null });
    expect(
      flowEdges({
        ...base,
        links: [{ kind: "spouse", marriage: "1990-01-01" }],
        extraLinks: [
          { targetId: "cousin", kind: "spouse", marriage: "2001-02-03" },
          { targetId: "", kind: "child" },
        ],
        spouseFields: dates,
      }),
    ).toEqual([
      { type: "spouse", a: existing("anchor"), b: primary, marriage_date: "1990-01-01" },
      { type: "spouse", a: existing("cousin"), b: primary, marriage_date: "2001-02-03" },
    ]);
  });

  it("adds further connections after the chain, with their ticked partners", () => {
    expect(
      flowEdges({
        ...base,
        links: [{ kind: "spouse" }],
        extraLinks: [{ targetId: "cousin", kind: "child" }],
      }),
    ).toEqual([
      { type: "spouse", a: existing("anchor"), b: primary },
      { type: "parent", a: existing("cousin"), b: primary },
      { type: "parent", a: existing("cousins-wife"), b: primary },
    ]);
  });
});
