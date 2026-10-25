import { describe, expect, it } from "vitest";

import {
  CANDLE,
  CANDLE_HEIGHT,
  CANDLE_XS,
  leafCandles,
  SINK,
} from "@/lib/candles";
import {
  inside,
  LEAF_LINES,
  LEAF_SHAPES,
  leafGeometry,
  polygons,
} from "@/lib/leaf-shapes";

describe("leafCandles", () => {
  it.each(LEAF_SHAPES)("%s holds its candles in the blade", (shape) => {
    const polys = polygons(leafGeometry(shape).blade);
    for (const foot of leafCandles(shape)) {
      // Pressed in under the whole stick: no corner of its foot on air.
      for (const dx of [-CANDLE.width / 2, 0, CANDLE.width / 2]) {
        for (const dy of [-SINK, 0]) {
          expect(inside(polys, { x: foot.x + dx, y: foot.y + dy })).toBe(true);
        }
      }
      // Above the name: a candle never stands in the writing.
      expect(foot.y).toBeLessThan(LEAF_LINES[0].top - 4);
      // And never far above the box, where the phone's parents are.
      expect(foot.y - CANDLE_HEIGHT).toBeGreaterThanOrEqual(-23);
    }
  });

  it("keeps the flames clear of where a parent's line lands", () => {
    // The line lands between 98 and 110 (`leafGeometry`).
    expect(CANDLE_XS[0] - CANDLE.flameWidth / 2).toBeGreaterThan(110 + 10);
    // And the last flame inside the card, short of the next one over.
    expect(CANDLE_XS[2] + CANDLE.flameWidth / 2).toBeLessThan(208);
  });

  it("stands a candle in deeper where a lobe rises above the box", () => {
    // The flag's maple: its upper lobe is where the first candle goes.
    expect(leafCandles("maple")[0].y).toBe(4);
    // A plain leaf's candles stand on its edge.
    const ovate = leafCandles("ovate");
    expect(ovate[0].y).toBeGreaterThan(20);
    expect(ovate[2].y).toBeGreaterThan(ovate[0].y);
  });
});
