import { describe, expect, it } from "vitest";

import {
  asCardInk,
  boxChars,
  INK_BOX_MAX_CHARS,
  draftOf,
  FLAT_PRESSURE,
  inkChars,
  inkOf,
  inkPaths,
  inkPoint,
  inkUpTo,
  INK_MAX_CHARS,
  INK_MAX_POINTS,
  pressed,
  replayTimeline,
  REPLAY_MAX_MS,
  strokePath,
  worthAdding,
  type InkPoint,
  type InkStroke,
} from "@/lib/card-ink";

/** A line across a box, `n` points, `every` ms apart, from `from` ms. */
function line(n: number, from = 0, every = 16, pressure = FLAT_PRESSURE): InkStroke {
  return Array.from({ length: n }, (_, i): InkPoint => [
    0.1 + (0.8 * i) / Math.max(1, n - 1),
    0.5,
    pressure,
    from + i * every,
  ]);
}

describe("inkPoint", () => {
  it("scales a touch to the box's 0–1 units, rounded", () => {
    expect(inkPoint(150, 75, 300, 300, 0.73219, 1234.6)).toEqual([0.5, 0.25, 0.73, 1235]);
    expect(inkPoint(1 / 3, 0, 1, 1, 0.5, 0)[0]).toBe(0.3333);
  });

  it("keeps a touch that strays outside inside the box", () => {
    expect(inkPoint(-20, 400, 300, 300, 0.5, 10)).toEqual([0, 1, 0.5, 10]);
  });

  it("reads a finger that reports no pressure as flat", () => {
    expect(inkPoint(10, 10, 100, 100, 0, 0)[2]).toBe(FLAT_PRESSURE);
    expect(inkPoint(10, 10, 100, 100, Number.NaN, 0)[2]).toBe(FLAT_PRESSURE);
    expect(inkPoint(10, 10, 100, 100, 2, 0)[2]).toBe(1);
  });
});

describe("worthAdding", () => {
  it("drops a point that hasn't moved, and counts the strip's width", () => {
    const stroke: InkStroke = [[0.5, 0.5, 0.5, 0]];
    expect(worthAdding(stroke, [0.5005, 0.5, 0.5, 8], "draw")).toBe(false);
    // The same step across a strip four times as wide is four times as far.
    expect(worthAdding(stroke, [0.5008, 0.5, 0.5, 8], "draw")).toBe(false);
    expect(worthAdding(stroke, [0.5008, 0.5, 0.5, 8], "sign")).toBe(true);
    expect(worthAdding([], [0.1, 0.1, 0.5, 0], "draw")).toBe(true);
  });

  it("stops a stroke at its most points", () => {
    expect(worthAdding(line(INK_MAX_POINTS), [0, 0, 0.5, 99999], "draw")).toBe(false);
  });
});

describe("asCardInk", () => {
  it("takes either box, or both", () => {
    const ink = { draw: [line(3)], sign: [line(2), line(4, 200)] };
    expect(asCardInk(ink)).toEqual(ink);
    expect(asCardInk({ sign: [line(1)] })).toEqual({ sign: [line(1)] });
  });

  it("refuses anything that isn't ink", () => {
    expect(asCardInk(null)).toBeNull();
    expect(asCardInk([])).toBeNull();
    expect(asCardInk({})).toBeNull();
    expect(asCardInk({ doodle: [line(2)] })).toBeNull();
    expect(asCardInk({ draw: [] })).toBeNull();
    expect(asCardInk({ draw: [[]] })).toBeNull();
    expect(asCardInk({ draw: [[[0.1, 0.2, 0.5]]] })).toBeNull();
    expect(asCardInk({ draw: [[[0.1, 1.2, 0.5, 0]]] })).toBeNull();
    expect(asCardInk({ draw: [[[0.1, 0.2, 0.5, -1]]] })).toBeNull();
    expect(asCardInk({ draw: [[["0.1", 0.2, 0.5, 0]]] })).toBeNull();
  });

  it("refuses more than about 200 KB of it", () => {
    const strokes = Array.from({ length: 12 }, (_, i) => line(1000, i * 20000, 16, 0.37));
    expect(inkChars({ draw: strokes })).toBeGreaterThan(INK_MAX_CHARS);
    expect(asCardInk({ draw: strokes })).toBeNull();
    expect(asCardInk({ draw: strokes.slice(0, 3) })).not.toBeNull();
  });
});

describe("each box's share", () => {
  it("leaves room for both boxes under the card's limit", () => {
    const full = Array.from({ length: 4 }, (_, i) => line(1000, i * 20000, 16, 0.37));
    const kept = full.filter((_, i) => boxChars(full.slice(0, i + 1)) <= INK_BOX_MAX_CHARS);
    expect(asCardInk({ draw: kept, sign: kept })).not.toBeNull();
    expect(boxChars([line(2)])).toBe(JSON.stringify([line(2)]).length);
  });
});

describe("a form's boxes", () => {
  it("keeps only the boxes with a line in them", () => {
    expect(inkOf({ draw: null, sign: null })).toBeNull();
    expect(inkOf({ draw: [], sign: null })).toBeNull();
    expect(inkOf({ draw: [line(2)], sign: [] })).toEqual({ draw: [line(2)] });
    expect(draftOf({ sign: [line(2)] })).toEqual({ draw: null, sign: [line(2)] });
    expect(draftOf(null)).toEqual({ draw: null, sign: null });
  });
});

describe("drawing it", () => {
  it("tells a pencil's strokes from a finger's", () => {
    expect(pressed(line(5))).toBe(false);
    expect(pressed([...line(3), [0.9, 0.9, 0.8, 100]])).toBe(true);
  });

  it("makes one closed SVG path a stroke, in the box's own size", () => {
    const d = strokePath(line(6), "draw", 300, 300);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    const xs = d
      .split(" ")
      .filter((v) => /^-?\d/.test(v))
      .map(Number)
      .filter((_, i) => i % 2 === 0);
    // From 0.1 to 0.9 of 300, give or take the pen.
    expect(Math.min(...xs)).toBeGreaterThan(20);
    expect(Math.max(...xs)).toBeLessThan(280);
  });

  it("draws a single touch as a dot, and nothing for nothing", () => {
    expect(strokePath([[0.5, 0.5, 0.5, 0]], "sign", 400, 100)).toMatch(/^M .* Z$/);
    expect(strokePath([], "sign", 400, 100)).toBe("");
    expect(inkPaths([line(2), line(3, 100)], "draw", 100, 100)).toHaveLength(2);
  });
});

describe("writing it out again", () => {
  it("keeps each stroke's own pace and shortens long pauses", () => {
    const { strokes, duration } = replayTimeline([line(3, 0, 50), line(2, 5000, 50)]);
    expect(strokes[0].map((p) => p[3])).toEqual([0, 50, 100]);
    // A five-second pause becomes a short one.
    expect(strokes[1][0][3]).toBeLessThan(400);
    expect(strokes[1][1][3] - strokes[1][0][3]).toBe(50);
    expect(duration).toBe(strokes[1][1][3]);
  });

  it("speeds a long drawing up to fit", () => {
    const long = Array.from({ length: 10 }, (_, i) => line(100, i * 2000, 16));
    const { strokes, duration } = replayTimeline(long);
    expect(duration).toBe(REPLAY_MAX_MS);
    const last = strokes[strokes.length - 1];
    expect(last[last.length - 1][3]).toBeCloseTo(REPLAY_MAX_MS, 5);
  });

  it("has written whole strokes, then part of the one under way", () => {
    const { strokes } = replayTimeline([line(3, 0, 100), line(3, 300, 100)]);
    expect(inkUpTo(strokes, -1)).toEqual([]);
    expect(inkUpTo(strokes, 0)).toEqual([[strokes[0][0]]]);
    expect(inkUpTo(strokes, 150)).toEqual([strokes[0].slice(0, 2)]);
    const second = strokes[1][0][3];
    expect(inkUpTo(strokes, second + 100)).toEqual([strokes[0], strokes[1].slice(0, 2)]);
    expect(inkUpTo(strokes, 1e9)).toEqual(strokes);
  });

  it("takes no time for no ink", () => {
    expect(replayTimeline([])).toEqual({ strokes: [], duration: 0 });
  });
});
