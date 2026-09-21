import { describe, expect, it } from "vitest";

import { fitFontSize } from "@/lib/fit-text";

describe("fitFontSize", () => {
  it("keeps the max size when the text fits", () => {
    expect(fitFontSize(100, 80, 12, 9)).toBe(12);
    expect(fitFontSize(100, 100, 12, 9)).toBe(12);
  });

  it("scales down in proportion, to the half pixel", () => {
    // 12 * 90 / 100 = 10.8 → 10.5
    expect(fitFontSize(90, 100, 12, 9)).toBe(10.5);
  });

  it("never goes below the min", () => {
    expect(fitFontSize(40, 100, 12, 9)).toBe(9);
  });

  it("keeps the max size before the box has been laid out", () => {
    expect(fitFontSize(0, 100, 12, 9)).toBe(12);
    expect(fitFontSize(100, 0, 12, 9)).toBe(12);
  });
});
