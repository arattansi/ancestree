import { describe, expect, it } from "vitest";

import {
  PET_DROP,
  PET_GAP,
  PET_H,
  PET_W,
  layoutPets,
  type LayoutPet,
} from "@/lib/pet-layout";
import { NODE_H, NODE_W, type XY } from "@/lib/tree-layout";

const pet = (
  id: string,
  companions: string[],
  extra: Partial<LayoutPet> = {},
): LayoutPet => ({
  id,
  companions,
  ...extra,
});

const people = (entries: Record<string, XY>) => new Map(Object.entries(entries));

/** `spouses` for `layoutPets`, from the pairs given. */
const married = (...pairs: [string, string][]) => {
  const map = new Map<string, string[]>();
  for (const [a, b] of pairs) {
    map.set(a, [...(map.get(a) ?? []), b]);
    map.set(b, [...(map.get(b) ?? []), a]);
  }
  return map;
};

describe("layoutPets", () => {
  it("centres a pet under its single companion, below the card", () => {
    const { positions } = layoutPets(
      [pet("p1", ["a"], { primary: "a" })],
      people({ a: { x: 100, y: 0 } }),
    );
    expect(positions.get("p1")).toEqual({
      x: 100 + NODE_W / 2 - PET_W / 2,
      y: NODE_H + PET_DROP,
    });
  });

  it("centres a couple's pet on the pair when the primary is married", () => {
    const { positions } = layoutPets(
      [pet("p1", ["a", "b"], { primary: "a" })],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }),
      { spouses: married(["a", "b"]) },
    );
    expect(positions.get("p1")?.x).toBe((0 + 300 + NODE_W) / 2 - PET_W / 2);
  });

  it("shares a pet with the primary's partner even if they aren't a companion", () => {
    const solo = layoutPets(
      [pet("p1", ["a"], { primary: "a" })],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }),
    );
    const shared = layoutPets(
      [pet("p1", ["a"], { primary: "a" })],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }),
      { spouses: married(["a", "b"]) },
    );
    // Alone, the chip centres on a's card; married, on the couple's span.
    expect(solo.positions.get("p1")?.x).toBe(NODE_W / 2 - PET_W / 2);
    expect(shared.positions.get("p1")?.x).toBe(
      (0 + 300 + NODE_W) / 2 - PET_W / 2,
    );
  });

  it("hangs the pet below its primary's row, not the lowest companion", () => {
    const { positions } = layoutPets(
      [pet("p1", ["a", "b"], { primary: "a" })],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 } }),
    );
    expect(positions.get("p1")?.y).toBe(NODE_H + PET_DROP);
  });

  it("leans towards a companion on another generation without leaving the primary", () => {
    const { autoPositions } = layoutPets(
      [pet("p1", ["a", "far"], { primary: "a" })],
      people({ a: { x: 0, y: 0 }, far: { x: 2000, y: 400 } }),
    );
    const chip = autoPositions.get("p1")!;
    const centre = chip.x + PET_W / 2;
    // Pulled to the right-hand edge of the primary's card, but no further.
    expect(centre).toBe(NODE_W);
    expect(centre).toBeGreaterThan(NODE_W / 2);
  });

  it("keeps the chip overlapping its primary's card however hard it is pulled", () => {
    for (const farX of [-5000, -300, 500, 5000]) {
      const { autoPositions } = layoutPets(
        [pet("p1", ["a", "far"], { primary: "a" })],
        people({ a: { x: 0, y: 0 }, far: { x: farX, y: 400 } }),
      );
      const chip = autoPositions.get("p1")!;
      expect(chip.x).toBeLessThan(NODE_W);
      expect(chip.x + PET_W).toBeGreaterThan(0);
    }
  });

  it("falls back to a stable companion when no primary is set", () => {
    const forwards = layoutPets(
      [pet("p1", ["a", "b"])],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 } }),
    );
    const backwards = layoutPets(
      [pet("p1", ["b", "a"])],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 } }),
    );
    // Topmost companion stands in, whichever order they arrive in.
    expect(forwards.autoPositions.get("p1")).toEqual(
      backwards.autoPositions.get("p1"),
    );
    expect(forwards.autoPositions.get("p1")!.y).toBe(NODE_H + PET_DROP);
  });

  it("falls back when the named primary is off the canvas", () => {
    const { autoPositions, orphaned } = layoutPets(
      [pet("p1", ["a"], { primary: "ghost" })],
      people({ a: { x: 0, y: 0 } }),
    );
    expect(orphaned).toEqual([]);
    expect(autoPositions.get("p1")!.x).toBe(NODE_W / 2 - PET_W / 2);
  });

  it("ignores a partner stranded on another row", () => {
    const { autoPositions } = layoutPets(
      [pet("p1", ["a"], { primary: "a" })],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 } }),
      { spouses: married(["a", "b"]) },
    );
    expect(autoPositions.get("p1")!.x).toBe(NODE_W / 2 - PET_W / 2);
  });

  it("sweeps chips on the same row apart without overlapping", () => {
    const { autoPositions } = layoutPets(
      [pet("p1", ["a"]), pet("p2", ["a"]), pet("p3", ["a"])],
      people({ a: { x: 0, y: 0 } }),
    );
    const xs = ["p1", "p2", "p3"]
      .map((id) => autoPositions.get(id)!.x)
      .sort((m, n) => m - n);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(PET_W + PET_GAP);
    expect(xs[2] - xs[1]).toBeGreaterThanOrEqual(PET_W + PET_GAP);
  });

  it("keeps a swept row centred on where it wanted to sit", () => {
    const centre = NODE_W / 2;
    const { autoPositions } = layoutPets(
      [pet("p1", ["a"]), pet("p2", ["a"])],
      people({ a: { x: 0, y: 0 } }),
    );
    const mid =
      (autoPositions.get("p1")!.x + autoPositions.get("p2")!.x) / 2 + PET_W / 2;
    expect(mid).toBeCloseTo(centre);
  });

  it("leaves pets on other rows alone", () => {
    const { autoPositions } = layoutPets(
      [pet("p1", ["a"]), pet("p2", ["b"])],
      people({ a: { x: 0, y: 0 }, b: { x: 0, y: 500 } }),
    );
    expect(autoPositions.get("p1")!.x).toBe(autoPositions.get("p2")!.x);
    expect(autoPositions.get("p2")!.y).toBe(500 + NODE_H + PET_DROP);
  });

  it("applies a manual nudge on top of the computed spot", () => {
    const { positions, autoPositions } = layoutPets(
      [pet("p1", ["a"], { pos_dx: 40, pos_dy: -12 })],
      people({ a: { x: 0, y: 0 } }),
    );
    expect(positions.get("p1")!.x).toBe(autoPositions.get("p1")!.x + 40);
    expect(positions.get("p1")!.y).toBe(autoPositions.get("p1")!.y - 12);
  });

  it("reports a pet whose companions are all off the canvas", () => {
    const { positions, orphaned } = layoutPets(
      [pet("p1", ["ghost"])],
      people({ a: { x: 0, y: 0 } }),
    );
    expect(orphaned).toEqual(["p1"]);
    expect(positions.has("p1")).toBe(false);
  });

  it("never places a chip taller than the gap it sits in", () => {
    // The chip has to fit between one generation's cards and the next.
    expect(PET_DROP + PET_H).toBeLessThan(132);
  });
});
