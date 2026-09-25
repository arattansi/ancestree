import { describe, expect, it } from "vitest";

import {
  FAMILY_LINK_CAPS,
  FAMILY_LINK_MAX_USES,
  familyLinkCount,
  isFamilyLinkFull,
  parseFamilyLinkCap,
  whatsappShareHref,
} from "@/lib/family-link";

describe("family link cap (Step 52)", () => {
  it("tops out at 20, as private.family_link_max_uses() does", () => {
    expect(FAMILY_LINK_MAX_USES).toBe(20);
    expect(FAMILY_LINK_CAPS[0]).toBe(1);
    expect(FAMILY_LINK_CAPS.at(-1)).toBe(20);
    expect(FAMILY_LINK_CAPS).toHaveLength(20);
  });

  it("takes whole numbers from 1 to 20, typed or not", () => {
    expect(parseFamilyLinkCap(1)).toBe(1);
    expect(parseFamilyLinkCap(20)).toBe(20);
    expect(parseFamilyLinkCap("12")).toBe(12);
    expect(parseFamilyLinkCap(" 7 ")).toBe(7);
  });

  it("refuses anything else", () => {
    expect(parseFamilyLinkCap(0)).toBeNull();
    expect(parseFamilyLinkCap(21)).toBeNull();
    expect(parseFamilyLinkCap(-3)).toBeNull();
    expect(parseFamilyLinkCap(2.5)).toBeNull();
    expect(parseFamilyLinkCap("")).toBeNull();
    expect(parseFamilyLinkCap("ten")).toBeNull();
    expect(parseFamilyLinkCap(null)).toBeNull();
    expect(parseFamilyLinkCap(undefined)).toBeNull();
  });
});

describe("isFamilyLinkFull (Step 52)", () => {
  it("is open while places are left", () => {
    expect(isFamilyLinkFull({ useCount: 0, maxUses: 20 })).toBe(false);
    expect(isFamilyLinkFull({ useCount: 19, maxUses: 20 })).toBe(false);
  });

  it("is full at its cap, or past a cap lowered below the count", () => {
    expect(isFamilyLinkFull({ useCount: 20, maxUses: 20 })).toBe(true);
    expect(isFamilyLinkFull({ useCount: 6, maxUses: 4 })).toBe(true);
  });
});

describe("familyLinkCount (Step 52)", () => {
  it("counts who joined against the cap", () => {
    expect(familyLinkCount({ useCount: 3, maxUses: 20 })).toBe("3 of 20 joined");
  });
});

describe("whatsappShareHref (Step 52)", () => {
  it("opens WhatsApp with the message and link, encoded", () => {
    const href = whatsappShareHref(
      "https://www.ancestree.space/join/abc123",
      "Rattansi & Jiwa",
    );
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(href.slice("https://wa.me/?text=".length))).toBe(
      "Join Rattansi & Jiwa on ancestree: https://www.ancestree.space/join/abc123",
    );
    expect(href).not.toContain("&");
  });
});
