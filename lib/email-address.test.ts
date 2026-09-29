import { describe, expect, it } from "vitest";

import { isEmailAddress, MAX_EMAIL_LENGTH } from "@/lib/email-address";

describe("isEmailAddress (Step 77.4)", () => {
  it("takes an address and refuses what isn't one", () => {
    expect(isEmailAddress("aunt.zara@example.co.uk")).toBe(true);
    for (const bad of ["", "aunt", "aunt@", "@example.com", "aunt@example", "a b@example.com"]) {
      expect(isEmailAddress(bad)).toBe(false);
    }
  });

  it("refuses one longer than an address can be", () => {
    const at = "@example.com";
    expect(isEmailAddress("x".repeat(MAX_EMAIL_LENGTH - at.length) + at)).toBe(true);
    expect(isEmailAddress("x".repeat(MAX_EMAIL_LENGTH - at.length + 1) + at)).toBe(false);
  });
});
