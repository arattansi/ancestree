import { describe, expect, it } from "vitest";

import { consentGiven, signInNeedsConsent } from "@/lib/privacy-consent";

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

describe("consentGiven (Step 30.6)", () => {
  function form(consent?: string): FormData {
    const data = new FormData();
    if (consent !== undefined) data.set("consent", consent);
    return data;
  }

  it("takes the ticked box's value, or a form that already had the agreement", () => {
    expect(consentGiven(form("on"))).toBe(true);
    expect(consentGiven(form("true"))).toBe(true);
  });

  it("refuses a form sent without the box ticked", () => {
    expect(consentGiven(form())).toBe(false);
    expect(consentGiven(form(""))).toBe(false);
    expect(consentGiven(form("off"))).toBe(false);
    expect(consentGiven(form("yes"))).toBe(false);
  });
});
