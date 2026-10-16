import { describe, expect, it } from "vitest";

import {
  canvasTip,
  LINES_FROM_GENERATIONS,
  openingView,
  READABLE_ZOOM,
} from "@/lib/first-canvas";

describe("openingView (Step 169)", () => {
  const self = { x: 300, y: 400 };

  it("keeps the view it would frame anyway on a wide screen", () => {
    const fitted = { x: 10, y: 20, zoom: 0.3 };
    expect(openingView({ fitted, narrow: false, self })).toBe(fitted);
  });

  it("keeps it on a phone too while the names read", () => {
    const fitted = { x: 10, y: 20, zoom: 0.9 };
    expect(openingView({ fitted, narrow: true, self })).toBe(fitted);
    const just = { x: 10, y: 20, zoom: READABLE_ZOOM };
    expect(openingView({ fitted: just, narrow: true, self })).toBe(just);
  });

  it("opens a phone on the viewer, as close as reads, when it would be further out", () => {
    expect(
      openingView({ fitted: { x: 10, y: 20, zoom: 0.4 }, narrow: true, self }),
    ).toEqual({ x: 300, y: 400, zoom: READABLE_ZOOM });
  });

  it("stays on the middle with nobody of theirs to centre on", () => {
    expect(
      openingView({
        fitted: { x: 10, y: 20, zoom: 0.4 },
        narrow: true,
        self: null,
      }),
    ).toEqual({ x: 10, y: 20, zoom: READABLE_ZOOM });
  });

  it("reads at about 10px or more for a leaf's 13px name", () => {
    expect(13 * READABLE_ZOOM).toBeGreaterThanOrEqual(10);
  });
});

describe("canvasTip (Step 169)", () => {
  it("says Click with a mouse and Tap on a touch screen", () => {
    expect(canvasTip({ family: false, touch: false, generations: 2 }).lead).toBe(
      "Click anyone to see their own tree.",
    );
    expect(canvasTip({ family: false, touch: true, generations: 2 }).lead).toBe(
      "Tap anyone to see their own tree.",
    );
    expect(canvasTip({ family: true, touch: false, generations: 2 }).lead).toBe(
      "Click anyone to see how you're connected, and again for their own tree.",
    );
  });

  it("leaves the lines out until there are three generations", () => {
    expect(LINES_FROM_GENERATIONS).toBe(3);
    for (const generations of [0, 1, 2]) {
      expect(
        canvasTip({ family: true, touch: true, generations }).lines,
      ).toBeNull();
    }
    expect(canvasTip({ family: false, touch: true, generations: 3 }).lines).toBe(
      "On a line, tap near the parents for descendants, or near a child for ancestors.",
    );
    expect(canvasTip({ family: false, touch: false, generations: 5 }).lines).toBe(
      "On a line, click near the parents for descendants, or near a child for ancestors.",
    );
  });
});
