import { describe, expect, it } from "vitest";

import {
  isOpenKey,
  OPENS_ASK_AGAIN_DAYS,
  opensForIssue,
  PIXEL_GIF_BASE64,
  shouldAskOpens,
} from "@/lib/newsletter-opens";
import { newsletterOpensHref, newsletterPixelHref } from "@/lib/tree-links";

const NOW = new Date("2026-11-08T15:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("shouldAskOpens", () => {
  it("asks a member who has never been asked, and one with nothing on record", () => {
    expect(shouldAskOpens({ count_opens: false, opens_asked_at: null }, NOW)).toBe(true);
    expect(shouldAskOpens(undefined, NOW)).toBe(true);
  });

  it("never asks one who already said yes", () => {
    expect(shouldAskOpens({ count_opens: true, opens_asked_at: null }, NOW)).toBe(false);
    expect(shouldAskOpens({ count_opens: true, opens_asked_at: daysAgo(400) }, NOW)).toBe(false);
  });

  it("doesn't ask again for about six months: a refusal by silence is kept", () => {
    expect(shouldAskOpens({ count_opens: false, opens_asked_at: daysAgo(7) }, NOW)).toBe(false);
    expect(
      shouldAskOpens({ count_opens: false, opens_asked_at: daysAgo(OPENS_ASK_AGAIN_DAYS - 1) }, NOW),
    ).toBe(false);
    expect(
      shouldAskOpens({ count_opens: false, opens_asked_at: daysAgo(OPENS_ASK_AGAIN_DAYS) }, NOW),
    ).toBe(true);
    expect(shouldAskOpens({ count_opens: false, opens_asked_at: daysAgo(400) }, NOW)).toBe(true);
  });

  it("asks when the time on record isn't one", () => {
    expect(shouldAskOpens({ count_opens: false, opens_asked_at: "soon" }, NOW)).toBe(true);
  });
});

describe("isOpenKey", () => {
  it("wants a UUID", () => {
    expect(isOpenKey("4dd369bc-aa82-4ff3-97de-514ae3000ee0")).toBe(true);
    expect(isOpenKey("4DD369BC-AA82-4FF3-97DE-514AE3000EE0")).toBe(true);
    expect(isOpenKey("4dd369bc-aa82-4ff3-97de-514ae3000ee")).toBe(false);
    expect(isOpenKey("../../etc/passwd")).toBe(false);
    expect(isOpenKey(undefined)).toBe(false);
  });
});

describe("the pixel", () => {
  it("is a one-pixel transparent GIF", () => {
    const bytes = Buffer.from(PIXEL_GIF_BASE64, "base64");
    expect(bytes.subarray(0, 6).toString("ascii")).toBe("GIF89a");
    // Width and height, little-endian: 1 × 1.
    expect(bytes.readUInt16LE(6)).toBe(1);
    expect(bytes.readUInt16LE(8)).toBe(1);
    expect(bytes.length).toBeLessThan(64);
  });

  it("is reached at an address that carries only its key, and the page at its box", () => {
    expect(newsletterPixelHref("4dd369bc-aa82-4ff3-97de-514ae3000ee0")).toBe(
      "/api/newsletter/open/4dd369bc-aa82-4ff3-97de-514ae3000ee0",
    );
    expect(newsletterOpensHref("tok-1")).toBe("/newsletter/tok-1#opens");
  });
});

describe("opensForIssue", () => {
  const base = {
    now: NOW,
    withPixels: true,
    opensUrl: "https://www.ancestree.space/newsletter/tok-1#opens",
    pixelUrl: (k: string) => `https://www.ancestree.space/api/newsletter/open/${k}`,
    newKey: () => "4dd369bc-aa82-4ff3-97de-514ae3000ee0",
  };

  it("asks a member who has said nothing, and notes it asked", () => {
    for (const state of [undefined, { count_opens: false, opens_asked_at: null }]) {
      expect(opensForIssue({ ...base, state })).toEqual({
        opens: { kind: "ask", url: base.opensUrl },
        asked: true,
      });
    }
  });

  it("counts for a member who said yes: the notice, the way to stop, and a key for the image", () => {
    expect(
      opensForIssue({ ...base, state: { count_opens: true, opens_asked_at: daysAgo(10) } }),
    ).toEqual({
      opens: {
        kind: "counting",
        stopUrl: base.opensUrl,
        pixelUrl: "https://www.ancestree.space/api/newsletter/open/4dd369bc-aa82-4ff3-97de-514ae3000ee0",
      },
      key: "4dd369bc-aa82-4ff3-97de-514ae3000ee0",
      asked: false,
    });
  });

  it("makes no key, and no image, where nothing records it", () => {
    const made = opensForIssue({
      ...base,
      withPixels: false,
      state: { count_opens: true, opens_asked_at: null },
    });
    expect(made.key).toBeUndefined();
    expect(made.opens).toEqual({ kind: "counting", stopUrl: base.opensUrl, pixelUrl: undefined });
  });

  it("makes a new key for each copy", () => {
    let n = 0;
    const newKey = () => `key-${++n}`;
    const state = { count_opens: true, opens_asked_at: null };
    expect(opensForIssue({ ...base, newKey, state }).key).toBe("key-1");
    expect(opensForIssue({ ...base, newKey, state }).key).toBe("key-2");
  });

  it("is silent for one who was asked lately and said nothing", () => {
    expect(
      opensForIssue({ ...base, state: { count_opens: false, opens_asked_at: daysAgo(30) } }),
    ).toEqual({ asked: false });
  });

  it("asks again after six months of silence", () => {
    expect(
      opensForIssue({ ...base, state: { count_opens: false, opens_asked_at: daysAgo(200) } }).asked,
    ).toBe(true);
  });

  it("asks and counts nothing when their say couldn't be read", () => {
    expect(opensForIssue({ ...base, state: null })).toEqual({ asked: false });
  });
});
