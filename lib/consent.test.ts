import { describe, expect, it } from "vitest";

import {
  CONSENT_KEY,
  CONSENT_REGIONS,
  consentDefaultScript,
  needsConsent,
  readConsentChoice,
} from "@/lib/consent";

describe("consent mode", () => {
  it("asks in the EEA, the UK and Switzerland, and nowhere else", () => {
    for (const c of ["DE", "fr", "IE", "NO", "IS", "GB", "CH"])
      expect(needsConsent(c), c).toBe(true);
    for (const c of ["CA", "US", "IN", "KE", "", null, undefined]) {
      expect(needsConsent(c), String(c)).toBe(false);
    }
    expect(new Set(CONSENT_REGIONS).size).toBe(CONSENT_REGIONS.length);
  });

  it("reads only a real choice", () => {
    expect(readConsentChoice("granted")).toBe("granted");
    expect(readConsentChoice("denied")).toBe("denied");
    expect(readConsentChoice("yes")).toBeNull();
    expect(readConsentChoice(null)).toBeNull();
  });

  it("denies ads signals everywhere and the Analytics cookie in the listed regions", () => {
    const script = consentDefaultScript();
    expect(script).toContain("ad_storage:'denied'");
    expect(script).toContain('region:["AT"');
    expect(script).toContain(CONSENT_KEY);
    expect(script).toContain(
      "analytics_storage:c==='granted'?'granted':'denied'",
    );
  });
});
