import { describe, expect, it } from "vitest";

import {
  EDGE,
  leafWidth,
  orbitLayout,
  orbitLines,
  PILL_SIZES,
  type OrbitGroups,
  type OrbitLayout,
  type OrbitPill,
} from "@/lib/leaf-orbit";
import { BLADE_OVERHANG } from "@/lib/leaf-shapes";

/** An iPhone 15's screen, less the header and the bars. */
const PHONE = { width: 393, height: 600 };
/** An iPhone SE's. */
const SMALL = { width: 375, height: 470 };
/** An iPhone Pro Max's. */
const LARGE = { width: 440, height: 700 };

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const family = (counts: Partial<Record<keyof OrbitGroups, number>>): OrbitGroups => ({
  parents: ids("p", counts.parents ?? 0),
  children: ids("c", counts.children ?? 0),
  spouses: ids("s", counts.spouses ?? 0),
  siblings: ids("b", counts.siblings ?? 0),
});

const of = (layout: OrbitLayout, side: OrbitPill["side"]) =>
  layout.pills.filter((d) => d.side === side);

/** Where the blade may reach: its box, and a maple's lobes above and below. */
function bladeOf({ leaf }: OrbitLayout) {
  const overhang = (BLADE_OVERHANG * leaf.width) / 208;
  return {
    left: leaf.x,
    right: leaf.x + leaf.width,
    top: leaf.y - overhang,
    bottom: leaf.y + leaf.height + overhang,
  };
}

/** A pill's box. */
function box(layout: OrbitLayout, d: OrbitPill) {
  const { width, height } = layout.pill;
  return {
    left: d.x - width / 2,
    right: d.x + width / 2,
    top: d.y - height / 2,
    bottom: d.y + height / 2,
  };
}

type Box = ReturnType<typeof box>;

const overlap = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function expectTidy(layout: OrbitLayout, frame: { width: number; height: number }) {
  const boxes = layout.pills.map((d) => box(layout, d));
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.right).toBeLessThanOrEqual(frame.width - EDGE + 0.01);
    expect(b.top).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.bottom).toBeLessThanOrEqual(frame.height - EDGE + 0.01);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i], boxes[j])).toBe(false);
  // Nobody sits on the leaf, stem, lobes and all, and the lobes stay on the
  // screen.
  const blade = bladeOf(layout);
  for (const b of boxes) expect(overlap(b, blade)).toBe(false);
  expect(blade.top).toBeGreaterThanOrEqual(EDGE - 0.01);
  expect(blade.bottom).toBeLessThanOrEqual(frame.height - EDGE + 0.01);
}

describe("orbitLayout", () => {
  it("puts parents above, children below, spouses left, siblings right", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 2, spouses: 1, siblings: 2 }));
    const { leaf } = layout;
    const midY = leaf.y + leaf.height / 2;
    for (const d of of(layout, "parents")) expect(d.y).toBeLessThan(leaf.y);
    for (const d of of(layout, "children")) expect(d.y).toBeGreaterThan(leaf.y + leaf.height);
    for (const d of of(layout, "spouses")) expect(d.x).toBeLessThan(leaf.x);
    for (const d of of(layout, "siblings")) expect(d.x).toBeGreaterThan(leaf.x + leaf.width);
    // One spouse sits level with the leaf's middle, where its stem points.
    expect(of(layout, "spouses")[0].y).toBeCloseTo(midY);
    expect(layout.pill).toEqual(PILL_SIZES[0]);
    expectTidy(layout, PHONE);
  });

  it("keeps the leaf under half the screen, one size whoever is on it", () => {
    const alone = orbitLayout(PHONE, family({}));
    const crowded = orbitLayout(PHONE, family({ parents: 2, children: 9, siblings: 12 }));
    expect(crowded.leaf.width).toBe(alone.leaf.width);
    expect(alone.leaf.width).toBe(leafWidth(PHONE.width, PHONE.height));
    for (const frame of [PHONE, SMALL, LARGE])
      expect(leafWidth(frame.width, frame.height)).toBeLessThan(frame.width / 2);
  });

  it("uses one smaller size for everyone when a group needs it", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 4 }));
    expect(layout.pill.width).toBeLessThan(PILL_SIZES[0].width);
    expect(of(layout, "children")).toHaveLength(4);
    expect(layout.pills.every((d) => d.more === 0)).toBe(true);
    expectTidy(layout, PHONE);
  });

  it("stands one pill in for the rest of a group too big for any size", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 20, siblings: 30 }));
    const kids = of(layout, "children");
    const more = kids.filter((d) => d.id === null);
    expect(more).toHaveLength(1);
    expect(kids.filter((d) => d.id).length + more[0].more).toBe(20);
    const sibs = of(layout, "siblings");
    expect(sibs.filter((d) => d.id).length + sibs.find((d) => !d.id)!.more).toBe(30);
    expect(layout.pill).toEqual(PILL_SIZES[PILL_SIZES.length - 1]);
    expectTidy(layout, PHONE);
  });

  it("fits a small phone and a large one", () => {
    for (const frame of [SMALL, LARGE]) {
      for (const counts of [
        { parents: 2, children: 3, spouses: 2, siblings: 4 },
        { parents: 4, children: 8, spouses: 3, siblings: 9 },
        { siblings: 1 },
      ]) {
        expectTidy(orbitLayout(frame, family(counts)), frame);
      }
    }
  });

  it("shows everyone it can and loses nobody", () => {
    for (let n = 0; n <= 25; n++) {
      const layout = orbitLayout(PHONE, family({ parents: 2, children: n, spouses: 1, siblings: n }));
      for (const side of ["children", "siblings"] as const) {
        const pills = of(layout, side);
        const counted = pills.reduce((sum, d) => sum + (d.id ? 1 : d.more), 0);
        expect(counted).toBe(n);
      }
      expectTidy(layout, PHONE);
    }
  });
});

describe("orbitLayout asking for a first parent or child (Step 187)", () => {
  const BOTH = { parents: true, children: true };
  const asked = (layout: OrbitLayout) => layout.pills.filter((p) => p.add);

  it("puts a pill in each empty row asked for, in the middle, with no one on it", () => {
    const layout = orbitLayout(PHONE, family({ spouses: 1, siblings: 2 }), BOTH);
    const [up, down] = [of(layout, "parents"), of(layout, "children")];
    expect(up).toEqual([expect.objectContaining({ id: null, more: 0, add: true })]);
    expect(down).toEqual([expect.objectContaining({ id: null, more: 0, add: true })]);
    const { leaf } = layout;
    expect(up[0].y).toBeLessThan(leaf.y);
    expect(down[0].y).toBeGreaterThan(leaf.y + leaf.height);
    expect(up[0].x).toBeCloseTo(leaf.x + leaf.width / 2);
    expect(down[0].x).toBeCloseTo(leaf.x + leaf.width / 2);
    expectTidy(layout, PHONE);
  });

  it("takes the place a lone relative would", () => {
    const asking = orbitLayout(PHONE, family({ siblings: 1 }), BOTH);
    const one = orbitLayout(PHONE, family({ parents: 1, children: 1, siblings: 1 }));
    expect(asking.leaf).toEqual(one.leaf);
    expect(asking.pill).toEqual(one.pill);
    for (const side of ["parents", "children"] as const) {
      const [a, b] = [of(asking, side)[0], of(one, side)[0]];
      expect([a.x, a.y]).toEqual([b.x, b.y]);
    }
  });

  it("asks nothing of a row that has someone in it", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 3 }), BOTH);
    expect(asked(layout)).toEqual([]);
    expect(layout).toEqual(orbitLayout(PHONE, family({ parents: 2, children: 3 })));
  });

  it("asks only for the rows it's told to", () => {
    const up = orbitLayout(PHONE, family({}), { parents: true, children: false });
    expect(asked(up).map((p) => p.side)).toEqual(["parents"]);
    const down = orbitLayout(PHONE, family({ parents: 2 }), { parents: true, children: true });
    expect(asked(down).map((p) => p.side)).toEqual(["children"]);
    expect(orbitLayout(PHONE, family({}), { parents: false, children: false })).toEqual(
      orbitLayout(PHONE, family({})),
    );
  });

  it("fits a small phone and a large one, crowded columns and all", () => {
    for (const frame of [SMALL, PHONE, LARGE]) {
      for (const counts of [
        {},
        { spouses: 3, siblings: 9 },
        { parents: 2, spouses: 1, siblings: 12 },
        { children: 8, siblings: 30 },
      ]) {
        expectTidy(orbitLayout(frame, family(counts), BOTH), frame);
      }
    }
  });
});

describe("orbitLines", () => {
  const anchorsOf = (layout: OrbitLayout) => {
    const { x, y, width, height } = layout.leaf;
    return {
      parents: { x: x + width / 2, y: y + height * 0.2 },
      children: { x: x + width / 2, y: y + height * 0.8 },
      spouses: { x, y: y + height / 2 },
      siblings: { x: x + width * 0.95, y: y + height / 2 },
    };
  };
  type XY = { x: number; y: number };
  const same = (a: XY, b: XY) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

  it("runs a line from the group's anchor to the near edge of every pill", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 3, spouses: 2, siblings: 4 }));
    const anchors = anchorsOf(layout);
    const lines = orbitLines(layout, anchors);
    expect(lines).toHaveLength(layout.pills.length);
    const { width: w, height: h } = layout.pill;
    for (const p of layout.pills) {
      const line = lines.find((l) => l.side === p.side && l.id === p.id)!;
      expect(same(line.points[0], anchors[p.side])).toBe(true);
      const end = line.points[line.points.length - 1];
      const edge =
        p.side === "parents"
          ? { x: p.x, y: p.y + h / 2 }
          : p.side === "children"
            ? { x: p.x, y: p.y - h / 2 }
            : p.side === "siblings"
              ? { x: p.x - w / 2, y: p.y }
              : { x: p.x + w / 2, y: p.y };
      expect(same(end, edge)).toBe(true);
    }
  });

  it("goes only across or down, with no corner in the middle of a run", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 9, spouses: 2, siblings: 12 }));
    for (const { points } of orbitLines(layout, anchorsOf(layout))) {
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        expect(a.x === b.x || a.y === b.y).toBe(true);
        expect(same(a, b)).toBe(false);
        if (i >= 2) {
          const z = points[i - 2];
          expect((z.x === a.x && a.x === b.x) || (z.y === a.y && a.y === b.y)).toBe(false);
        }
      }
    }
  });

  it("leaves room to round every corner", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 3, spouses: 2, siblings: 3 }));
    for (const { points } of orbitLines(layout, anchorsOf(layout))) {
      for (let i = 1; i < points.length; i++) {
        const run = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        // Half a run is the most a corner may take at either end.
        expect(run).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("keeps the rows' bars off a maple's lobes", () => {
    for (const frame of [PHONE, SMALL]) {
      const layout = orbitLayout(frame, family({ parents: 2, children: 3 }));
      const blade = bladeOf(layout);
      for (const { points } of orbitLines(layout, anchorsOf(layout))) {
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1], points[i]];
          if (a.y !== b.y) continue;
          expect(a.y < blade.top || a.y > blade.bottom).toBe(true);
        }
      }
    }
  });

  it("runs a line to a pill asking for a first relative, marked as such", () => {
    const layout = orbitLayout(PHONE, family({ siblings: 2 }), { parents: true, children: true });
    const anchors = anchorsOf(layout);
    const lines = orbitLines(layout, anchors);
    const { height: h } = layout.pill;
    for (const side of ["parents", "children"] as const) {
      const p = layout.pills.find((d) => d.side === side)!;
      const line = lines.find((l) => l.side === side)!;
      expect(line.add).toBe(true);
      expect(same(line.points[0], anchors[side])).toBe(true);
      const end = line.points[line.points.length - 1];
      expect(same(end, { x: p.x, y: p.y + (side === "parents" ? h / 2 : -h / 2) })).toBe(true);
    }
    expect(lines.filter((l) => l.side === "siblings").every((l) => !l.add)).toBe(true);
  });

  it("never runs a line through a pill", () => {
    for (const counts of [
      { parents: 2, children: 3, spouses: 2, siblings: 4 },
      { parents: 4, children: 8, spouses: 3, siblings: 9 },
    ]) {
      const layout = orbitLayout(PHONE, family(counts));
      for (const line of orbitLines(layout, anchorsOf(layout))) {
        for (const p of layout.pills) {
          const b = box(layout, p);
          // Inset, so a line ending on a pill's edge doesn't count.
          const inner = { left: b.left + 1, right: b.right - 1, top: b.top + 1, bottom: b.bottom - 1 };
          for (let i = 1; i < line.points.length; i++) {
            const [a, c] = [line.points[i - 1], line.points[i]];
            const seg = {
              left: Math.min(a.x, c.x),
              right: Math.max(a.x, c.x),
              top: Math.min(a.y, c.y),
              bottom: Math.max(a.y, c.y),
            };
            const crosses =
              seg.left <= inner.right &&
              inner.left <= seg.right &&
              seg.top <= inner.bottom &&
              inner.top <= seg.bottom;
            expect(crosses).toBe(false);
          }
        }
      }
    }
  });
});
