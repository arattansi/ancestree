import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  NAV_GAP,
  NAV_JUMBLE_SIZE,
  NAV_LIST_SIZE,
  NAV_WORDS,
  navHeldOpenOn,
} from "@/lib/nav-words";

describe("the handwritten navigation", () => {
  it("names the marketing pages in Aalim's order", () => {
    expect(NAV_WORDS.map((w) => [w.label, w.href])).toEqual([
      ["who", "/about-us"],
      ["what + how", "/features"],
      ["why", "/manifesto"],
      ["capitalism", "/pricing"],
      ["shh", "/privacy"],
    ]);
  });

  it("goes only to pages that exist", () => {
    for (const { href } of NAV_WORDS) {
      const page =
        href === "/privacy"
          ? join("app", "privacy", "page.tsx")
          : join("app", "(marketing)", href.slice(1), "page.tsx");
      expect(existsSync(page), href).toBe(true);
    }
  });

  it("keeps every word inside the open menu's box, top to bottom", () => {
    let below = -1;
    for (const w of NAV_WORDS) {
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.x + w.width).toBeLessThanOrEqual(NAV_LIST_SIZE.width);
      expect(w.y + w.height).toBeLessThanOrEqual(NAV_LIST_SIZE.height);
      expect(w.y).toBeGreaterThan(below);
      below = w.y;
    }
  });

  it("spaces the words evenly, the last at the box's foot", () => {
    for (let i = 1; i < NAV_WORDS.length; i++) {
      const above = NAV_WORDS[i - 1];
      expect(NAV_WORDS[i].y - (above.y + above.height), NAV_WORDS[i].id).toBe(NAV_GAP);
    }
    const last = NAV_WORDS[NAV_WORDS.length - 1];
    expect(last.y + last.height).toBe(NAV_LIST_SIZE.height);
  });

  it("piles them in a box as wide and tall as the biggest", () => {
    expect(NAV_JUMBLE_SIZE.width).toBe(Math.max(...NAV_WORDS.map((w) => w.width)));
    expect(NAV_JUMBLE_SIZE.height).toBe(Math.max(...NAV_WORDS.map((w) => w.height)));
  });

  it("stays open on the home page and the marketing pages, not in the app", () => {
    for (const page of ["/", "/about-us", "/features", "/manifesto", "/pricing", "/privacy"]) {
      expect(navHeldOpenOn(page), page).toBe(true);
    }
    for (const page of ["/join", "/family", "/tree", "/account", "/admin", "/pricing/x"]) {
      expect(navHeldOpenOn(page), page).toBe(false);
    }
  });

  it("has an SVG file of each word for use elsewhere", () => {
    for (const { id } of NAV_WORDS) {
      expect(existsSync(join("public", "brand", "nav", `${id}.svg`)), id).toBe(true);
    }
  });
});
