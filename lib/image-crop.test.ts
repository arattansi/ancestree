import { describe, expect, it } from "vitest";

import {
  cropRect,
  cropStyle,
  parseCrop,
  toStoredCrop,
  DEFAULT_CROP,
  MAX_ZOOM,
  panFocus,
  previewLayout,
} from "@/lib/image-crop";

describe("cropRect", () => {
  it("takes the largest centred square at zoom 1", () => {
    expect(cropRect(1000, 600, DEFAULT_CROP)).toEqual({
      sx: 200,
      sy: 0,
      size: 600,
    });
  });

  it("pins to an edge at focus 0 and 1", () => {
    expect(cropRect(1000, 600, { ...DEFAULT_CROP, focusX: 0 }).sx).toBe(0);
    expect(cropRect(1000, 600, { ...DEFAULT_CROP, focusX: 1 }).sx).toBe(400);
  });

  it("shrinks the source square as zoom grows", () => {
    const { size } = cropRect(1000, 600, { ...DEFAULT_CROP, zoom: 2 });
    expect(size).toBe(300);
  });

  it("never leaves the source bounds", () => {
    const { sx, sy, size } = cropRect(800, 400, {
      zoom: MAX_ZOOM + 5,
      focusX: 2,
      focusY: -1,
    });
    expect(sx + size).toBeLessThanOrEqual(800);
    expect(sy).toBe(0);
  });
});

describe("panFocus", () => {
  it("moves the focus against the drag", () => {
    // 1000x600 source, 600px crop, 300px frame: 400px of horizontal slack.
    const moved = panFocus(0.5, 20, 300, 1000, 600);
    expect(moved).toBeLessThan(0.5);
    expect(moved).toBeCloseTo(0.5 - 40 / 400, 5);
  });

  it("clamps at the edges", () => {
    expect(panFocus(0.5, -10000, 300, 1000, 600)).toBe(1);
    expect(panFocus(0.5, 10000, 300, 1000, 600)).toBe(0);
  });

  it("stays put on an axis with no slack", () => {
    expect(panFocus(0.5, 50, 300, 600, 600)).toBe(0.5);
  });
});

describe("previewLayout", () => {
  it("scales and offsets so the crop fills the frame", () => {
    const layout = previewLayout(1000, 600, 300, DEFAULT_CROP);
    expect(layout).toEqual({ width: 500, height: 300, left: -100, top: -0 });
  });

  it("agrees with cropRect under zoom", () => {
    const t = { zoom: 2, focusX: 0.25, focusY: 0.75 };
    const { sx, sy, size } = cropRect(800, 800, t);
    const layout = previewLayout(800, 800, 200, t);
    const scale = 200 / size;
    expect(layout.left).toBeCloseTo(-sx * scale, 5);
    expect(layout.top).toBeCloseTo(-sy * scale, 5);
  });
});

describe("parseCrop", () => {
  it("defaults a missing or malformed crop to centred", () => {
    expect(parseCrop(null)).toEqual(DEFAULT_CROP);
    expect(parseCrop({ zoom: "2" })).toEqual(DEFAULT_CROP);
  });

  it("reads the stored snake_case shape", () => {
    expect(parseCrop({ zoom: 2, focus_x: 0.25, focus_y: 0.75 })).toEqual({
      zoom: 2,
      focusX: 0.25,
      focusY: 0.75,
    });
  });

  it("clamps out-of-range values from the database", () => {
    expect(parseCrop({ zoom: 99, focus_x: -3, focus_y: 8 })).toEqual({
      zoom: MAX_ZOOM,
      focusX: 0,
      focusY: 1,
    });
  });

  it("round-trips through toStoredCrop", () => {
    const crop = { zoom: 1.5, focusX: 0.2, focusY: 0.8 };
    expect(parseCrop(toStoredCrop(crop))).toEqual(crop);
  });
});

describe("cropStyle", () => {
  it("is a plain centred cover at zoom 1", () => {
    expect(cropStyle(DEFAULT_CROP)).toEqual({
      objectFit: "cover",
      objectPosition: "50% 50%",
    });
  });

  it("scales about the focus point when zoomed", () => {
    expect(cropStyle({ zoom: 2, focusX: 0, focusY: 1 })).toEqual({
      objectFit: "cover",
      objectPosition: "0% 100%",
      transform: "scale(2)",
      transformOrigin: "0% 100%",
    });
  });

  it("frames the same source pixels as cropRect", () => {
    // 1200x600 source in a 300px box: cover shows a 600px-wide window, and the
    // point at `focusX` of that window is the fixed point CSS scales about.
    const t = { zoom: 2, focusX: 0.25, focusY: 0.5 };
    const { sx, size } = cropRect(1200, 600, t);
    const fixedPoint = 1200 * t.focusX; // what transform-origin pins
    expect(sx).toBeCloseTo(fixedPoint - size * t.focusX, 5);
    expect(cropStyle(t).transformOrigin).toBe("25% 50%");
  });
});
