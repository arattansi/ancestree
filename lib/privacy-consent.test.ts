import { describe, expect, it } from "vitest";

import { signInNeedsConsent } from "@/lib/privacy-consent";

describe("signInNeedsConsent", () => {
  it("asks someone joining with a bare invite link to agree", () => {
    expect(signInNeedsConsent("3f9c2a7e-invite-token")).toBe(true);
  });

  it("lets a plain sign-in through without asking", () => {
    expect(signInNeedsConsent(undefined)).toBe(false);
    expect(signInNeedsConsent(null)).toBe(false);
    expect(signInNeedsConsent("")).toBe(false);
  });

  it("takes a blank token as no invite at all", () => {
    expect(signInNeedsConsent("   ")).toBe(false);
  });
});
