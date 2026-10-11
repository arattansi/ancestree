import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NAV_APPLE_SIZE, NAV_MENU_LETTERS } from "@/lib/nav-apples";
import { NAV_TREE, NAV_TREE_SIZE } from "@/lib/nav-tree";

describe("menu, fallen from the tree", () => {
  it("spells menu, left to right", () => {
    expect(NAV_MENU_LETTERS.map((l) => l.char).join("")).toBe("menu");
    for (let i = 1; i < NAV_MENU_LETTERS.length; i++) {
      const before = NAV_MENU_LETTERS[i - 1];
      expect(NAV_MENU_LETTERS[i].x).toBeGreaterThanOrEqual(
        before.x + before.width,
      );
    }
  });

  it("lies under the canopy, at the foot of the tree", () => {
    const canopyBottom = Math.max(
      ...NAV_TREE.filter((w) => w.part === "canopy").map((w) => w.y + w.height),
    );
    for (const l of NAV_MENU_LETTERS) {
      expect(l.y).toBeGreaterThan(canopyBottom);
      expect(l.y + l.height).toBeLessThanOrEqual(NAV_TREE_SIZE.height);
    }
  });

  it("hangs each apple inside the tree, above its letter", () => {
    for (const l of NAV_MENU_LETTERS) {
      expect(l.hang.x).toBeGreaterThanOrEqual(0);
      expect(l.hang.x).toBeLessThanOrEqual(NAV_TREE_SIZE.width);
      expect(l.hang.y + NAV_APPLE_SIZE).toBeLessThan(l.y);
    }
  });

  it("has its drawing in public/brand/nav", () => {
    expect(existsSync(join("public", "brand", "nav", "menu.svg"))).toBe(true);
  });
});
