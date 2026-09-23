import { describe, expect, it } from "vitest";

import {
  countsAsView,
  isShareLinkUsable,
  shareLinkState,
  viewerUserAgent,
} from "@/lib/share-links";

const now = new Date("2026-08-31T12:00:00Z");

describe("isShareLinkUsable", () => {
  it("is usable with no revoke and no expiry", () => {
    expect(isShareLinkUsable({ revoked_at: null, expires_at: null }, now)).toBe(
      true,
    );
  });

  it("is usable when expiry is in the future", () => {
    expect(
      isShareLinkUsable(
        { revoked_at: null, expires_at: "2026-09-30T00:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("is not usable once revoked", () => {
    expect(
      isShareLinkUsable(
        { revoked_at: "2026-08-01T00:00:00Z", expires_at: null },
        now,
      ),
    ).toBe(false);
  });

  it("is not usable once expired", () => {
    expect(
      isShareLinkUsable(
        { revoked_at: null, expires_at: "2026-08-30T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
});

describe("shareLinkState", () => {
  it("labels active / revoked / expired", () => {
    expect(
      shareLinkState({ revoked_at: null, expires_at: null }, now),
    ).toBe("active");
    expect(
      shareLinkState({ revoked_at: "2026-08-01T00:00:00Z", expires_at: null }, now),
    ).toBe("revoked");
    expect(
      shareLinkState({ revoked_at: null, expires_at: "2026-01-01T00:00:00Z" }, now),
    ).toBe("expired");
  });
});

describe("countsAsView (Step 33.7)", () => {
  const people: Record<string, string> = {
    "Safari on an iPhone":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    // "CUBOT" ends in "bot": a bare /bot/ would stop counting these relatives.
    "Chrome on a Cubot phone":
      "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Chrome on Windows":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Firefox on a Mac":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0",
    // Tapping the link inside Facebook or Instagram is a person looking.
    "Facebook's in-app browser":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.35.108;FBBV/620117785;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
    "Instagram's in-app browser":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.29.91 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 603449456)",
  };

  const notPeople: Record<string, string> = {
    "iMessage's preview":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
    "WhatsApp's preview": "WhatsApp/2.24.10.78 A",
    "Slack's preview":
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Facebook and Messenger's preview":
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Telegram's preview": "TelegramBot (like TwitterBot)",
    "Discord's preview":
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "Teams and Skype's preview":
      "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5 skype-url-preview@microsoft.com",
    "LinkedIn's preview":
      "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    Googlebot:
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "a headless browser":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36",
    curl: "curl/8.7.1",
    "Node's fetch": "node",
  };

  for (const [who, userAgent] of Object.entries(people)) {
    it(`counts ${who}`, () => {
      expect(countsAsView(userAgent)).toBe(true);
    });
  }

  for (const [what, userAgent] of Object.entries(notPeople)) {
    it(`doesn't count ${what}`, () => {
      expect(countsAsView(userAgent)).toBe(false);
    });
  }

  it("doesn't count a visit with no user agent", () => {
    expect(countsAsView(null)).toBe(false);
    expect(countsAsView("")).toBe(false);
  });
});

describe("viewerUserAgent (Step 41.4)", () => {
  const safari =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

  it("hands on a visit's user agent", () => {
    const visit = new Headers({ "user-agent": safari });
    expect(viewerUserAgent(visit)).toBe(safari);
    expect(countsAsView(viewerUserAgent(visit))).toBe(true);
  });

  it("counts no view for asking to join, whose reply draws the page again", () => {
    const ask = new Headers({ "user-agent": safari, "Next-Action": "7f3a9c" });
    expect(viewerUserAgent(ask)).toBeNull();
    expect(countsAsView(viewerUserAgent(ask))).toBe(false);
  });

  it("has nothing to hand on without a user agent", () => {
    expect(viewerUserAgent(new Headers())).toBeNull();
  });
});
