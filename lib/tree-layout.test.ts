import { describe, expect, it } from "vitest";

import { layoutTree, type LayoutPerson } from "@/lib/tree-layout";

const person = (
  id: string,
  date_of_birth: string | null = null,
): LayoutPerson => ({ id, pos_x: null, pos_y: null, date_of_birth });

describe("layoutTree lateral ordering", () => {
  it("puts the elder partner of a couple on the left", () => {
    const pos = layoutTree(
      [person("younger", "1980-05-01"), person("elder", "1975-02-01")],
      [{ from_person: "younger", to_person: "elder", type: "spouse" }],
    );
    expect(pos.get("elder")!.x).toBeLessThan(pos.get("younger")!.x);
  });

  it("orders siblings oldest → youngest, left → right", () => {
    const pos = layoutTree(
      [
        person("parent"),
        person("mid", "1992-01-01"),
        person("oldest", "1988-01-01"),
        person("youngest", "1995-01-01"),
      ],
      [
        { from_person: "parent", to_person: "mid", type: "parent" },
        { from_person: "parent", to_person: "oldest", type: "parent" },
        { from_person: "parent", to_person: "youngest", type: "parent" },
      ],
    );
    expect(pos.get("oldest")!.x).toBeLessThan(pos.get("mid")!.x);
    expect(pos.get("mid")!.x).toBeLessThan(pos.get("youngest")!.x);
  });

  it("keeps a couple together when ordered among siblings", () => {
    // `sib` and `spouseA` share a parent set with nobody, but `sib` + `spouseA`
    // are siblings; `spouseA` is married to `spouseB`. The couple stays adjacent.
    const pos = layoutTree(
      [
        person("mum"),
        person("sib", "1990-01-01"),
        person("spouseA", "1985-01-01"),
        person("spouseB", "1999-01-01"),
      ],
      [
        { from_person: "mum", to_person: "sib", type: "parent" },
        { from_person: "mum", to_person: "spouseA", type: "parent" },
        { from_person: "spouseA", to_person: "spouseB", type: "spouse" },
      ],
    );
    const xs = ["spouseA", "spouseB", "sib"].map((id) => pos.get(id)!.x);
    // couple (spouseA elder → left, spouseB → right) sits before the lone sib
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });
});
