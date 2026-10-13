import { describe, expect, it } from "vitest";

import {
  DOT_SIZES,
  EDGE,
  leafWidth,
  NAME_H,
  NAME_W,
  orbitLayout,
  orbitLines,
  type OrbitDot,
  type OrbitGroups,
  type OrbitLayout,
} from "@/lib/leaf-orbit";
import { BLADE_OVERHANG } from "@/lib/leaf-shapes";

/** An iPhone 15's screen, less the header and the bars. */
const PHONE = { width: 393, height: 600 };
/** An iPhone SE's. */
const SMALL = { width: 375, height: 470 };

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

const family = (counts: Partial<Record<keyof OrbitGroups, number>>): OrbitGroups => ({
  parents: ids("p", counts.parents ?? 0),
  children: ids("c", counts.children ?? 0),
  spouses: ids("s", counts.spouses ?? 0),
  siblings: ids("b", counts.siblings ?? 0),
});

const of = (layout: OrbitLayout, side: OrbitDot["side"]) =>
  layout.dots.filter((d) => d.side === side);

/** Where the blade may reach: its box, and a maple's lobes above and below. */
function bladeOf({ leaf }: OrbitLayout) {
  const overhang = (BLADE_OVERHANG * leaf.width) / 208;
  return {
    left: leaf.x + leaf.width * 0.22,
    right: leaf.x + leaf.width,
    top: leaf.y - overhang,
    bottom: leaf.y + leaf.height + overhang,
  };
}

/** A circle's box, with its name. */
function box(layout: OrbitLayout, d: OrbitDot) {
  const w = layout.named ? Math.max(layout.dot, NAME_W) : layout.dot;
  const name = layout.named ? NAME_H : 0;
  const top = d.side === "parents" ? d.y - layout.dot / 2 - name : d.y - layout.dot / 2;
  return { left: d.x - w / 2, right: d.x + w / 2, top, bottom: top + layout.dot + name };
}

const overlap = (
  a: ReturnType<typeof box>,
  b: ReturnType<typeof box>,
) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

function expectTidy(layout: OrbitLayout, frame: { width: number; height: number }) {
  const boxes = layout.dots.map((d) => box(layout, d));
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.right).toBeLessThanOrEqual(frame.width - EDGE + 0.01);
    expect(b.top).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.bottom).toBeLessThanOrEqual(frame.height - EDGE + 0.01);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i], boxes[j])).toBe(false);
  // Nobody sits on the leaf's blade (its stem's start is the spouses' column),
  // lobes and all, and the lobes stay on the screen.
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
    for (const d of of(layout, "spouses")) expect(d.x).toBeLessThan(leaf.x + 1);
    for (const d of of(layout, "siblings")) expect(d.x).toBeGreaterThan(leaf.x + leaf.width);
    // One spouse sits level with the leaf's middle, where its stem points.
    expect(of(layout, "spouses")[0].y).toBeCloseTo(midY - NAME_H / 2);
    expect(layout.dot).toBe(DOT_SIZES[0].dot);
    expectTidy(layout, PHONE);
  });

  it("keeps the leaf one size whoever is on it", () => {
    const alone = orbitLayout(PHONE, family({}));
    const crowded = orbitLayout(PHONE, family({ parents: 2, children: 9, siblings: 12 }));
    expect(crowded.leaf.width).toBe(alone.leaf.width);
    expect(alone.leaf.width).toBe(leafWidth(PHONE.width, PHONE.height));
  });

  it("uses one smaller size for everyone when a group needs it", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, siblings: 6 }));
    expect(layout.dot).toBeLessThan(DOT_SIZES[0].dot);
    expect(of(layout, "siblings")).toHaveLength(6);
    expect(layout.dots.every((d) => d.more === 0)).toBe(true);
    expectTidy(layout, PHONE);
  });

  it("stands one circle in for the rest of a group too big for any size", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 20, siblings: 30 }));
    const kids = of(layout, "children");
    const more = kids.filter((d) => d.id === null);
    expect(more).toHaveLength(1);
    expect(kids.filter((d) => d.id).length + more[0].more).toBe(20);
    const sibs = of(layout, "siblings");
    expect(sibs.filter((d) => d.id).length + sibs.find((d) => !d.id)!.more).toBe(30);
    expect(layout.named).toBe(false);
    expectTidy(layout, PHONE);
  });

  it("fits a small phone", () => {
    for (const counts of [
      { parents: 2, children: 3, spouses: 2, siblings: 4 },
      { parents: 4, children: 8, spouses: 3, siblings: 9 },
      { siblings: 1 },
    ]) {
      expectTidy(orbitLayout(SMALL, family(counts)), SMALL);
    }
  });

  it("shows everyone it can and loses nobody", () => {
    for (let n = 0; n <= 25; n++) {
      const layout = orbitLayout(PHONE, family({ parents: 2, children: n, spouses: 1, siblings: n }));
      for (const side of ["children", "siblings"] as const) {
        const dots = of(layout, side);
        const counted = dots.reduce((sum, d) => sum + (d.id ? 1 : d.more), 0);
        expect(counted).toBe(n);
      }
      expectTidy(layout, PHONE);
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
  const touches = (segments: readonly (readonly number[])[], p: { x: number; y: number }) =>
    segments.some(
      ([x1, y1, x2, y2]) =>
        (Math.abs(x1 - p.x) < 0.01 && Math.abs(y1 - p.y) < 0.01) ||
        (Math.abs(x2 - p.x) < 0.01 && Math.abs(y2 - p.y) < 0.01),
    );

  it("runs a line to every circle, and every side's from its anchor", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 3, spouses: 2, siblings: 4 }));
    const anchors = anchorsOf(layout);
    const segments = orbitLines(layout, anchors);
    for (const d of layout.dots) expect(touches(segments, d)).toBe(true);
    for (const side of ["parents", "children", "siblings"] as const)
      expect(touches(segments, anchors[side])).toBe(true);
  });

  it("draws only straight runs, across or down", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 9, spouses: 1, siblings: 12 }));
    for (const [x1, y1, x2, y2] of orbitLines(layout, anchorsOf(layout)))
      expect(x1 === x2 || y1 === y2).toBe(true);
  });

  it("keeps every bar off the names", () => {
    const layout = orbitLayout(PHONE, family({ parents: 2, children: 3, spouses: 2, siblings: 3 }));
    const names = layout.dots.map((d) => {
      const top = d.side === "parents" ? d.y - layout.dot / 2 - NAME_H : d.y + layout.dot / 2;
      return { left: d.x - NAME_W / 2, right: d.x + NAME_W / 2, top, bottom: top + NAME_H };
    });
    for (const [x1, y1, x2, y2] of orbitLines(layout, anchorsOf(layout))) {
      for (const n of names) {
        const crosses =
          Math.max(x1, x2) > n.left + 18 &&
          Math.min(x1, x2) < n.right - 18 &&
          Math.max(y1, y2) > n.top &&
          Math.min(y1, y2) < n.bottom;
        expect(crosses).toBe(false);
      }
    }
  });

  it("keeps the rows' bars off a maple's lobes", () => {
    for (const frame of [PHONE, SMALL]) {
      const layout = orbitLayout(frame, family({ parents: 2, children: 3 }));
      const blade = bladeOf(layout);
      const bars = orbitLines(layout, anchorsOf(layout)).filter(
        ([x1, y1, x2, y2]) => y1 === y2 && x1 !== x2,
      );
      expect(bars).toHaveLength(2);
      for (const [, y] of bars)
        expect(y < blade.top || y > blade.bottom).toBe(true);
    }
  });

  it("never crosses one group's lines with another's", () => {
    for (const counts of [
      { parents: 2, children: 3, spouses: 2, siblings: 4 },
      { parents: 2, children: 12, spouses: 1, siblings: 14 },
      { parents: 4, children: 8, spouses: 3, siblings: 9 },
    ]) {
      for (const frame of [PHONE, SMALL]) {
        const layout = orbitLayout(frame, family(counts));
        const anchors = anchorsOf(layout);
        const bySide = (["parents", "children", "spouses", "siblings"] as const).map((side) =>
          orbitLines({ ...layout, dots: layout.dots.filter((d) => d.side === side) }, anchors),
        );
        const cross = (
          [ax1, ay1, ax2, ay2]: readonly number[],
          [bx1, by1, bx2, by2]: readonly number[],
        ) =>
          Math.max(ax1, ax2) >= Math.min(bx1, bx2) &&
          Math.max(bx1, bx2) >= Math.min(ax1, ax2) &&
          Math.max(ay1, ay2) >= Math.min(by1, by2) &&
          Math.max(by1, by2) >= Math.min(ay1, ay2);
        for (let i = 0; i < bySide.length; i++)
          for (let j = i + 1; j < bySide.length; j++)
            for (const a of bySide[i])
              for (const b of bySide[j]) expect(cross(a, b)).toBe(false);
      }
    }
  });
});
