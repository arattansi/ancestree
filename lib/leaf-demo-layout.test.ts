import { describe, expect, it } from "vitest";

import {
  addRelative,
  canRelate,
  demoLines,
  layoutDemo,
  type DemoPerson,
  type Relation,
} from "@/lib/leaf-demo-layout";
import { COUPLE_GAP, GUTTER, NODE_W, ROW_H } from "@/lib/tree-dimensions";

const P = (first: string) => ({ first, last: "X", place: "" });
const ROOT: DemoPerson[] = [
  { ...P("Rumi"), id: "rumi", parents: [], partner: null, siblingOf: null },
];
const SAMPLE = [
  ["rene", "partner", "rumi"],
  ["andre", "child", "rumi"],
  ["frida", "sibling", "andre"],
].reduce(
  (people, [id, rel, of]) =>
    addRelative(people, P(id), id, rel as Relation, of),
  ROOT,
);

/** No two leaves in a row closer than the couple gap. */
function noOverlap(people: DemoPerson[]) {
  const cards = [...layoutDemo(people).cards.values()];
  for (const a of cards)
    for (const b of cards)
      if (a !== b && a.y === b.y)
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(NODE_W + COUPLE_GAP);
}

describe("leaf demo layout", () => {
  it("lays the sample out as a couple and their two children", () => {
    const { cards } = layoutDemo(SAMPLE);
    expect(cards.get("rumi")!.y).toBe(0);
    expect(cards.get("rene")!.x - cards.get("rumi")!.x).toBe(
      NODE_W + COUPLE_GAP,
    );
    expect(cards.get("andre")!.y).toBe(ROW_H);
    expect(cards.get("frida")!.x - cards.get("andre")!.x).toBe(NODE_W + GUTTER);
    // The children centred under the couple.
    const mid = cards.get("rumi")!.x + NODE_W + COUPLE_GAP / 2;
    expect((cards.get("andre")!.x + cards.get("frida")!.x + NODE_W) / 2).toBe(
      mid,
    );
  });

  it("makes a child the couple's, and a sibling share parents", () => {
    expect(SAMPLE.find((p) => p.id === "andre")!.parents).toEqual([
      "rumi",
      "rene",
    ]);
    expect(SAMPLE.find((p) => p.id === "frida")!.parents).toEqual([
      "rumi",
      "rene",
    ]);
    expect(SAMPLE.find((p) => p.id === "rumi")!.partner).toBe("rene");
  });

  it("allows one partner each", () => {
    expect(canRelate(SAMPLE, "partner", "rumi")).toBe(false);
    expect(canRelate(SAMPLE, "partner", "andre")).toBe(true);
    expect(canRelate(SAMPLE, "child", "rumi")).toBe(true);
  });

  const cases: [Relation, string][] = [];
  for (const rel of ["partner", "child", "sibling"] as Relation[])
    for (const of of ["rumi", "rene", "andre", "frida"])
      if (canRelate(SAMPLE, rel, of)) cases.push([rel, of]);

  it.each(cases)(
    "keeps leaves apart adding a %s of %s, then anything",
    (rel, of) => {
      const one = addRelative(SAMPLE, P("A"), "a", rel, of);
      noOverlap(one);
      for (const rel2 of ["partner", "child", "sibling"] as Relation[])
        for (const of2 of one.map((p) => p.id))
          if (canRelate(one, rel2, of2)) {
            const two = addRelative(one, P("B"), "b", rel2, of2);
            noOverlap(two);
            const { cards, bounds } = layoutDemo(two);
            expect(cards.size).toBe(6);
            for (const c of cards.values()) {
              expect(c.x).toBeGreaterThanOrEqual(bounds.left);
              expect(c.x + c.w).toBeLessThanOrEqual(bounds.left + bounds.width);
            }
            const lines = demoLines(two, cards);
            // Every partner pairing drawn once, every child given a branch.
            expect(lines.couples).toHaveLength(
              two.filter((p) => p.partner).length / 2,
            );
            expect(lines.branches).toHaveLength(
              two.filter((p) => p.parents.length).length,
            );
          }
    },
  );

  it("puts a parentless sibling outside the couple, under a bracket", () => {
    const left = addRelative(SAMPLE, P("S"), "s", "sibling", "rumi");
    const { cards } = layoutDemo(left);
    expect(cards.get("s")!.x).toBeLessThan(cards.get("rumi")!.x);
    expect(demoLines(left, cards).brackets).toHaveLength(1);
    const right = addRelative(SAMPLE, P("S"), "s", "sibling", "rene");
    expect(layoutDemo(right).cards.get("s")!.x).toBeGreaterThan(
      layoutDemo(right).cards.get("rene")!.x,
    );
  });
});
