import { describe, expect, it } from "vitest";

import {
  campaignCounts,
  campaignHref,
  CAMPAIGN_NAME_MAX,
  CAMPAIGN_PLACEMENT_MAX,
  countsAsOpen,
  isCampaignCode,
  readCampaignFields,
} from "@/lib/campaigns";

describe("campaign links", () => {
  it("live under /start", () => {
    expect(campaignHref("0a1b2c3d4e5f")).toBe("/start/0a1b2c3d4e5f");
  });

  it("know their codes", () => {
    expect(isCampaignCode("0a1b2c3d4e5f")).toBe(true);
    expect(isCampaignCode("0A1B2C3D4E5F")).toBe(false);
    expect(isCampaignCode("0a1b2c3d4e")).toBe(false);
    expect(isCampaignCode("../../admin")).toBe(false);
  });
});

describe("readCampaignFields", () => {
  it("trims, and keeps an empty placement as none", () => {
    expect(readCampaignFields("  Instagram   bio ", "  ")).toEqual({
      ok: true,
      name: "Instagram bio",
      placement: null,
    });
    expect(readCampaignFields("Talk", " Toronto library, 4 Oct ")).toEqual({
      ok: true,
      name: "Talk",
      placement: "Toronto library, 4 Oct",
    });
  });

  it("needs a name within the database's limits", () => {
    expect(readCampaignFields("  ", null)).toEqual({ ok: false, error: "Name the link." });
    expect(readCampaignFields(undefined, null).ok).toBe(false);
    expect(readCampaignFields("x".repeat(CAMPAIGN_NAME_MAX), null).ok).toBe(true);
    expect(readCampaignFields("x".repeat(CAMPAIGN_NAME_MAX + 1), null).ok).toBe(false);
    expect(readCampaignFields("x", "y".repeat(CAMPAIGN_PLACEMENT_MAX + 1)).ok).toBe(false);
  });
});

describe("campaignCounts", () => {
  it("says each count, singular or plural", () => {
    expect(campaignCounts({ opens: 0, signups: 0, treesFounded: 0 })).toBe(
      "0 opens · 0 sign-ups · 0 trees",
    );
    expect(campaignCounts({ opens: 1, signups: 1, treesFounded: 1 })).toBe(
      "1 open · 1 sign-up · 1 tree",
    );
    expect(campaignCounts({ opens: 1204, signups: 12, treesFounded: 13 })).toBe(
      "1,204 opens · 12 sign-ups · 13 trees",
    );
  });
});

describe("countsAsOpen", () => {
  const browser =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

  it("counts a person's browser", () => {
    expect(countsAsOpen({ userAgent: browser, purpose: null })).toBe(true);
  });

  it("counts the apps' own in-app browsers", () => {
    for (const ua of [
      `${browser} LinkedInApp`,
      `${browser} Instagram 300.0.0.0 (iPhone14,2; iOS 18_0; en_CA)`,
      `${browser} [FBAN/FBIOS;FBAV/450.0]`,
      `${browser} Twitter for iPhone/10.0`,
    ]) {
      expect(countsAsOpen({ userAgent: ua, purpose: null }), ua).toBe(true);
    }
  });

  it("skips prefetches", () => {
    expect(countsAsOpen({ userAgent: browser, purpose: "prefetch" })).toBe(false);
    expect(countsAsOpen({ userAgent: browser, purpose: "prefetch;prerender" })).toBe(false);
  });

  it("skips link previews and crawlers", () => {
    for (const ua of [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "curl/8.4.0",
    ]) {
      expect(countsAsOpen({ userAgent: ua, purpose: null }), ua).toBe(false);
    }
  });

  it("skips a request with no user agent", () => {
    expect(countsAsOpen({ userAgent: null, purpose: null })).toBe(false);
    expect(countsAsOpen({ userAgent: " ", purpose: null })).toBe(false);
  });
});
