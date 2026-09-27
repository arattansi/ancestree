import { describe, expect, it } from "vitest";

import { isNavActive } from "@/lib/nav-active";

describe("isNavActive", () => {
  it("lights the page itself", () => {
    expect(isNavActive("/tree", "/tree")).toBe(true);
    expect(isNavActive("/tree", "/tree", true)).toBe(true);
  });

  it("lights the pages under it unless exact", () => {
    expect(isNavActive("/tree/review", "/tree")).toBe(true);
    expect(isNavActive("/tree/review", "/tree", true)).toBe(false);
    expect(isNavActive("/account", "/account")).toBe(true);
  });

  it("leaves a page that only starts with the same letters", () => {
    expect(isNavActive("/trees", "/tree")).toBe(false);
    expect(isNavActive("/treehouse", "/tree")).toBe(false);
  });
});
