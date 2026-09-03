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

const people = (entries: Record<string, XY>) =>
  new Map(Object.entries(entries));

describe("layoutPets", () => {
  it("centres a pet under its single companion, below the card", () => {
    const { positions } = layoutPets(
      [pet("p1", ["a"])],
      people({ a: { x: 100, y: 0 } }),
    );
    expect(positions.get("p1")).toEqual({
      x: 100 + NODE_W / 2 - PET_W / 2,
      y: NODE_H + PET_DROP,
    });
  });

  it("centres a shared pet on the span of both companions", () => {
    const { positions } = layoutPets(
      [pet("p1", ["a", "b"])],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }),
    );
    expect(positions.get("p1")?.x).toBe((0 + 300 + NODE_W) / 2 - PET_W / 2);
  });

  it("hangs the pet below the lower companion when they are on different rows", () => {
    const { positions } = layoutPets(
      [pet("p1", ["a", "b"])],
      people({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 } }),
    );
    expect(positions.get("p1")?.y).toBe(400 + NODE_H + PET_DROP);
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
