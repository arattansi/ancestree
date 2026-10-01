import { describe, expect, it } from "vitest";

import {
  inside,
  LEAF_SHAPES,
  leafGeometry,
  MIDRIB,
  polygons,
  type LeafShape,
} from "@/lib/leaf-shapes";
import { nativeLeaf } from "@/lib/native-leaf";

/**
 * Where a leaf's lines put ink, in blade-box units (the card is the box less
 * 19 top and bottom): the name, then a second line (a maiden name stops 110
 * px along), then a third, which is only ever a lifespan or "You · b. 1952".
 */
const LINES = [
  { right: 176, top: 63, bottom: 76 },
  { right: 162, top: 78, bottom: 87.5 },
  { right: 130, top: 90, bottom: 99.5 },
];

/**
 * The leaves Step 19 drew narrower than the longest lines: past x≈124 the
 * baobab is only its middle leaflet, and past x≈160 the flag's maple is only
 * its end lobe. A line that long is rare; it stops short there (`FitText`,
 * truncation), as it always has.
 */
const NARROW_TIPS: Partial<Record<LeafShape, number>> = {
  baobab: 121,
  maple: 160,
};

/** How far every point of each line's ink can be pushed before it leaves the blade. */
function clearance(shape: LeafShape): number {
  const geometry = leafGeometry(shape);
  const polys = polygons(geometry.blade);
  let worst = Infinity;
  for (const line of LINES) {
    const right = Math.min(line.right, NARROW_TIPS[shape] ?? Infinity);
    let fits = -1;
    for (let r = 0; r <= 3; r += 0.5) {
      let ok = true;
      for (let x = geometry.textLeft - r; x <= right + r && ok; x += 1) {
        for (let y = line.top - r; y <= line.bottom + r && ok; y += 0.5) {
          if (!inside(polys, { x, y })) ok = false;
        }
      }
      if (!ok) break;
      fits = r;
    }
    worst = Math.min(worst, fits);
  }
  return worst;
}

describe("leaf shapes", () => {
  it.each(LEAF_SHAPES)("%s keeps its lines inside the blade", (shape) => {
    expect(clearance(shape)).toBeGreaterThanOrEqual(0.5);
  });

  it.each(LEAF_SHAPES)("%s stays within its box", (shape) => {
    const points = polygons(leafGeometry(shape).blade).flat();
    for (const { x, y } of points) {
      // Never past the sides — the next card is a gutter away — and no
      // further above or below the card than the flag's maple has always
      // reached.
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(208.5);
      expect(y).toBeGreaterThanOrEqual(-12);
      expect(y).toBeLessThanOrEqual(162);
    }
  });

  it.each(LEAF_SHAPES)("%s meets the end of its stem", (shape) => {
    // The card draws the stem out to x 46: its end is inside the blade.
    const polys = polygons(leafGeometry(shape).blade);
    expect(inside(polys, { x: 47, y: MIDRIB })).toBe(true);
  });

  it.each(LEAF_SHAPES)("%s stays light enough to draw on every card", (shape) => {
    expect(leafGeometry(shape).blade.length).toBeLessThan(6500);
  });

  it("measures where a line lands and where the marks hang", () => {
    for (const shape of LEAF_SHAPES) {
      const { top, bottom } = leafGeometry(shape);
      // Above the name and below the last line, at the leaf's middle.
      expect(top).toBeLessThan(62);
      expect(bottom).toBeGreaterThan(101);
    }
    // The flag's maple: its upper lobe stands 8 units above the box where
    // the line lands, its lowest point 161 down.
    expect(leafGeometry("maple").top).toBeCloseTo(-7.8, 0);
    expect(leafGeometry("maple").bottom).toBeCloseTo(160.6, 0);
  });

  it("draws every tree differently", () => {
    const blades = new Set(LEAF_SHAPES.map((s) => leafGeometry(s).blade));
    expect(blades.size).toBe(LEAF_SHAPES.length);
  });

  it("draws the banyan broad and blunt, not as a plain pointed leaf", () => {
    const polys = polygons(leafGeometry("banyan").blade);
    const xs = polys.flat().map((p) => p.x);
    const ys = polys.flat().map((p) => p.y);
    const length = Math.max(...xs) - 38;
    const breadth = Math.max(...ys) - Math.min(...ys);
    expect(breadth / length).toBeGreaterThan(0.55);
    // Ten units short of its tip it is still more than 40 deep: a round end.
    const near = Math.max(...xs) - 10;
    const deep = polys
      .flat()
      .filter((p) => Math.abs(p.x - near) < 2)
      .map((p) => p.y);
    expect(Math.max(...deep) - Math.min(...deep)).toBeGreaterThan(40);
    expect(leafGeometry("banyan").blade).not.toBe(leafGeometry("ovate").blade);
  });
});

describe("each tree's leaf", () => {
  it.each([
    ["India", "banyan"],
    ["Tanzania", "baobab"],
    ["Canada", "maple"],
    ["Mozambique", "mopane"],
    ["Iraq", "palm"],
    ["Switzerland", "spruce"],
    ["Pakistan", "neem"],
    ["Russia", "birch"],
    ["Spain", "holm-oak"],
    ["Japan", "japanese-maple"],
  ] as const)("%s draws a %s leaf", (country, shape) => {
    expect(nativeLeaf({ country_of_birth: country }).shape).toBe(shape);
  });
});
