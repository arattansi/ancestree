import { describe, expect, it } from "vitest";

import {
  PICK_IDLE_SECONDS,
  currentTreeCookieOptions,
  isTreeIdCookie,
  renewsPick,
} from "@/lib/current-tree-cookie";

describe("the picked tree's cookie", () => {
  it("lasts two hours from the last visit, not until the browser closes", () => {
    expect(PICK_IDLE_SECONDS).toBe(7200);
    expect(currentTreeCookieOptions()).toMatchObject({
      maxAge: 7200,
      httpOnly: true,
      path: "/",
    });
  });

  it("holds only a tree id", () => {
    expect(isTreeIdCookie("3ece5c10-937e-817a-8394-f1a6834adc7e")).toBe(true);
    expect(isTreeIdCookie(undefined)).toBe(false);
    expect(isTreeIdCookie("")).toBe(false);
    expect(isTreeIdCookie("my-family")).toBe(false);
  });

  it("is renewed on a page's GET, never where it may be set", () => {
    expect(renewsPick("GET", "/")).toBe(true);
    expect(renewsPick("GET", "/tree")).toBe(true);
    expect(renewsPick("GET", "/account")).toBe(true);
    // Server actions, which switch trees.
    expect(renewsPick("POST", "/tree")).toBe(false);
    // The GET routes that switch: a story link, an alert's console button.
    expect(renewsPick("GET", "/stories/s1")).toBe(false);
    expect(renewsPick("GET", "/account/admin")).toBe(false);
  });
});
